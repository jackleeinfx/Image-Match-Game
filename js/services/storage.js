import { DELETED_CARDS_TTL_MS, STORAGE_KEYS } from '../config.js';

/**
 * Local Storage, 24h Deleted Mask, SRS Engine & Export Utilities
 */

export function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

export function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
        console.warn('localStorage write failed:', key, err);
    }
}

/* ---------- 24h Deleted Mask (compatible with legacy deletedFlashcardNames) ---------- */

export function getDeletedMaskEntries() {
    const arr = readJson(STORAGE_KEYS.DELETED_CARDS, []);
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    const fresh = arr.filter((e) => e && e.n && e.t && now - e.t < DELETED_CARDS_TTL_MS);
    if (fresh.length !== arr.length) {
        writeJson(STORAGE_KEYS.DELETED_CARDS, fresh);
    }
    return fresh;
}

export function getDeletedMaskSet() {
    return new Set(getDeletedMaskEntries().map((e) => e.n));
}

export function addDeletedMask(fileName) {
    if (!fileName) return;
    const list = getDeletedMaskEntries().filter((e) => e.n !== fileName);
    list.push({ n: fileName, t: Date.now() });
    writeJson(STORAGE_KEYS.DELETED_CARDS, list);
}

export function removeDeletedMask(fileName) {
    const list = getDeletedMaskEntries().filter((e) => e.n !== fileName);
    writeJson(STORAGE_KEYS.DELETED_CARDS, list);
}

export function clearDeletedMask() {
    localStorage.removeItem(STORAGE_KEYS.DELETED_CARDS);
}

/* ---------- Local SRS & Daily Activity Log ---------- */

const DAY_MS = 24 * 60 * 60 * 1000;
const SRS_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];

export function getTodayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function getSrsMap() {
    return readJson(STORAGE_KEYS.SRS_DATA, {});
}

export function recordReviewResult(cardKey, quality) {
    // quality: 'again' (0) | 'hard' (1) | 'good' (2)
    if (!cardKey) return;
    const srs = getSrsMap();
    const prev = srs[cardKey] || { box: 0, correct: 0, wrong: 0, nextReview: 0, lastReviewed: 0 };

    let nextBox = prev.box || 0;
    let correct = prev.correct || 0;
    let wrong = prev.wrong || 0;

    if (quality === 'again') {
        nextBox = 0;
        wrong += 1;
    } else if (quality === 'hard') {
        nextBox = Math.max(1, nextBox);
        correct += 1;
    } else {
        nextBox = Math.min(SRS_INTERVAL_DAYS.length - 1, nextBox + 1);
        correct += 1;
    }

    const waitDays = SRS_INTERVAL_DAYS[nextBox];
    srs[cardKey] = {
        box: nextBox,
        correct,
        wrong,
        lastReviewed: Date.now(),
        nextReview: quality === 'again' ? Date.now() : Date.now() + waitDays * DAY_MS
    };
    writeJson(STORAGE_KEYS.SRS_DATA, srs);

    // Increment daily study log
    const activity = readJson(STORAGE_KEYS.ACTIVITY_LOG, {});
    const today = getTodayKey();
    activity[today] = (activity[today] || 0) + 1;
    writeJson(STORAGE_KEYS.ACTIVITY_LOG, activity);
}

export function isCardDueForReview(cardKey) {
    const srs = getSrsMap();
    const entry = srs[cardKey];
    if (!entry) return true;
    return entry.nextReview <= Date.now() || entry.wrong > entry.correct;
}

export function getActivitySummary() {
    const activity = readJson(STORAGE_KEYS.ACTIVITY_LOG, {});
    const todayKey = getTodayKey();
    const todayCount = activity[todayKey] || 0;

    // Streak calculation
    let streak = 0;
    const cursor = new Date();
    if (!activity[todayKey]) {
        // Allow active streak if yesterday was studied
        cursor.setDate(cursor.getDate() - 1);
    }
    while (activity[getTodayKey(cursor)] > 0) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }

    // Last 14 days
    const days = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = getTodayKey(d);
        days.push({
            dateKey: key,
            label: `${d.getMonth() + 1}/${d.getDate()}`,
            count: activity[key] || 0
        });
    }

    const totalReviews = Object.values(activity).reduce((sum, n) => sum + (Number(n) || 0), 0);
    return { todayCount, streak, days, totalReviews };
}

export function getMatchBestTime(pairCount) {
    const map = readJson(STORAGE_KEYS.MATCH_BEST, {});
    return map[String(pairCount)] || null;
}

export function saveMatchBestTime(pairCount, seconds) {
    const map = readJson(STORAGE_KEYS.MATCH_BEST, {});
    const key = String(pairCount);
    if (!map[key] || seconds < map[key]) {
        map[key] = seconds;
        writeJson(STORAGE_KEYS.MATCH_BEST, map);
        return true;
    }
    return false;
}

/* ---------- Data Export Helpers ---------- */

function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(val) {
    const s = String(val ?? '');
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

export function exportFullBackupJson({ visualCards, groups, cardGroups, deckCards, deckSettings }) {
    const payload = {
        exportedAt: new Date().toISOString(),
        app: 'LexiVault Studio',
        visualVault: {
            totalCards: visualCards.length,
            groups,
            cardGroups,
            cards: visualCards.map(({ fileName, word, chineseName, explanation, publicUrl, timestamp }) => ({
                fileName,
                word,
                chineseName,
                explanation,
                publicUrl,
                timestamp,
                groupId: cardGroups[fileName] || null
            }))
        },
        deckVault: {
            totalCards: deckCards.length,
            settings: deckSettings,
            cards: deckCards
        }
    };
    const dateTag = getTodayKey();
    downloadTextFile(`lexivault-backup-${dateTag}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
}

export function exportGalleryCsv(visualCards, groups, cardGroups) {
    const groupMap = new Map(groups.map((g) => [g.id, g.name]));
    const rows = [
        ['FileName', 'Word', 'ChineseName', 'Explanation', 'Group', 'ImageURL'].map(csvEscape).join(',')
    ];
    for (const c of visualCards) {
        const gName = groupMap.get(cardGroups[c.fileName]) || '';
        rows.push([c.fileName, c.word, c.chineseName, c.explanation, gName, c.publicUrl].map(csvEscape).join(','));
    }
    downloadTextFile(`lexivault-visual-cards-${getTodayKey()}.csv`, '\uFEFF' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}

export function exportDeckCsv(deckCards) {
    const rows = [
        ['ID', 'Type', 'English', 'Chinese', 'Rating', 'CreatedAt'].map(csvEscape).join(',')
    ];
    for (const c of deckCards) {
        rows.push([c.id ?? '', c.card_type || 'word', c.english, c.chinese, c.rating || 0, c.created_at || ''].map(csvEscape).join(','));
    }
    downloadTextFile(`lexivault-deck-${getTodayKey()}.csv`, '\uFEFF' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}

export function exportAnkiTsv(visualCards, deckCards) {
    const cleanTsv = (s) => String(s ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
    const lines = ['#separator:tab', '#html:true', '#tags column:3'];
    for (const c of deckCards) {
        const tag = c.card_type === 'sentence' ? 'lexivault_sentence' : 'lexivault_word';
        lines.push(`${cleanTsv(c.english)}\t${cleanTsv(c.chinese)}\t${tag}`);
    }
    for (const v of visualCards) {
        const backParts = [v.chineseName, v.explanation].filter(Boolean).join('<br><br>');
        const front = `<img src="${v.publicUrl}"><br><b>${cleanTsv(v.word)}</b>`;
        lines.push(`${front}\t${cleanTsv(backParts || v.word)}\tlexivault_visual`);
    }
    downloadTextFile(`lexivault-anki-${getTodayKey()}.txt`, lines.join('\n'), 'text/plain;charset=utf-8');
}
