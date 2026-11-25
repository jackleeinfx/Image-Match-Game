import {
    ACTIVATE_INTERVAL_MS,
    STORAGE_KEYS,
    SPECIAL_FILE_KEYS,
    getEffectiveConfig,
    isValidImageFileName,
    parseCardFileName,
    sanitizeWordForFile
} from '../config.js';
import { addDeletedMask, getDeletedMaskSet } from './storage.js';

/**
 * Dual-Supabase Client Service
 * Project 1 (imgDb): Storage `images` + Table `flashcard_explanations`
 * Project 2 (cardDb): Table `user_cards` + Table `user_settings`
 */

let imgDb = null;
let cardDb = null;
let activeCfg = getEffectiveConfig();

export function initSupabaseClients() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase JS SDK 未正確載入');
    }
    activeCfg = getEffectiveConfig();
    imgDb = window.supabase.createClient(activeCfg.imageProject.url, activeCfg.imageProject.anonKey);
    cardDb = window.supabase.createClient(activeCfg.deckProject.url, activeCfg.deckProject.anonKey);
    return { imgDb, cardDb };
}

function getClients() {
    if (!imgDb || !cardDb) {
        initSupabaseClients();
    }
    return { imgDb, cardDb, cfg: activeCfg };
}

/* ---------- Keep-Alive Ping (6-day cycle, exact legacy REST pattern) ---------- */

async function pingSingleProject(url, key, table, label) {
    const start = performance.now();
    const cleanUrl = url.replace(/\/+$/, '');
    const endpoint = `${cleanUrl}/rest/v1/${table}?select=id&limit=1`;
    const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Accept: 'application/json'
        },
        cache: 'no-store'
    });
    const ms = Math.round(performance.now() - start);
    if (!res.ok) {
        throw new Error(`${label} HTTP ${res.status}`);
    }
    await res.text();
    return { ok: true, latencyMs: ms, checkedAt: Date.now() };
}

export async function pingAllProjects(force = false) {
    const { cfg } = getClients();
    const lastRaw = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVATE);
    const last = lastRaw ? parseInt(lastRaw, 10) : 0;
    const now = Date.now();

    if (!force && last && now - last < ACTIVATE_INTERVAL_MS) {
        const remainDays = Math.ceil((ACTIVATE_INTERVAL_MS - (now - last)) / (24 * 3600 * 1000));
        return {
            skipped: true,
            lastActivate: last,
            remainDays,
            project1: { ok: true, latencyMs: null, label: '圖卡庫' },
            project2: { ok: true, latencyMs: null, label: '單字庫' }
        };
    }

    const [p1, p2] = await Promise.allSettled([
        pingSingleProject(cfg.imageProject.url, cfg.imageProject.anonKey, cfg.imageProject.table, '圖卡庫'),
        pingSingleProject(cfg.deckProject.url, cfg.deckProject.anonKey, cfg.deckProject.cardsTable, '單字庫')
    ]);

    const project1 = p1.status === 'fulfilled'
        ? { ...p1.value, label: '圖卡庫' }
        : { ok: false, error: p1.reason?.message || '失敗', label: '圖卡庫' };

    const project2 = p2.status === 'fulfilled'
        ? { ...p2.value, label: '單字庫' }
        : { ok: false, error: p2.reason?.message || '失敗', label: '單字庫' };

    if (project1.ok && project2.ok) {
        localStorage.setItem(STORAGE_KEYS.LAST_ACTIVATE, String(now));
    }

    return {
        skipped: false,
        lastActivate: project1.ok && project2.ok ? now : last,
        remainDays: 6,
        project1,
        project2
    };
}

/* ---------- Project 1: Visual Flashcards Vault ---------- */

async function listAllStorageImages() {
    const { imgDb: db, cfg } = getClients();
    const bucket = cfg.imageProject.bucket;
    const all = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
        const { data, error } = await db.storage.from(bucket).list('', {
            limit: pageSize,
            offset,
            sortBy: { column: 'created_at', order: 'desc' }
        });
        if (error) throw error;
        if (!Array.isArray(data) || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        offset += pageSize;
    }

    return all.filter((f) => isValidImageFileName(f.name));
}

async function fetchAllExplanationRows() {
    const { imgDb: db, cfg } = getClients();
    const table = cfg.imageProject.table;
    const all = [];
    let from = 0;
    const step = 1000;

    while (true) {
        const { data, error } = await db
            .from(table)
            .select('id, file_name, word, chinese_name, explanation, created_at, updated_at')
            .range(from, from + step - 1);
        if (error) throw error;
        if (!Array.isArray(data) || data.length === 0) break;
        all.push(...data);
        if (data.length < step) break;
        from += step;
    }
    return all;
}

export async function fetchVisualVault() {
    const { imgDb: db, cfg } = getClients();
    const bucket = cfg.imageProject.bucket;

    const [storageFiles, explanationRows] = await Promise.all([
        listAllStorageImages(),
        fetchAllExplanationRows()
    ]);

    const rowMap = new Map();
    for (const row of explanationRows) {
        if (row?.file_name) {
            rowMap.set(row.file_name, row);
        }
    }

    let groups = [];
    let cardGroups = {};
    let speechRate = null;

    const groupsRow = rowMap.get(SPECIAL_FILE_KEYS.GROUPS);
    if (groupsRow?.explanation) {
        try {
            const parsed = JSON.parse(groupsRow.explanation);
            if (Array.isArray(parsed)) groups = parsed;
        } catch (err) {
            console.warn('解析群組資料失敗:', err);
        }
    }

    const cardGroupsRow = rowMap.get(SPECIAL_FILE_KEYS.CARD_GROUPS);
    if (cardGroupsRow?.explanation) {
        try {
            const parsed = JSON.parse(cardGroupsRow.explanation);
            if (parsed && typeof parsed === 'object') cardGroups = parsed;
        } catch (err) {
            console.warn('解析圖卡群組分配失敗:', err);
        }
    }

    const rateRow = rowMap.get(SPECIAL_FILE_KEYS.SPEECH_RATE);
    if (rateRow?.explanation) {
        const r = parseFloat(rateRow.explanation);
        if (!Number.isNaN(r) && r >= 0.3 && r <= 1.5) {
            speechRate = r;
        }
    }

    const deletedMask = getDeletedMaskSet();
    const visibleFiles = storageFiles.filter((f) => !deletedMask.has(f.name));

    const cards = visibleFiles.map((file) => {
        const parsed = parseCardFileName(file.name, file.created_at);
        const meta = rowMap.get(file.name);
        const { data: urlData } = db.storage.from(bucket).getPublicUrl(file.name);
        return {
            fileName: file.name,
            word: (meta?.word && meta.word.trim()) ? meta.word.trim() : parsed.word,
            chineseName: meta?.chinese_name || '',
            explanation: meta?.explanation || '',
            timestamp: parsed.timestamp,
            createdAt: meta?.created_at || file.created_at || null,
            updatedAt: meta?.updated_at || file.updated_at || null,
            publicUrl: urlData.publicUrl,
            imageFailed: false
        };
    });

    return {
        cards,
        groups,
        cardGroups,
        speechRate,
        totalStorageCount: storageFiles.length,
        maskedCount: storageFiles.length - visibleFiles.length
    };
}

export async function upsertVisualCardData(fileName, word, chineseName = '', explanation = '') {
    const { imgDb: db, cfg } = getClients();
    const safeWord = (word && word.trim()) ? word.trim() : parseCardFileName(fileName).word;

    const { error } = await db
        .from(cfg.imageProject.table)
        .upsert({
            file_name: fileName,
            word: safeWord,
            chinese_name: chineseName ?? '',
            explanation: explanation ?? '',
            updated_at: new Date().toISOString()
        }, { onConflict: 'file_name' });

    if (error) throw error;
    return { fileName, word: safeWord, chineseName: chineseName ?? '', explanation: explanation ?? '' };
}

export async function uploadVisualCard({ blob, word, chineseName = '', explanation = '', groupId = null, currentCardGroups = {} }) {
    const { imgDb: db, cfg } = getClients();
    const timestamp = Date.now();
    const safeWord = sanitizeWordForFile(word);
    const fileName = `${safeWord}_${timestamp}.jpg`;

    const { error: uploadErr } = await db.storage
        .from(cfg.imageProject.bucket)
        .upload(fileName, blob, {
            contentType: 'image/jpeg',
            upsert: true
        });
    if (uploadErr) throw uploadErr;

    const { data: urlData } = db.storage.from(cfg.imageProject.bucket).getPublicUrl(fileName);

    await upsertVisualCardData(fileName, word.trim(), chineseName.trim(), explanation.trim());

    if (groupId) {
        const nextCardGroups = { ...currentCardGroups, [fileName]: groupId };
        await saveCardGroupsCloud(nextCardGroups);
    }

    return {
        fileName,
        word: word.trim(),
        chineseName: chineseName.trim(),
        explanation: explanation.trim(),
        timestamp,
        createdAt: new Date(timestamp).toISOString(),
        updatedAt: new Date(timestamp).toISOString(),
        publicUrl: `${urlData.publicUrl}?fresh=${timestamp}`,
        imageFailed: false
    };
}

export async function deleteVisualCardCloud(fileName) {
    const { imgDb: db, cfg } = getClients();
    let storageWarning = null;

    try {
        const { error } = await db.storage.from(cfg.imageProject.bucket).remove([fileName]);
        if (error) storageWarning = error;
    } catch (err) {
        storageWarning = err;
    }

    try {
        await db.from(cfg.imageProject.table).delete().eq('file_name', fileName);
    } catch (err) {
        console.warn('刪除解釋資料列時出現警告:', err);
    }

    addDeletedMask(fileName);
    return { storageWarning };
}

export async function saveGroupsCloud(groups) {
    const { imgDb: db, cfg } = getClients();
    const { error } = await db
        .from(cfg.imageProject.table)
        .upsert({
            file_name: SPECIAL_FILE_KEYS.GROUPS,
            word: 'groups',
            chinese_name: '',
            explanation: JSON.stringify(groups),
            updated_at: new Date().toISOString()
        }, { onConflict: 'file_name' });
    if (error) throw error;
}

export async function saveCardGroupsCloud(cardGroups) {
    const { imgDb: db, cfg } = getClients();
    const { error } = await db
        .from(cfg.imageProject.table)
        .upsert({
            file_name: SPECIAL_FILE_KEYS.CARD_GROUPS,
            word: 'card_groups',
            chinese_name: '',
            explanation: JSON.stringify(cardGroups),
            updated_at: new Date().toISOString()
        }, { onConflict: 'file_name' });
    if (error) throw error;
}

export async function saveSpeechRateCloud(rate) {
    const { imgDb: db, cfg } = getClients();
    const { error } = await db
        .from(cfg.imageProject.table)
        .upsert({
            file_name: SPECIAL_FILE_KEYS.SPEECH_RATE,
            word: 'speech_rate',
            chinese_name: '',
            explanation: String(rate),
            updated_at: new Date().toISOString()
        }, { onConflict: 'file_name' });
    if (error) throw error;
}

/* ---------- Project 2: Word & Sentence Deck Vault ---------- */

export async function fetchDeckVault() {
    const { cardDb: db, cfg } = getClients();

    const fetchCardsPromise = (async () => {
        const all = [];
        let from = 0;
        const step = 1000;
        while (true) {
            const { data, error } = await db
                .from(cfg.deckProject.cardsTable)
                .select('id, english, chinese, rating, card_type, created_at')
                .order('id', { ascending: false })
                .range(from, from + step - 1);
            if (error) throw error;
            if (!Array.isArray(data) || data.length === 0) break;
            all.push(...data.map((c) => ({
                ...c,
                rating: Number(c.rating) || 0,
                card_type: c.card_type || 'word'
            })));
            if (data.length < step) break;
            from += step;
        }
        return all;
    })();

    const fetchSettingsPromise = (async () => {
        const { data, error } = await db
            .from(cfg.deckProject.settingsTable)
            .select('setting_key, setting_value');
        if (error) throw error;
        const map = {};
        for (const row of data || []) {
            map[row.setting_key] = row.setting_value;
        }
        return map;
    })();

    const [cards, settings] = await Promise.all([fetchCardsPromise, fetchSettingsPromise]);
    return { cards, settings };
}

export async function createDeckCardCloud({ english, chinese, rating = 1, card_type = 'word' }) {
    const { cardDb: db, cfg } = getClients();
    const { data, error } = await db
        .from(cfg.deckProject.cardsTable)
        .insert([{ english, chinese, rating, card_type }])
        .select('id, english, chinese, rating, card_type, created_at');
    if (error) throw error;
    return data?.[0] || { english, chinese, rating, card_type, created_at: new Date().toISOString() };
}

export async function updateDeckCardCloud(card, patch) {
    const { cardDb: db, cfg } = getClients();
    let query = db.from(cfg.deckProject.cardsTable).update(patch);
    if (card.id !== undefined && card.id !== null) {
        query = query.eq('id', card.id);
    } else {
        query = query
            .eq('english', card.english)
            .eq('chinese', card.chinese)
            .eq('card_type', card.card_type || 'word');
    }
    const { data, error } = await query.select('id, english, chinese, rating, card_type, created_at');
    if (error) throw error;
    return data?.[0] || { ...card, ...patch };
}

export async function deleteDeckCardCloud(card) {
    const { cardDb: db, cfg } = getClients();
    let query = db.from(cfg.deckProject.cardsTable).delete();
    if (card.id !== undefined && card.id !== null) {
        query = query.eq('id', card.id);
    } else {
        query = query
            .eq('english', card.english)
            .eq('chinese', card.chinese)
            .eq('card_type', card.card_type || 'word');
    }
    const { error } = await query;
    if (error) throw error;
}

export async function saveUserSettingCloud(key, value) {
    localStorage.setItem(key, String(value));
    try {
        const { cardDb: db, cfg } = getClients();
        const { error } = await db
            .from(cfg.deckProject.settingsTable)
            .upsert({
                setting_key: key,
                setting_value: String(value),
                updated_at: new Date().toISOString()
            }, { onConflict: 'setting_key' });
        if (error) throw error;
    } catch (err) {
        console.warn('保存雲端設定失敗（已保存至本機）:', key, err.message);
    }
}

export function subscribeDeckRealtime(onChange) {
    const { cardDb: db, cfg } = getClients();
    const channel = db
        .channel('lexivault_user_cards_realtime')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: cfg.deckProject.cardsTable
        }, (payload) => {
            onChange(payload);
        })
        .subscribe();

    return () => {
        try {
            db.removeChannel(channel);
        } catch {
            // ignore
        }
    };
}
