import { debounce, escapeHtml } from '../config.js';
import { state, emit, subscribe } from '../state.js';
import {
    createDeckCardCloud,
    deleteDeckCardCloud,
    saveUserSettingCloud,
    updateDeckCardCloud
} from '../services/supabase.js';
import { isChineseText, smartTranslatePair } from '../services/translate.js';
import { speakEnglish } from '../services/tts.js';
import { getDeckCardKey } from '../components/audioDock.js';
import { openConfirmModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

/**
 * View 2: Word & Sentence Deck (Project 2)
 */

export function initDeckView({ audioDock, onSwitchTab }) {
    const root = document.getElementById('view-deck');
    if (!root) return {};

    let newRating = 1;
    let editingKey = null;

    root.innerHTML = `
        <div class="glass-panel deck-composer" id="dkComposer">
            <div class="composer-top">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-weight:700;font-size:14.5px;">✨ 快速新增單字 / 長句</span>
                    <div class="segmented" id="dkNewTypeSeg">
                        <button type="button" data-ctype="word" class="active">單詞</button>
                        <button type="button" data-ctype="sentence">長句</button>
                    </div>
                    <span id="dkTypeHint" style="font-size:12px;color:var(--accent-cyan);" hidden>💡 偵測為較長句子，建議切換為「長句」</span>
                </div>
                <div class="star-picker" id="dkNewStars" title="點擊設定星級（雙擊歸零）">
                    <button type="button" class="star-btn filled" data-star="1">★</button>
                    <button type="button" class="star-btn" data-star="2">★</button>
                    <button type="button" class="star-btn" data-star="3">★</button>
                </div>
            </div>

            <div class="composer-inputs">
                <div class="composer-field-wrap">
                    <textarea id="dkEnInput" placeholder="輸入英文或中文（支援自動辨識翻譯）…" rows="1"></textarea>
                    <button type="button" class="composer-inline-btn" id="dkPasteBtn">貼上</button>
                </div>
                <button type="button" class="composer-swap-btn" id="dkSwapBtn" title="交換兩欄內容">⇄</button>
                <div class="composer-field-wrap">
                    <textarea id="dkZhInput" placeholder="翻譯結果或中文釋義（可自行微調）…" rows="1"></textarea>
                    <button type="button" class="composer-inline-btn" id="dkCopyBtn">複製</button>
                </div>
            </div>

            <div class="duplicate-hint" id="dkDupHint" hidden></div>

            <div class="composer-bottom">
                <span style="font-size:12px;color:var(--text-muted);">快捷鍵：<code>Ctrl + Enter</code> 直接新增卡片</span>
                <div style="display:flex;align-items:center;gap:8px;">
                    <button type="button" class="btn btn-ghost btn-sm" id="dkTranslateBtn">🌐 翻譯</button>
                    <button type="button" class="btn btn-primary btn-sm" id="dkAddBtn">＋ 新增單字卡</button>
                </div>
            </div>
        </div>

        <div class="glass-panel deck-toolbar">
            <div class="toolbar-row">
                <div class="search-box">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
                    </svg>
                    <input type="text" id="dkSearchInput" placeholder="搜尋英文單字、句子或中文翻譯…" autocomplete="off">
                    <button type="button" class="search-clear-btn" id="dkSearchClearBtn" hidden>&times;</button>
                </div>

                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <button type="button" class="btn btn-emerald btn-sm" id="dkPlayAllBtn">🎧 連續朗讀</button>
                    <button type="button" class="btn btn-ghost btn-sm" id="dkToggleComposerBtn">收合新增區</button>
                </div>
            </div>

            <div class="deck-filter-row">
                <div class="segmented" id="dkTypeFilterSeg">
                    <button type="button" data-tf="all" class="active">全部</button>
                    <button type="button" data-tf="word">單詞</button>
                    <button type="button" data-tf="sentence">長句</button>
                </div>

                <div class="segmented" id="dkStarFilterSeg">
                    <button type="button" data-sf="all" class="active">全部星級</button>
                    <button type="button" data-sf="3">★★★</button>
                    <button type="button" data-sf="2">★★+</button>
                    <button type="button" data-sf="1">★+</button>
                </div>

                <div class="segmented" id="dkDisplayModeSeg">
                    <button type="button" data-dm="all" class="active">顯示全部</button>
                    <button type="button" data-dm="english">只看英文</button>
                    <button type="button" data-dm="chinese">只看中文</button>
                </div>

                <select id="dkSortSelect" class="field-select" style="width:auto;padding:5px 10px;font-size:12.5px;">
                    <option value="time">⏰ 最新在前</option>
                    <option value="rating">⭐ 按星級高到低</option>
                    <option value="alphabet">🔤 按字母 A→Z</option>
                </select>

                <button type="button" class="btn btn-ghost btn-xs" id="dkShuffleBtn">🎲 隨機排列</button>
            </div>
        </div>

        <div class="gallery-meta-bar">
            <span id="dkMetaCount">載入中…</span>
            <span>單擊卡片揭示隱藏面 · 雙擊發音 · 點擊徽章切換單詞/長句</span>
        </div>

        <div class="deck-grid" id="dkGrid"></div>
    `;

    const els = {
        composer: root.querySelector('#dkComposer'),
        toggleComposerBtn: root.querySelector('#dkToggleComposerBtn'),
        newTypeSeg: root.querySelector('#dkNewTypeSeg'),
        typeHint: root.querySelector('#dkTypeHint'),
        newStars: root.querySelector('#dkNewStars'),
        enInput: root.querySelector('#dkEnInput'),
        zhInput: root.querySelector('#dkZhInput'),
        pasteBtn: root.querySelector('#dkPasteBtn'),
        copyBtn: root.querySelector('#dkCopyBtn'),
        swapBtn: root.querySelector('#dkSwapBtn'),
        dupHint: root.querySelector('#dkDupHint'),
        translateBtn: root.querySelector('#dkTranslateBtn'),
        addBtn: root.querySelector('#dkAddBtn'),
        searchInput: root.querySelector('#dkSearchInput'),
        searchClearBtn: root.querySelector('#dkSearchClearBtn'),
        playAllBtn: root.querySelector('#dkPlayAllBtn'),
        typeFilterSeg: root.querySelector('#dkTypeFilterSeg'),
        starFilterSeg: root.querySelector('#dkStarFilterSeg'),
        displayModeSeg: root.querySelector('#dkDisplayModeSeg'),
        sortSelect: root.querySelector('#dkSortSelect'),
        shuffleBtn: root.querySelector('#dkShuffleBtn'),
        metaCount: root.querySelector('#dkMetaCount'),
        grid: root.querySelector('#dkGrid')
    };

    function autoSize(ta) {
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(180, ta.scrollHeight)}px`;
    }

    function updateStarPickerUI() {
        els.newStars.querySelectorAll('.star-btn').forEach((btn) => {
            btn.classList.toggle('filled', Number(btn.dataset.star) <= newRating);
        });
    }

    function syncControlsUI() {
        const s = state.deckSettings;
        const showComposer = s.hideAddCard !== 'false';
        els.composer.hidden = !showComposer;
        els.toggleComposerBtn.textContent = showComposer ? '收合新增區' : '＋ 展開新增區';

        els.newTypeSeg.querySelectorAll('[data-ctype]').forEach((b) => {
            b.classList.toggle('active', b.dataset.ctype === (s.cardType || 'word'));
        });

        const totalAll = state.deckCards.length;
        const wordCount = state.deckCards.filter((c) => (c.card_type || 'word') === 'word').length;
        const sentCount = state.deckCards.filter((c) => c.card_type === 'sentence').length;

        els.typeFilterSeg.querySelector('[data-tf="all"]').textContent = `全部 (${totalAll})`;
        els.typeFilterSeg.querySelector('[data-tf="word"]').textContent = `單詞 (${wordCount})`;
        els.typeFilterSeg.querySelector('[data-tf="sentence"]').textContent = `長句 (${sentCount})`;

        els.typeFilterSeg.querySelectorAll('[data-tf]').forEach((b) => {
            b.classList.toggle('active', b.dataset.tf === (s.typeFilter || 'all'));
        });

        els.starFilterSeg.querySelectorAll('[data-sf]').forEach((b) => {
            b.classList.toggle('active', b.dataset.sf === state.deckFilters.starFilter);
        });

        els.displayModeSeg.querySelectorAll('[data-dm]').forEach((b) => {
            b.classList.toggle('active', b.dataset.dm === (s.displayMode || 'all'));
        });

        els.grid.classList.remove('mode-all', 'mode-english', 'mode-chinese');
        els.grid.classList.add(`mode-${s.displayMode || 'all'}`);

        els.sortSelect.value = s.sortMode === 'shuffle' ? 'time' : (s.sortMode || 'time');
    }

    function getFilteredCards() {
        const s = state.deckSettings;
        const f = state.deckFilters;
        const q = f.searchQuery.trim().toLowerCase();

        let list = state.deckCards.filter((c) => {
            if (s.typeFilter === 'word' && (c.card_type || 'word') !== 'word') return false;
            if (s.typeFilter === 'sentence' && c.card_type !== 'sentence') return false;

            if (f.starFilter !== 'all') {
                const minStar = Number(f.starFilter);
                if ((c.rating || 0) < minStar) return false;
            }

            if (q) {
                const hay = `${c.english}\n${c.chinese}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        if (s.sortMode === 'shuffle' && Array.isArray(f.shuffledOrder)) {
            const idxMap = new Map(f.shuffledOrder.map((k, i) => [k, i]));
            list = [...list].sort((a, b) => (idxMap.get(getDeckCardKey(a)) ?? 99999) - (idxMap.get(getDeckCardKey(b)) ?? 99999));
        } else if (s.sortMode === 'rating') {
            list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0));
        } else if (s.sortMode === 'alphabet') {
            list = [...list].sort((a, b) => a.english.localeCompare(b.english, 'en', { sensitivity: 'base' }));
        } else {
            list = [...list].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
        }

        return list;
    }

    function buildCardHtml(card) {
        const key = getDeckCardKey(card);
        const isEditing = editingKey === key;
        const isSentence = card.card_type === 'sentence' || card.english.length > 52;
        const isPlayingNow = state.audioPlayer.activeCardKey === key;
        const maxStars = Math.max(3, Math.min(5, card.rating || 0));

        if (isEditing) {
            return `
                <article class="deck-card editing ${isSentence ? 'is-sentence' : ''}" data-key="${escapeHtml(key)}">
                    <div class="form-field">
                        <label>英文</label>
                        <textarea class="field-textarea" data-edit-en style="min-height:64px;">${escapeHtml(card.english)}</textarea>
                    </div>
                    <div class="form-field">
                        <label>中文</label>
                        <textarea class="field-textarea" data-edit-zh style="min-height:64px;">${escapeHtml(card.chinese)}</textarea>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;">
                        <button type="button" class="btn btn-xs btn-ghost" data-act="edit-cancel">取消</button>
                        <button type="button" class="btn btn-xs btn-primary" data-act="edit-save">儲存變更</button>
                    </div>
                </article>
            `;
        }

        const starsHtml = Array.from({ length: maxStars }, (_, i) => {
            const val = i + 1;
            return `<button type="button" class="star-btn ${val <= (card.rating || 0) ? 'filled' : ''}" data-act="set-star" data-star="${val}" title="設為 ${val} 星">★</button>`;
        }).join('');

        return `
            <article class="deck-card ${isSentence ? 'is-sentence' : ''} ${isPlayingNow ? 'playing-now' : ''}" data-key="${escapeHtml(key)}">
                <div class="deck-card-head">
                    <button type="button" class="deck-type-badge ${card.card_type === 'sentence' ? 'sentence' : 'word'}" data-act="toggle-type" title="點擊切換 單詞 / 長句">
                        ${card.card_type === 'sentence' ? '長句' : '單詞'}
                    </button>
                    <div class="deck-card-tools">
                        <button type="button" class="deck-tool-btn" data-act="speak" title="朗讀發音">🔊</button>
                        <button type="button" class="deck-tool-btn" data-act="find-img" title="在圖卡工坊找配圖">🖼️</button>
                        <button type="button" class="deck-tool-btn" data-act="edit" title="編輯內容">✎</button>
                        <button type="button" class="deck-tool-btn danger" data-act="delete" title="刪除卡片">×</button>
                    </div>
                </div>
                <div class="deck-en">${escapeHtml(card.english)}</div>
                <div class="deck-zh">${escapeHtml(card.chinese)}</div>
                <div class="deck-card-foot">
                    <div class="deck-stars">${starsHtml}</div>
                </div>
            </article>
        `;
    }

    function renderGrid() {
        syncControlsUI();
        const cards = getFilteredCards();
        els.metaCount.textContent = `顯示 ${cards.length} / ${state.deckCards.length} 張卡片`;

        if (state.loading.deck && state.deckCards.length === 0) {
            els.grid.innerHTML = Array.from({ length: 6 }).map(() => `
                <div class="deck-card" style="height:140px;">
                    <div class="skeleton" style="height:22px;width:55%;border-radius:6px;"></div>
                    <div class="skeleton" style="height:18px;width:75%;border-radius:6px;"></div>
                </div>
            `).join('');
            return;
        }

        if (cards.length === 0) {
            els.grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📚</div>
                    <h3>沒有符合條件的單字或長句</h3>
                    <p>調整篩選條件或使用上方輸入區快速新增單字與例句。</p>
                </div>
            `;
            return;
        }

        els.grid.innerHTML = cards.map(buildCardHtml).join('');
    }

    /* ---------- Composer Actions ---------- */

    function checkDuplicateAndTypeHint() {
        const val = els.enInput.value.trim();
        const words = val ? val.split(/\s+/).length : 0;
        els.typeHint.hidden = !(words >= 4 && state.deckSettings.cardType !== 'sentence');

        if (!val) {
            els.dupHint.hidden = true;
            return;
        }
        const q = val.toLowerCase();
        const dup = state.deckCards.find((c) => c.english.toLowerCase() === q || c.chinese.toLowerCase() === q);
        if (dup) {
            els.dupHint.hidden = false;
            els.dupHint.textContent = `⚠️ 資料庫已存在相似內容：${dup.english} — ${dup.chinese}`;
        } else {
            els.dupHint.hidden = true;
        }
    }

    els.enInput.addEventListener('input', () => {
        autoSize(els.enInput);
        checkDuplicateAndTypeHint();
    });
    els.zhInput.addEventListener('input', () => autoSize(els.zhInput));

    els.pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text.trim()) {
                showToast('剪貼簿沒有文字內容', { type: 'warning' });
                return;
            }
            els.enInput.value = text.trim();
            autoSize(els.enInput);
            checkDuplicateAndTypeHint();
        } catch {
            showToast('請允許瀏覽器存取剪貼簿', { type: 'error' });
        }
    });

    els.copyBtn.addEventListener('click', async () => {
        const txt = els.zhInput.value.trim();
        if (!txt) return;
        await navigator.clipboard.writeText(txt);
        showToast('已複製譯文', { type: 'success', duration: 1400 });
    });

    els.swapBtn.addEventListener('click', () => {
        const a = els.enInput.value;
        els.enInput.value = els.zhInput.value;
        els.zhInput.value = a;
        autoSize(els.enInput);
        autoSize(els.zhInput);
        checkDuplicateAndTypeHint();
    });

    els.newStars.addEventListener('click', (e) => {
        const btn = e.target.closest('.star-btn');
        if (!btn) return;
        newRating = Number(btn.dataset.star);
        updateStarPickerUI();
    });
    els.newStars.addEventListener('dblclick', () => {
        newRating = 0;
        updateStarPickerUI();
    });

    els.newTypeSeg.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ctype]');
        if (!btn) return;
        const t = btn.dataset.ctype;
        state.deckSettings.cardType = t;
        state.deckSettings.typeFilter = t;
        saveUserSettingCloud('cardType', t);
        saveUserSettingCloud('typeFilter', t);
        checkDuplicateAndTypeHint();
        renderGrid();
    });

    async function handleTranslateComposer() {
        const src = els.enInput.value.trim();
        if (!src) {
            showToast('請先輸入要翻譯的文字', { type: 'warning' });
            els.enInput.focus();
            return;
        }
        els.translateBtn.disabled = true;
        els.translateBtn.textContent = '翻譯中…';
        try {
            const res = await smartTranslatePair(src);
            if (res.sourceLang === 'zh') {
                els.enInput.value = res.english;
                els.zhInput.value = res.chinese;
            } else {
                els.zhInput.value = res.chinese;
            }
            autoSize(els.enInput);
            autoSize(els.zhInput);
            checkDuplicateAndTypeHint();
        } catch (err) {
            showToast(`翻譯失敗：${err.message}`, { type: 'error' });
        } finally {
            els.translateBtn.disabled = false;
            els.translateBtn.textContent = '🌐 翻譯';
        }
    }

    async function handleAddCard() {
        let en = els.enInput.value.trim();
        let zh = els.zhInput.value.trim();
        if (!en || !zh) {
            showToast('請填寫英文與中文，或先按「翻譯」產生釋義', { type: 'warning' });
            return;
        }
        // Normalize order if user typed Chinese in left box and English in right box
        if (isChineseText(en) && !isChineseText(zh)) {
            [en, zh] = [zh, en];
        }
        els.addBtn.disabled = true;
        els.addBtn.textContent = '儲存中…';
        try {
            const created = await createDeckCardCloud({
                english: en,
                chinese: zh,
                rating: newRating,
                card_type: state.deckSettings.cardType || 'word'
            });
            state.deckCards.unshift(created);
            localStorage.setItem('flashcards', JSON.stringify(state.deckCards));
            els.enInput.value = '';
            els.zhInput.value = '';
            autoSize(els.enInput);
            autoSize(els.zhInput);
            newRating = 1;
            updateStarPickerUI();
            els.dupHint.hidden = true;
            els.typeHint.hidden = true;
            emit('vault:changed');
            renderGrid();
            showToast('單字卡已新增並同步雲端', { type: 'success' });
        } catch (err) {
            showToast(`新增失敗：${err.message}`, { type: 'error' });
        } finally {
            els.addBtn.disabled = false;
            els.addBtn.textContent = '＋ 新增單字卡';
        }
    }

    els.translateBtn.addEventListener('click', handleTranslateComposer);
    els.addBtn.addEventListener('click', handleAddCard);
    els.composer.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            handleAddCard();
        }
    });

    /* ---------- Toolbar Events ---------- */

    els.toggleComposerBtn.addEventListener('click', () => {
        const next = state.deckSettings.hideAddCard === 'false' ? 'true' : 'false';
        state.deckSettings.hideAddCard = next;
        saveUserSettingCloud('hideAddCard', next);
        syncControlsUI();
    });

    els.searchInput.addEventListener('input', debounce(() => {
        state.deckFilters.searchQuery = els.searchInput.value;
        els.searchClearBtn.hidden = !els.searchInput.value;
        renderGrid();
    }, 120));

    els.searchClearBtn.addEventListener('click', () => {
        els.searchInput.value = '';
        els.searchClearBtn.hidden = true;
        state.deckFilters.searchQuery = '';
        renderGrid();
    });

    els.typeFilterSeg.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tf]');
        if (!btn) return;
        state.deckSettings.typeFilter = btn.dataset.tf;
        saveUserSettingCloud('typeFilter', btn.dataset.tf);
        renderGrid();
    });

    els.starFilterSeg.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-sf]');
        if (!btn) return;
        state.deckFilters.starFilter = btn.dataset.sf;
        renderGrid();
    });

    els.displayModeSeg.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-dm]');
        if (!btn) return;
        state.deckSettings.displayMode = btn.dataset.dm;
        saveUserSettingCloud('displayMode', btn.dataset.dm);
        renderGrid();
    });

    els.sortSelect.addEventListener('change', () => {
        state.deckSettings.sortMode = els.sortSelect.value;
        state.deckFilters.shuffledOrder = null;
        saveUserSettingCloud('sortMode', els.sortSelect.value);
        renderGrid();
    });

    els.shuffleBtn.addEventListener('click', () => {
        const keys = state.deckCards.map(getDeckCardKey);
        for (let i = keys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [keys[i], keys[j]] = [keys[j], keys[i]];
        }
        state.deckSettings.sortMode = 'shuffle';
        state.deckFilters.shuffledOrder = keys;
        renderGrid();
        showToast('已隨機洗牌單字卡', { type: 'info', duration: 1400 });
    });

    els.playAllBtn.addEventListener('click', () => {
        const cards = getFilteredCards();
        audioDock.startQueue(cards, 0);
    });

    /* ---------- Card Grid Delegation ---------- */

    els.grid.addEventListener('dblclick', (e) => {
        if (e.target.closest('button, textarea')) return;
        const cardEl = e.target.closest('.deck-card');
        if (!cardEl || cardEl.classList.contains('editing')) return;
        const card = state.deckCards.find((c) => getDeckCardKey(c) === cardEl.dataset.key);
        if (card) {
            speakEnglish(card.english, {
                voiceSetting: state.deckSettings.englishTts,
                rate: state.visualPrefs.speechRate
            });
        }
    });

    els.grid.addEventListener('click', async (e) => {
        const cardEl = e.target.closest('.deck-card');
        if (!cardEl) return;
        const key = cardEl.dataset.key;
        const idx = state.deckCards.findIndex((c) => getDeckCardKey(c) === key);
        const card = idx >= 0 ? state.deckCards[idx] : null;
        if (!card) return;

        const actEl = e.target.closest('[data-act]');
        if (actEl) {
            e.stopPropagation();
            const act = actEl.dataset.act;

            if (act === 'speak') {
                speakEnglish(card.english, {
                    voiceSetting: state.deckSettings.englishTts,
                    rate: state.visualPrefs.speechRate
                });
            } else if (act === 'find-img') {
                onSwitchTab('gallery');
                emit('gallery:searchImage', card.english);
            } else if (act === 'toggle-type') {
                const nextType = card.card_type === 'sentence' ? 'word' : 'sentence';
                try {
                    await updateDeckCardCloud(card, { card_type: nextType });
                    card.card_type = nextType;
                    localStorage.setItem('flashcards', JSON.stringify(state.deckCards));
                    renderGrid();
                } catch (err) {
                    showToast(`切換分類失敗：${err.message}`, { type: 'error' });
                }
            } else if (act === 'set-star') {
                const clickedStar = Number(actEl.dataset.star);
                const nextRating = card.rating === clickedStar && clickedStar === 1 ? 0 : clickedStar;
                try {
                    await updateDeckCardCloud(card, { rating: nextRating });
                    card.rating = nextRating;
                    localStorage.setItem('flashcards', JSON.stringify(state.deckCards));
                    renderGrid();
                } catch (err) {
                    showToast(`更新星級失敗：${err.message}`, { type: 'error' });
                }
            } else if (act === 'edit') {
                editingKey = key;
                renderGrid();
                const enTa = els.grid.querySelector(`[data-key="${CSS.escape(key)}"] [data-edit-en]`);
                enTa?.focus();
            } else if (act === 'edit-cancel') {
                editingKey = null;
                renderGrid();
            } else if (act === 'edit-save') {
                const nextEn = cardEl.querySelector('[data-edit-en]')?.value.trim();
                const nextZh = cardEl.querySelector('[data-edit-zh]')?.value.trim();
                if (!nextEn || !nextZh) {
                    showToast('英文與中文都必須填寫', { type: 'warning' });
                    return;
                }
                try {
                    const updated = await updateDeckCardCloud(card, { english: nextEn, chinese: nextZh });
                    state.deckCards[idx] = { ...card, ...updated };
                    localStorage.setItem('flashcards', JSON.stringify(state.deckCards));
                    editingKey = null;
                    emit('vault:changed');
                    renderGrid();
                    showToast('卡片已更新', { type: 'success' });
                } catch (err) {
                    showToast(`更新失敗：${err.message}`, { type: 'error' });
                }
            } else if (act === 'delete') {
                const ok = await openConfirmModal({
                    title: '刪除單字卡',
                    message: `確定要刪除「${card.english} — ${card.chinese}」嗎？`,
                    confirmLabel: '確定刪除',
                    danger: true
                });
                if (ok) {
                    try {
                        await deleteDeckCardCloud(card);
                        state.deckCards.splice(idx, 1);
                        localStorage.setItem('flashcards', JSON.stringify(state.deckCards));
                        emit('vault:changed');
                        renderGrid();
                        showToast('單字卡已刪除', { type: 'success' });
                    } catch (err) {
                        showToast(`刪除失敗：${err.message}`, { type: 'error' });
                    }
                }
            }
            return;
        }

        // Single click reveals hidden translation/word
        if (!cardEl.classList.contains('editing')) {
            cardEl.classList.toggle('showing-all');
        }
    });

    /* ---------- Subscriptions ---------- */

    subscribe('deck:loaded', renderGrid);
    subscribe('deck:refresh', renderGrid);

    subscribe('deck:search', (query) => {
        state.deckFilters.searchQuery = query;
        els.searchInput.value = query;
        els.searchClearBtn.hidden = !query;
        renderGrid();
    });

    subscribe('audio:activeChanged', (activeKey) => {
        els.grid.querySelectorAll('.deck-card').forEach((cardEl) => {
            const match = activeKey && cardEl.dataset.key === activeKey;
            cardEl.classList.toggle('playing-now', Boolean(match));
            if (match) {
                cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    });

    updateStarPickerUI();
    renderGrid();

    return {
        getFilteredCards,
        refresh: renderGrid
    };
}
