import { escapeHtml } from '../config.js';
import { state, emit } from '../state.js';
import { speakEnglish } from '../services/tts.js';

/**
 * Global Command Palette (Ctrl+K or /)
 * Fuzzy-searches Visual Cards, Word/Sentence Deck, Groups, and Quick Actions.
 */

let isOpen = false;
let selectedIdx = 0;
let flatItems = [];

export function initCommandPalette({ onSwitchTab, onToggleTheme, onStartAudio, onOpenSettings }) {
    const overlay = document.getElementById('commandPalette');
    if (!overlay) return;

    function buildItems(query) {
        const q = query.trim().toLowerCase();
        const items = [];

        // Quick Actions
        const actions = [
            { kind: 'action', title: '切換到 圖卡工坊', sub: '瀏覽與搜尋視覺單詞卡', tag: '頁面', run: () => onSwitchTab('gallery') },
            { kind: 'action', title: '切換到 單字長句庫', sub: '管理單詞、長句與自動朗讀', tag: '頁面', run: () => onSwitchTab('deck') },
            { kind: 'action', title: '開始 互動測驗 (Study Arena)', sub: '3D 翻轉卡、圖文四選一、聽寫與配對', tag: '測驗', run: () => onSwitchTab('arena') },
            { kind: 'action', title: '開啟 學習洞察統計', sub: '群組分佈、學習連續天數與補齊清單', tag: '洞察', run: () => onSwitchTab('dashboard') },
            { kind: 'action', title: '開啟 新增圖卡工作區', sub: '搜尋圖片、拖放上傳或剪貼簿貼圖', tag: '動作', run: () => { onSwitchTab('gallery'); emit('gallery:openStudio'); } },
            { kind: 'action', title: '開始連續朗讀播放', sub: '啟動底部語音播放列', tag: '音訊', run: () => onStartAudio() },
            { kind: 'action', title: '切換深色 / 淺色主題', sub: 'Midnight Obsidian / Editorial Ivory', tag: '外觀', run: () => onToggleTheme() },
            { kind: 'action', title: '開啟系統設定與備份', sub: 'Supabase 保活、語音、匯出', tag: '設定', run: () => onOpenSettings() }
        ];

        const matchedActions = q
            ? actions.filter((a) => `${a.title} ${a.sub}`.toLowerCase().includes(q))
            : actions.slice(0, 4);

        // Groups
        const matchedGroups = state.groups
            .filter((g) => !q || g.name.toLowerCase().includes(q))
            .slice(0, 6)
            .map((g) => ({
                kind: 'group',
                title: g.name,
                sub: '篩選並隔離此圖卡群組',
                tag: '群組',
                color: g.color,
                run: () => {
                    onSwitchTab('gallery');
                    emit('gallery:isolateGroup', g.id);
                }
            }));

        // Visual Cards
        const matchedVisuals = (q
            ? state.visualCards.filter((c) =>
                c.word.toLowerCase().includes(q) ||
                c.chineseName.toLowerCase().includes(q) ||
                c.explanation.toLowerCase().includes(q)
            )
            : state.visualCards
        ).slice(0, q ? 10 : 4).map((c) => ({
            kind: 'visual',
            title: c.word,
            sub: c.chineseName || c.explanation.slice(0, 60) || '視覺圖卡',
            thumb: c.publicUrl,
            tag: '圖卡',
            run: () => {
                onSwitchTab('gallery');
                emit('gallery:inspectCard', c.fileName);
            }
        }));

        // Deck Cards
        const matchedDeck = (q
            ? state.deckCards.filter((c) =>
                c.english.toLowerCase().includes(q) ||
                c.chinese.toLowerCase().includes(q)
            )
            : state.deckCards
        ).slice(0, q ? 10 : 4).map((c) => ({
            kind: 'deck',
            title: c.english,
            sub: c.chinese,
            tag: c.card_type === 'sentence' ? '長句' : '單詞',
            run: () => {
                onSwitchTab('deck');
                speakEnglish(c.english, {
                    voiceSetting: state.deckSettings.englishTts,
                    rate: state.visualPrefs.speechRate
                });
                emit('deck:search', c.english);
            }
        }));

        if (matchedVisuals.length) {
            items.push({ header: `視覺圖卡 (${matchedVisuals.length})` });
            items.push(...matchedVisuals);
        }
        if (matchedDeck.length) {
            items.push({ header: `單字與長句 (${matchedDeck.length})` });
            items.push(...matchedDeck);
        }
        if (matchedGroups.length) {
            items.push({ header: '群組快速跳轉' });
            items.push(...matchedGroups);
        }
        if (matchedActions.length) {
            items.push({ header: '快速指令' });
            items.push(...matchedActions);
        }

        return items;
    }

    function renderResults(query = '') {
        const listEl = overlay.querySelector('#cmdResultsList');
        if (!listEl) return;

        const structured = buildItems(query);
        flatItems = structured.filter((x) => !x.header);
        if (selectedIdx >= flatItems.length) selectedIdx = Math.max(0, flatItems.length - 1);

        if (flatItems.length === 0) {
            listEl.innerHTML = `<div style="padding:28px;text-align:center;color:var(--text-muted);font-size:13.5px;">找不到符合「${escapeHtml(query)}」的圖卡或單字</div>`;
            return;
        }

        let itemCursor = -1;
        listEl.innerHTML = structured.map((entry) => {
            if (entry.header) {
                return `<div class="cmd-group-title">${escapeHtml(entry.header)}</div>`;
            }
            itemCursor += 1;
            const i = itemCursor;
            const thumbHtml = entry.thumb
                ? `<img class="cmd-item-thumb" src="${escapeHtml(entry.thumb)}" alt="">`
                : entry.color
                    ? `<span class="group-chip-dot" style="background:${escapeHtml(entry.color)};width:14px;height:14px;margin:0 10px;"></span>`
                    : `<span style="width:28px;text-align:center;font-size:15px;">⚡</span>`;

            return `
                <button type="button" class="cmd-item ${i === selectedIdx ? 'selected' : ''}" data-cmd-idx="${i}">
                    <span class="cmd-item-main">
                        ${thumbHtml}
                        <span style="min-width:0;display:flex;flex-direction:column;">
                            <span class="cmd-item-title">${escapeHtml(entry.title)}</span>
                            <span class="cmd-item-sub">${escapeHtml(entry.sub)}</span>
                        </span>
                    </span>
                    <span class="cmd-item-tag">${escapeHtml(entry.tag)}</span>
                </button>
            `;
        }).join('');
    }

    function open() {
        if (isOpen) return;
        isOpen = true;
        selectedIdx = 0;
        overlay.hidden = false;
        overlay.innerHTML = `
            <div class="cmd-panel" role="dialog" aria-modal="true" aria-label="全域快速搜尋">
                <div class="cmd-input-row">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);flex-shrink:0;">
                        <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
                    </svg>
                    <input type="text" id="cmdSearchInput" placeholder="搜尋所有圖卡、單詞、長句、群組或輸入指令…" autocomplete="off">
                    <button type="button" class="btn btn-xs btn-ghost" id="cmdEscBtn">Esc</button>
                </div>
                <div class="cmd-results" id="cmdResultsList"></div>
            </div>
        `;

        const input = overlay.querySelector('#cmdSearchInput');
        renderResults('');
        setTimeout(() => input?.focus(), 20);

        input?.addEventListener('input', () => {
            selectedIdx = 0;
            renderResults(input.value);
        });

        input?.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (flatItems.length) {
                    selectedIdx = (selectedIdx + 1) % flatItems.length;
                    updateSelection();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (flatItems.length) {
                    selectedIdx = (selectedIdx - 1 + flatItems.length) % flatItems.length;
                    updateSelection();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const chosen = flatItems[selectedIdx];
                if (chosen) {
                    close();
                    chosen.run();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        });

        overlay.querySelector('#cmdEscBtn')?.addEventListener('click', close);
        overlay.querySelector('#cmdResultsList')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-cmd-idx]');
            if (!btn) return;
            const chosen = flatItems[Number(btn.dataset.cmdIdx)];
            if (chosen) {
                close();
                chosen.run();
            }
        });
    }

    function updateSelection() {
        overlay.querySelectorAll('.cmd-item').forEach((el) => {
            const match = Number(el.dataset.cmdIdx) === selectedIdx;
            el.classList.toggle('selected', match);
            if (match) el.scrollIntoView({ block: 'nearest' });
        });
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        overlay.hidden = true;
        overlay.innerHTML = '';
    }

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    return { open, close, isOpen: () => isOpen };
}
