import {
    STORAGE_KEYS,
    debounce,
    escapeHtml,
    formatEscapedBreaks
} from '../config.js';
import { state, emit, subscribe } from '../state.js';
import {
    createDeckCardCloud,
    deleteVisualCardCloud,
    saveCardGroupsCloud,
    saveGroupsCloud,
    saveSpeechRateCloud,
    uploadVisualCard,
    upsertVisualCardData
} from '../services/supabase.js';
import {
    compressImageBlob,
    fetchImageAsBlob,
    searchGoogleImages,
    searchWikimediaImages
} from '../services/imageSearch.js';
import { translateText } from '../services/translate.js';
import { speakEnglish } from '../services/tts.js';
import { addDeletedMask } from '../services/storage.js';
import { showToast } from '../components/toast.js';
import {
    openConfirmModal,
    openGroupAssignModal,
    openGroupEditModal,
    openLightboxModal,
    openVisualCardModal
} from '../components/modal.js';

/**
 * View 1: Visual Flashcards Studio & Gallery (Project 1)
 */

const RENDER_CHUNK = 40;

export function initGalleryView({ onSwitchTab }) {
    const root = document.getElementById('view-gallery');
    if (!root) return {};

    let renderedCount = 0;
    let filteredCache = [];
    let searchEngine = 'wikimedia'; // 'google' | 'wikimedia'
    let searchPage = 1;
    let searchTotalPages = 1;
    let lastSearchQuery = '';
    let searchItems = [];
    let sentinelObserver = null;

    // Initial skeleton structure
    root.innerHTML = `
        <div class="glass-panel gallery-toolbar">
            <div class="toolbar-row">
                <div class="search-box">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
                    </svg>
                    <input type="text" id="vgSearchInput" placeholder="搜尋圖卡單詞、中文名或解釋…" autocomplete="off">
                    <button type="button" class="search-clear-btn" id="vgSearchClearBtn" hidden aria-label="清除搜尋">&times;</button>
                </div>

                <div class="gallery-controls-right">
                    <button type="button" class="btn btn-primary btn-sm" id="vgStudioToggleBtn">+ 新增圖卡</button>

                    <div class="segmented" id="vgViewModeSeg" title="顯示模式">
                        <button type="button" data-vmode="complete-mode">完整</button>
                        <button type="button" data-vmode="images-only">純圖</button>
                        <button type="button" data-vmode="words-only">純字</button>
                    </div>

                    <select id="vgSortSelect" class="field-select" style="width:auto;padding:6px 10px;font-size:12.5px;" aria-label="排序方式">
                        <option value="timeDesc">⏰ 最新優先</option>
                        <option value="timeAsc">⏳ 最舊優先</option>
                        <option value="alpha">🔤 A → Z</option>
                    </select>

                    <button type="button" class="btn btn-ghost btn-sm" id="vgShuffleBtn" title="隨機洗牌">🎲 隨機</button>
                    <button type="button" class="btn btn-ghost btn-sm" id="vgEditModeBtn" title="開啟編輯與批量管理模式">✏️ 編輯模式</button>

                    <div class="popover-anchor">
                        <button type="button" class="btn btn-ghost btn-sm" id="vgPrefsBtn">顯示選項 ▾</button>
                        <div class="popover-menu" id="vgPrefsMenu" hidden>
                            <label class="pop-toggle">
                                <span>隱藏中文名</span>
                                <input type="checkbox" id="vgHideZhCheck">
                            </label>
                            <label class="pop-toggle">
                                <span>隱藏解釋內容</span>
                                <input type="checkbox" id="vgHideExpCheck">
                            </label>
                            <label class="pop-toggle">
                                <span>顯示載入失敗圖卡</span>
                                <input type="checkbox" id="vgShowFailedCheck">
                            </label>
                            <div class="pop-slider">
                                <div class="pop-slider-head"><span>卡片大小</span><span id="vgSizeLabel">240px</span></div>
                                <input type="range" id="vgSizeSlider" min="140" max="340" step="10" value="240">
                            </div>
                            <div class="pop-slider">
                                <div class="pop-slider-head"><span>發音速度</span><span id="vgRateLabel">0.85x</span></div>
                                <input type="range" id="vgRateSlider" min="0.4" max="1.3" step="0.05" value="0.85">
                            </div>
                            <button type="button" class="btn btn-xs btn-danger" id="vgHideAllFailedBtn">🗑️ 一鍵隱藏目前失效圖卡</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="group-filter-bar" id="vgGroupBar"></div>
        </div>

        <div class="glass-panel studio-drawer" id="vgStudioDrawer" hidden>
            <div class="studio-head">
                <div class="segmented" id="vgStudioTabs">
                    <button type="button" data-stab="search" class="active">🔍 搜尋網路圖片</button>
                    <button type="button" data-stab="upload">📁 本機上傳 / 拖放</button>
                    <button type="button" data-stab="paste">📋 剪貼簿貼圖</button>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div class="segmented" id="vgEngineSeg" title="切換圖庫搜尋引擎">
                        <button type="button" data-engine="wikimedia" class="active">Wikimedia (免費無上限)</button>
                        <button type="button" data-engine="google">Google 圖庫</button>
                    </div>
                    <button type="button" class="btn btn-xs btn-ghost" id="vgStudioCloseBtn">收合 ✕</button>
                </div>
            </div>

            <div id="vgTabSearch">
                <div class="studio-search-row">
                    <input type="text" id="vgImgSearchInput" class="field-input" placeholder="輸入英文關鍵字搜尋圖片，例如：centrifugal pump、circuit breaker…">
                    <button type="button" class="btn btn-primary" id="vgImgSearchBtn">搜尋圖片</button>
                    <button type="button" class="btn btn-ghost" id="vgImgPrevBtn" disabled>←</button>
                    <span id="vgImgPageLabel" style="align-self:center;font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);">第 1 頁</span>
                    <button type="button" class="btn btn-ghost" id="vgImgNextBtn" disabled>→</button>
                </div>
                <div class="search-results-grid" id="vgResultsGrid"></div>
            </div>

            <div id="vgTabUpload" hidden>
                <div class="drop-zone-modern" id="vgDropZone">
                    <div style="font-size:32px;">🖼️</div>
                    <div style="font-weight:600;">拖放一張或多張圖片到此處，或從裝置選擇</div>
                    <div style="font-size:12.5px;color:var(--text-muted);">系統會自動壓縮圖片並開啟預覽填寫視窗（目前模式：${state.visualPrefs.compressionPreset === 'hq' ? '高畫質 ≤50KB' : '極致省流量 ≤10KB'}）</div>
                    <input type="file" id="vgFileInput" accept="image/*" multiple hidden>
                    <button type="button" class="btn btn-primary" id="vgChooseFileBtn">📷 選擇照片檔案</button>
                </div>
            </div>

            <div id="vgTabPaste" hidden>
                <div class="drop-zone-modern">
                    <div style="font-size:32px;">📋</div>
                    <div style="font-weight:600;">在頁面任意處按 <kbd>Ctrl + V</kbd> 或點擊下方按鈕貼上截圖</div>
                    <div style="font-size:12.5px;color:var(--text-muted);">支援從瀏覽器右鍵「複製圖片」或系統截圖工具直接建卡</div>
                    <button type="button" class="btn btn-primary" id="vgPasteBtn">📋 讀取剪貼簿圖片</button>
                </div>
            </div>
        </div>

        <div class="batch-bar" id="vgBatchBar" hidden>
            <div style="display:flex;align-items:center;gap:10px;font-weight:700;font-size:13.5px;">
                <span id="vgBatchCount">已選取 0 張圖卡</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn btn-xs btn-ghost" id="vgBatchSelectAllBtn">全選目前篩選</button>
                <button type="button" class="btn btn-xs btn-ghost" id="vgBatchClearBtn">取消選取</button>
                <button type="button" class="btn btn-xs btn-primary" id="vgBatchAssignBtn">🏷️ 批量指派群組</button>
                <button type="button" class="btn btn-xs btn-danger" id="vgBatchDeleteBtn">🗑️ 批量刪除</button>
            </div>
        </div>

        <div class="gallery-meta-bar">
            <span id="vgMetaCount">載入中…</span>
            <span id="vgMetaHint">雙擊圖卡可暫時揭示並發音 · 點擊圖片放大檢視</span>
        </div>

        <div class="visual-grid" id="vgGrid"></div>
        <div class="gallery-load-sentinel" id="vgLoadSentinel"></div>
    `;

    // Element refs
    const els = {
        searchInput: root.querySelector('#vgSearchInput'),
        searchClearBtn: root.querySelector('#vgSearchClearBtn'),
        studioToggleBtn: root.querySelector('#vgStudioToggleBtn'),
        studioDrawer: root.querySelector('#vgStudioDrawer'),
        studioTabs: root.querySelector('#vgStudioTabs'),
        engineSeg: root.querySelector('#vgEngineSeg'),
        tabSearch: root.querySelector('#vgTabSearch'),
        tabUpload: root.querySelector('#vgTabUpload'),
        tabPaste: root.querySelector('#vgTabPaste'),
        imgSearchInput: root.querySelector('#vgImgSearchInput'),
        imgSearchBtn: root.querySelector('#vgImgSearchBtn'),
        imgPrevBtn: root.querySelector('#vgImgPrevBtn'),
        imgNextBtn: root.querySelector('#vgImgNextBtn'),
        imgPageLabel: root.querySelector('#vgImgPageLabel'),
        resultsGrid: root.querySelector('#vgResultsGrid'),
        dropZone: root.querySelector('#vgDropZone'),
        fileInput: root.querySelector('#vgFileInput'),
        chooseFileBtn: root.querySelector('#vgChooseFileBtn'),
        pasteBtn: root.querySelector('#vgPasteBtn'),
        viewModeSeg: root.querySelector('#vgViewModeSeg'),
        sortSelect: root.querySelector('#vgSortSelect'),
        shuffleBtn: root.querySelector('#vgShuffleBtn'),
        editModeBtn: root.querySelector('#vgEditModeBtn'),
        prefsBtn: root.querySelector('#vgPrefsBtn'),
        prefsMenu: root.querySelector('#vgPrefsMenu'),
        hideZhCheck: root.querySelector('#vgHideZhCheck'),
        hideExpCheck: root.querySelector('#vgHideExpCheck'),
        showFailedCheck: root.querySelector('#vgShowFailedCheck'),
        sizeSlider: root.querySelector('#vgSizeSlider'),
        sizeLabel: root.querySelector('#vgSizeLabel'),
        rateSlider: root.querySelector('#vgRateSlider'),
        rateLabel: root.querySelector('#vgRateLabel'),
        groupBar: root.querySelector('#vgGroupBar'),
        batchBar: root.querySelector('#vgBatchBar'),
        batchCount: root.querySelector('#vgBatchCount'),
        metaCount: root.querySelector('#vgMetaCount'),
        grid: root.querySelector('#vgGrid'),
        sentinel: root.querySelector('#vgLoadSentinel')
    };

    /* ---------- Filtering & Sorting ---------- */

    function getFilteredAndSortedCards() {
        const prefs = state.visualPrefs;
        const q = prefs.searchQuery.trim().toLowerCase();
        const groupMap = new Map(state.groups.map((g) => [g.id, g]));

        let list = state.visualCards.filter((card) => {
            if (!prefs.showFailed && card.imageFailed) return false;

            const gid = state.cardGroups[card.fileName];
            const grp = gid ? groupMap.get(gid) : null;

            if (prefs.isolateGroupId) {
                if (prefs.isolateGroupId === '__NO_GROUP__') {
                    if (grp) return false;
                } else if (gid !== prefs.isolateGroupId) {
                    return false;
                }
            } else {
                if (!grp) {
                    if (!prefs.showNoGroup) return false;
                } else if (grp.visible === false) {
                    return false;
                }
            }

            if (q) {
                const hay = `${card.word}\n${card.chineseName}\n${card.explanation}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        if (prefs.sortMode === 'shuffle' && Array.isArray(prefs.shuffledOrder)) {
            const orderMap = new Map(prefs.shuffledOrder.map((fn, i) => [fn, i]));
            list = [...list].sort((a, b) => (orderMap.get(a.fileName) ?? 999999) - (orderMap.get(b.fileName) ?? 999999));
        } else if (prefs.sortMode === 'timeAsc') {
            list = [...list].sort((a, b) => a.timestamp - b.timestamp);
        } else if (prefs.sortMode === 'alpha') {
            list = [...list].sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }));
        } else {
            list = [...list].sort((a, b) => b.timestamp - a.timestamp);
        }

        return list;
    }

    /* ---------- Sync UI Controls & Classes ---------- */

    function syncPreferencesUI() {
        const prefs = state.visualPrefs;
        document.documentElement.style.setProperty('--card-size', `${prefs.cardSize}px`);
        document.body.classList.toggle('gallery-edit-mode', prefs.editMode);
        document.body.classList.toggle('hide-failed-cards', !prefs.showFailed);

        els.grid.classList.remove('mode-complete-mode', 'mode-images-only', 'mode-words-only', 'hide-chinese', 'hide-explanation');
        els.grid.classList.add(`mode-${prefs.viewMode}`);
        if (prefs.hideChinese) els.grid.classList.add('hide-chinese');
        if (prefs.hideExplanation) els.grid.classList.add('hide-explanation');

        els.viewModeSeg.querySelectorAll('[data-vmode]').forEach((b) => {
            b.classList.toggle('active', b.dataset.vmode === prefs.viewMode);
        });
        els.sortSelect.value = prefs.sortMode === 'shuffle' ? 'timeDesc' : prefs.sortMode;
        els.editModeBtn.classList.toggle('active', prefs.editMode);
        els.editModeBtn.textContent = prefs.editMode ? '🔒 鎖定模式' : '✏️ 編輯模式';

        els.hideZhCheck.checked = prefs.hideChinese;
        els.hideExpCheck.checked = prefs.hideExplanation;
        els.showFailedCheck.checked = prefs.showFailed;
        els.sizeSlider.value = String(prefs.cardSize);
        els.sizeLabel.textContent = `${prefs.cardSize}px`;
        els.rateSlider.value = String(prefs.speechRate);
        els.rateLabel.textContent = `${prefs.speechRate}x`;

        syncBatchBar();
    }

    function syncBatchBar() {
        const count = state.visualPrefs.selectedBatch.size;
        els.batchBar.hidden = !(state.visualPrefs.editMode && count > 0);
        els.batchCount.textContent = `已選取 ${count} 張圖卡`;
    }

    /* ---------- Group Filter Bar Rendering ---------- */

    function renderGroupBar() {
        const prefs = state.visualPrefs;
        const counts = new Map();
        let noGroupCount = 0;
        const validGroupIds = new Set(state.groups.map((g) => g.id));

        for (const c of state.visualCards) {
            const gid = state.cardGroups[c.fileName];
            if (gid && validGroupIds.has(gid)) {
                counts.set(gid, (counts.get(gid) || 0) + 1);
            } else {
                noGroupCount += 1;
            }
        }

        const anyHidden = !prefs.showNoGroup || state.groups.some((g) => g.visible === false) || Boolean(prefs.isolateGroupId);

        const groupChipsHtml = state.groups.map((g) => {
            const count = counts.get(g.id) || 0;
            const isIsolated = prefs.isolateGroupId === g.id;
            const isActive = prefs.isolateGroupId ? isIsolated : g.visible !== false;
            return `
                <div class="group-chip ${isActive ? '' : 'inactive'} ${isIsolated ? 'isolated' : ''}" data-group-id="${escapeHtml(g.id)}" title="${escapeHtml(g.name)}（點擊切換顯示 · 🎯 僅看此群組）">
                    <span class="group-chip-dot" style="background:${escapeHtml(g.color)}"></span>
                    <span class="group-chip-name">${escapeHtml(g.name)}</span>
                    <span class="group-chip-count">${count}</span>
                    <span class="group-chip-actions">
                        <button type="button" class="group-chip-mini" data-act="isolate" title="僅顯示此群組">🎯</button>
                        <button type="button" class="group-chip-mini" data-act="edit-group" title="編輯群組">✎</button>
                    </span>
                </div>
            `;
        }).join('');

        const noGrpActive = prefs.isolateGroupId ? prefs.isolateGroupId === '__NO_GROUP__' : prefs.showNoGroup;
        const noGrpIsolated = prefs.isolateGroupId === '__NO_GROUP__';

        els.groupBar.innerHTML = `
            <button type="button" class="btn btn-xs btn-primary" id="vgAddGroupBtn">+ 新增群組</button>
            ${anyHidden ? `<button type="button" class="btn btn-xs btn-ghost" id="vgShowAllGroupsBtn">👁️ 全部顯示</button>` : ''}
            <button type="button" class="group-chip ${noGrpActive ? '' : 'inactive'} ${noGrpIsolated ? 'isolated' : ''}" id="vgNoGroupChip" title="點擊切換未分組圖卡顯示">
                <span class="group-chip-dot" style="background:#64748B"></span>
                <span>未分組</span>
                <span class="group-chip-count">${noGroupCount}</span>
            </button>
            ${groupChipsHtml}
        `;
    }

    /* ---------- Card Element Builder ---------- */

    function createCardNode(card) {
        const groupMap = new Map(state.groups.map((g) => [g.id, g]));
        const gid = state.cardGroups[card.fileName];
        const grp = gid ? groupMap.get(gid) : null;

        const el = document.createElement('article');
        el.className = `visual-card ${card.imageFailed ? 'image-failed' : ''}`;
        el.dataset.fileName = card.fileName;
        if (grp?.color) {
            el.style.setProperty('--group-accent', grp.color);
        }

        const isChecked = state.visualPrefs.selectedBatch.has(card.fileName);

        el.innerHTML = `
            <div class="vcard-top-left">
                <input type="checkbox" class="vcard-batch-check" ${isChecked ? 'checked' : ''} aria-label="選取圖卡">
                <button type="button" class="vcard-group-pill" data-card-act="assign-group" title="點擊變更群組：${escapeHtml(grp?.name || '未分組')}">
                    <span class="vcard-group-dot" style="background:${escapeHtml(grp?.color || '#64748B')}"></span>
                    <span>${escapeHtml(grp?.name || '未分組')}</span>
                </button>
            </div>
            <div class="vcard-actions">
                <button type="button" class="vcard-icon-btn" data-card-act="speak" title="發音朗讀">🔊</button>
                <button type="button" class="vcard-icon-btn" data-card-act="zoom" title="放大預覽">🔍</button>
                <button type="button" class="vcard-icon-btn" data-card-act="to-deck" title="複製到單字庫">↗</button>
                <button type="button" class="vcard-icon-btn" data-card-act="edit-modal" title="詳細編輯">✎</button>
                <button type="button" class="vcard-icon-btn danger" data-card-act="delete" title="刪除圖卡">×</button>
            </div>
            <div class="vcard-media" data-card-act="zoom">
                ${card.imageFailed
                    ? `<div class="vcard-placeholder"><div>⚠️ 圖片載入失敗</div><button type="button" class="btn btn-xs btn-ghost" data-card-act="retry-img">重試</button></div>`
                    : `<img src="${escapeHtml(card.publicUrl)}" alt="${escapeHtml(card.word)}" loading="lazy" decoding="async">`
                }
            </div>
            <div class="vcard-body">
                <div class="vcard-word" data-field="word">${escapeHtml(card.word)}</div>
                <div class="vcard-zh-row">
                    <div class="vcard-zh" data-field="chineseName">${card.chineseName ? escapeHtml(card.chineseName) : ''}</div>
                    <button type="button" class="vcard-mini-btn" data-card-act="trans-word" title="翻譯單詞到中文" ${state.visualPrefs.editMode || !card.chineseName ? '' : 'hidden'}>譯</button>
                </div>
                ${card.explanation || state.visualPrefs.editMode ? `
                    <div class="vcard-exp-row">
                        <div class="vcard-exp collapsed" data-field="explanation">${card.explanation ? formatEscapedBreaks(card.explanation) : ''}</div>
                        ${card.explanation ? `<button type="button" class="vcard-mini-btn" data-card-act="trans-exp" title="翻譯解釋內容">譯</button>` : ''}
                    </div>
                    <div class="vcard-exp-trans" hidden></div>
                ` : ''}
            </div>
        `;

        // Attach resilient image load handler
        const img = el.querySelector('.vcard-media img');
        if (img) {
            let retries = 0;
            img.addEventListener('error', () => {
                if (retries < 2) {
                    retries += 1;
                    const sep = card.publicUrl.includes('?') ? '&' : '?';
                    setTimeout(() => {
                        img.src = `${card.publicUrl}${sep}retry=${Date.now()}`;
                    }, 700 * retries);
                } else {
                    card.imageFailed = true;
                    el.classList.add('image-failed');
                    const media = el.querySelector('.vcard-media');
                    if (media) {
                        media.innerHTML = `<div class="vcard-placeholder"><div>⚠️ 圖片載入失敗</div><button type="button" class="btn btn-xs btn-ghost" data-card-act="retry-img">重試</button></div>`;
                    }
                    updateMetaCount();
                }
            });
        }

        return el;
    }

    function updateMetaCount() {
        const failedTotal = state.visualCards.filter((c) => c.imageFailed).length;
        const shown = filteredCache.length;
        const total = state.visualCards.length;
        els.metaCount.textContent = `顯示 ${shown} / ${total} 張圖卡${failedTotal > 0 ? `（另有 ${failedTotal} 張圖片載入失敗）` : ''}`;
    }

    function appendNextChunk() {
        if (renderedCount >= filteredCache.length) {
            els.sentinel.innerHTML = '';
            return;
        }
        const frag = document.createDocumentFragment();
        const slice = filteredCache.slice(renderedCount, renderedCount + RENDER_CHUNK);
        for (const card of slice) {
            frag.appendChild(createCardNode(card));
        }
        els.grid.appendChild(frag);
        renderedCount += slice.length;

        if (renderedCount < filteredCache.length) {
            els.sentinel.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="vgLoadMoreBtn">載入更多圖卡（已顯示 ${renderedCount} / ${filteredCache.length}）</button>`;
        } else {
            els.sentinel.innerHTML = '';
        }
    }

    function renderGrid(reset = true) {
        if (state.loading.visual && state.visualCards.length === 0) {
            els.grid.innerHTML = Array.from({ length: 8 }).map(() => `
                <div class="visual-card" style="height:280px;">
                    <div class="skeleton" style="height:185px;"></div>
                    <div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
                        <div class="skeleton" style="height:18px;width:65%;border-radius:6px;"></div>
                        <div class="skeleton" style="height:14px;width:45%;border-radius:6px;"></div>
                    </div>
                </div>
            `).join('');
            els.metaCount.textContent = '從 Supabase 載入圖卡中…';
            return;
        }

        if (reset) {
            filteredCache = getFilteredAndSortedCards();
            renderedCount = 0;
            els.grid.innerHTML = '';
        }

        updateMetaCount();

        if (filteredCache.length === 0) {
            els.grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🖼️</div>
                    <h3>沒有符合條件的圖卡</h3>
                    <p>試著調整搜尋關鍵字、群組過濾器，或點擊上方「+ 新增圖卡」建立新詞彙。</p>
                </div>
            `;
            els.sentinel.innerHTML = '';
            return;
        }

        appendNextChunk();
    }

    /* ---------- IntersectionObserver for Infinite Scroll ---------- */

    if ('IntersectionObserver' in window) {
        sentinelObserver = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting && renderedCount < filteredCache.length) {
                appendNextChunk();
            }
        }, { rootMargin: '320px' });
        sentinelObserver.observe(els.sentinel);
    }

    els.sentinel.addEventListener('click', (e) => {
        if (e.target.closest('#vgLoadMoreBtn')) {
            appendNextChunk();
        }
    });

    /* ---------- Studio Image Search & Creation Flow ---------- */

    function renderSearchResults() {
        if (searchItems.length === 0) {
            els.resultsGrid.innerHTML = '';
            return;
        }
        els.resultsGrid.innerHTML = searchItems.map((item, idx) => `
            <div class="search-result-card">
                <img src="${escapeHtml(item.thumbUrl)}" alt="${escapeHtml(item.title)}" loading="lazy">
                <div class="search-result-overlay">
                    <span style="font-size:11px;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.source)}</span>
                    <button type="button" class="btn btn-xs btn-primary" data-pick-idx="${idx}">存成圖卡</button>
                </div>
            </div>
        `).join('');
    }

    async function runImageSearch(page = 1) {
        const q = els.imgSearchInput.value.trim();
        if (!q) {
            showToast('請輸入要搜尋的英文關鍵字', { type: 'warning' });
            els.imgSearchInput.focus();
            return;
        }

        lastSearchQuery = q;
        searchPage = page;
        els.imgSearchBtn.disabled = true;
        els.imgSearchBtn.textContent = '搜尋中…';
        els.resultsGrid.innerHTML = Array.from({ length: 6 }).map(() => `<div class="search-result-card skeleton"></div>`).join('');

        try {
            const res = searchEngine === 'google'
                ? await searchGoogleImages(q, page)
                : await searchWikimediaImages(q, page);

            searchItems = res.items;
            searchTotalPages = res.totalPages;
            els.imgPageLabel.textContent = `第 ${searchPage} / ${searchTotalPages} 頁`;
            els.imgPrevBtn.disabled = searchPage <= 1;
            els.imgNextBtn.disabled = searchPage >= searchTotalPages;

            if (searchItems.length === 0) {
                els.resultsGrid.innerHTML = `<div class="empty-state" style="padding:28px;"><p>沒有找到「${escapeHtml(q)}」的圖片，建議切換另一個搜尋引擎試試！</p></div>`;
            } else {
                renderSearchResults();
            }
        } catch (err) {
            els.resultsGrid.innerHTML = `<div class="empty-state" style="padding:24px;"><p>搜尋失敗：${escapeHtml(err.message)}（可切換「Wikimedia」免費圖庫繼續搜尋）</p></div>`;
            showToast(`圖片搜尋失敗：${err.message}`, { type: 'error' });
        } finally {
            els.imgSearchBtn.disabled = false;
            els.imgSearchBtn.textContent = '搜尋圖片';
        }
    }

    async function launchCreateFlowFromBlob(rawBlob, suggestedWord = '') {
        const previewUrl = URL.createObjectURL(rawBlob);
        const activeGroupId = (state.visualPrefs.isolateGroupId && state.visualPrefs.isolateGroupId !== '__NO_GROUP__')
            ? state.visualPrefs.isolateGroupId
            : '';

        openVisualCardModal({
            mode: 'create',
            previewUrl,
            word: suggestedWord,
            groupId: activeGroupId,
            groups: state.groups,
            onSubmit: async ({ word, chineseName, explanation, groupId }) => {
                const { blob: compressed, compressedSize } = await compressImageBlob(
                    rawBlob,
                    state.visualPrefs.compressionPreset
                );
                const created = await uploadVisualCard({
                    blob: compressed,
                    word,
                    chineseName,
                    explanation,
                    groupId,
                    currentCardGroups: state.cardGroups
                });

                state.visualCards.unshift(created);
                if (groupId) {
                    state.cardGroups[created.fileName] = groupId;
                }
                emit('vault:changed');
                renderGroupBar();
                renderGrid(true);
                URL.revokeObjectURL(previewUrl);
                showToast(`已建立「${word}」（${Math.max(1, Math.round(compressedSize / 1024))}KB）`, { type: 'success' });
            }
        });
    }

    /* ---------- Studio Controls Events ---------- */

    function setStudioTab(tab) {
        state.visualPrefs.studioTab = tab;
        els.studioTabs.querySelectorAll('[data-stab]').forEach((b) => b.classList.toggle('active', b.dataset.stab === tab));
        els.tabSearch.hidden = tab !== 'search';
        els.tabUpload.hidden = tab !== 'upload';
        els.tabPaste.hidden = tab !== 'paste';
    }

    els.studioToggleBtn.addEventListener('click', () => {
        state.visualPrefs.studioOpen = !state.visualPrefs.studioOpen;
        els.studioDrawer.hidden = !state.visualPrefs.studioOpen;
        if (state.visualPrefs.studioOpen && state.visualPrefs.studioTab === 'search') {
            setTimeout(() => els.imgSearchInput.focus(), 40);
        }
    });

    root.querySelector('#vgStudioCloseBtn')?.addEventListener('click', () => {
        state.visualPrefs.studioOpen = false;
        els.studioDrawer.hidden = true;
    });

    els.studioTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-stab]');
        if (btn) setStudioTab(btn.dataset.stab);
    });

    els.engineSeg.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-engine]');
        if (!btn) return;
        searchEngine = btn.dataset.engine;
        els.engineSeg.querySelectorAll('[data-engine]').forEach((b) => b.classList.toggle('active', b.dataset.engine === searchEngine));
        if (lastSearchQuery) runImageSearch(1);
    });

    els.imgSearchBtn.addEventListener('click', () => runImageSearch(1));
    els.imgSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            runImageSearch(1);
        }
    });
    els.imgPrevBtn.addEventListener('click', () => { if (searchPage > 1) runImageSearch(searchPage - 1); });
    els.imgNextBtn.addEventListener('click', () => { if (searchPage < searchTotalPages) runImageSearch(searchPage + 1); });

    els.resultsGrid.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-pick-idx]');
        if (!btn) return;
        const item = searchItems[Number(btn.dataset.pickIdx)];
        if (!item) return;

        btn.disabled = true;
        btn.textContent = '載入中…';
        try {
            const blob = await fetchImageAsBlob(item.url, item.thumbUrl);
            await launchCreateFlowFromBlob(blob, lastSearchQuery || els.imgSearchInput.value.trim());
        } catch (err) {
            showToast(err.message, { type: 'error', duration: 4200 });
        } finally {
            btn.disabled = false;
            btn.textContent = '存成圖卡';
        }
    });

    // File Upload & Drag-and-Drop
    els.chooseFileBtn.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
        e.target.value = '';
        if (!files.length) return;
        const first = files[0];
        const baseName = first.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        await launchCreateFlowFromBlob(first, baseName);
        if (files.length > 1) {
            showToast(`已開啟第 1 張（共選取 ${files.length} 張，可依序上傳）`, { type: 'info' });
        }
    });

    ['dragenter', 'dragover'].forEach((ev) => {
        els.dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            els.dropZone.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach((ev) => {
        els.dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            els.dropZone.classList.remove('dragover');
        });
    });
    els.dropZone.addEventListener('drop', async (e) => {
        const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
        if (files.length > 0) {
            const baseName = files[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
            await launchCreateFlowFromBlob(files[0], baseName);
            return;
        }
        const droppedUrl = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
        if (droppedUrl && /^https?:\/\//i.test(droppedUrl.trim())) {
            try {
                const blob = await fetchImageAsBlob(droppedUrl.trim());
                await launchCreateFlowFromBlob(blob, '');
            } catch (err) {
                showToast(err.message, { type: 'error' });
            }
        }
    });

    async function handleClipboardPaste() {
        try {
            if (!navigator.clipboard?.read) {
                showToast('此瀏覽器不支援直接讀取剪貼簿圖片，請改用拖放或檔案選擇', { type: 'warning' });
                return;
            }
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imgType = item.types.find((t) => t.startsWith('image/'));
                if (imgType) {
                    const blob = await item.getType(imgType);
                    await launchCreateFlowFromBlob(blob, '');
                    return;
                }
            }
            showToast('剪貼簿中沒有找到圖片', { type: 'warning' });
        } catch (err) {
            showToast(`無法讀取剪貼簿：${err.message}`, { type: 'error' });
        }
    }

    els.pasteBtn.addEventListener('click', handleClipboardPaste);

    /* ---------- Toolbar Filter / Sort / Prefs Events ---------- */

    const onSearchInput = debounce(() => {
        state.visualPrefs.searchQuery = els.searchInput.value;
        els.searchClearBtn.hidden = !els.searchInput.value;
        renderGrid(true);
    }, 140);

    els.searchInput.addEventListener('input', onSearchInput);
    els.searchClearBtn.addEventListener('click', () => {
        els.searchInput.value = '';
        els.searchClearBtn.hidden = true;
        state.visualPrefs.searchQuery = '';
        renderGrid(true);
    });

    els.viewModeSeg.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-vmode]');
        if (!btn) return;
        state.visualPrefs.viewMode = btn.dataset.vmode;
        localStorage.setItem(STORAGE_KEYS.VIEW_MODE, state.visualPrefs.viewMode);
        syncPreferencesUI();
    });

    els.sortSelect.addEventListener('change', () => {
        state.visualPrefs.sortMode = els.sortSelect.value;
        state.visualPrefs.shuffledOrder = null;
        localStorage.setItem(STORAGE_KEYS.SORT_MODE, state.visualPrefs.sortMode);
        renderGrid(true);
    });

    els.shuffleBtn.addEventListener('click', () => {
        const names = state.visualCards.map((c) => c.fileName);
        for (let i = names.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [names[i], names[j]] = [names[j], names[i]];
        }
        state.visualPrefs.sortMode = 'shuffle';
        state.visualPrefs.shuffledOrder = names;
        renderGrid(true);
        showToast('已隨機重排所有圖卡', { type: 'info', duration: 1500 });
    });

    els.editModeBtn.addEventListener('click', () => {
        state.visualPrefs.editMode = !state.visualPrefs.editMode;
        if (!state.visualPrefs.editMode) {
            state.visualPrefs.selectedBatch.clear();
        }
        localStorage.setItem(STORAGE_KEYS.EDIT_MODE, String(state.visualPrefs.editMode));
        syncPreferencesUI();
        renderGrid(true);
    });

    els.prefsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        els.prefsMenu.hidden = !els.prefsMenu.hidden;
    });
    document.addEventListener('click', (e) => {
        if (!els.prefsMenu.hidden && !e.target.closest('#vgPrefsMenu') && !e.target.closest('#vgPrefsBtn')) {
            els.prefsMenu.hidden = true;
        }
    });

    els.hideZhCheck.addEventListener('change', () => {
        state.visualPrefs.hideChinese = els.hideZhCheck.checked;
        localStorage.setItem(STORAGE_KEYS.HIDE_CHINESE, String(state.visualPrefs.hideChinese));
        syncPreferencesUI();
    });
    els.hideExpCheck.addEventListener('change', () => {
        state.visualPrefs.hideExplanation = els.hideExpCheck.checked;
        localStorage.setItem(STORAGE_KEYS.HIDE_EXPLANATION, String(state.visualPrefs.hideExplanation));
        syncPreferencesUI();
    });
    els.showFailedCheck.addEventListener('change', () => {
        state.visualPrefs.showFailed = els.showFailedCheck.checked;
        localStorage.setItem(STORAGE_KEYS.SHOW_FAILED, String(state.visualPrefs.showFailed));
        syncPreferencesUI();
        renderGrid(true);
    });
    els.sizeSlider.addEventListener('input', () => {
        state.visualPrefs.cardSize = Number(els.sizeSlider.value);
        syncPreferencesUI();
    });
    els.sizeSlider.addEventListener('change', () => {
        localStorage.setItem(STORAGE_KEYS.CARD_SIZE, String(state.visualPrefs.cardSize));
    });
    els.rateSlider.addEventListener('input', () => {
        state.visualPrefs.speechRate = parseFloat(els.rateSlider.value);
        els.rateLabel.textContent = `${state.visualPrefs.speechRate}x`;
    });
    els.rateSlider.addEventListener('change', async () => {
        localStorage.setItem(STORAGE_KEYS.SPEECH_RATE, String(state.visualPrefs.speechRate));
        try {
            await saveSpeechRateCloud(state.visualPrefs.speechRate);
        } catch {
            // saved locally
        }
    });

    root.querySelector('#vgHideAllFailedBtn')?.addEventListener('click', () => {
        const failed = state.visualCards.filter((c) => c.imageFailed);
        if (!failed.length) {
            showToast('目前沒有載入失敗的圖卡', { type: 'info' });
            return;
        }
        failed.forEach((c) => addDeletedMask(c.fileName));
        const failedSet = new Set(failed.map((c) => c.fileName));
        state.visualCards = state.visualCards.filter((c) => !failedSet.has(c.fileName));
        emit('vault:changed');
        renderGroupBar();
        renderGrid(true);
        showToast(`已在本機隱藏 ${failed.length} 張失效圖卡（24小時）`, { type: 'success' });
    });

    /* ---------- Group Bar Actions (Delegation) ---------- */

    els.groupBar.addEventListener('click', async (e) => {
        if (e.target.closest('#vgAddGroupBtn')) {
            openGroupEditModal({
                onSave: async ({ name, color }) => {
                    const newGrp = {
                        id: 'group_' + Date.now(),
                        name,
                        color,
                        visible: true,
                        createdAt: new Date().toISOString()
                    };
                    state.groups.push(newGrp);
                    await saveGroupsCloud(state.groups);
                    emit('vault:changed');
                    renderGroupBar();
                    showToast(`已新增群組「${name}」`, { type: 'success' });
                }
            });
            return;
        }

        if (e.target.closest('#vgShowAllGroupsBtn')) {
            state.visualPrefs.isolateGroupId = null;
            state.visualPrefs.showNoGroup = true;
            localStorage.setItem(STORAGE_KEYS.SHOW_NO_GROUP, 'true');
            let changed = false;
            state.groups.forEach((g) => {
                if (g.visible === false) {
                    g.visible = true;
                    changed = true;
                }
            });
            if (changed) saveGroupsCloud(state.groups).catch(console.warn);
            renderGroupBar();
            renderGrid(true);
            return;
        }

        if (e.target.closest('#vgNoGroupChip')) {
            if (state.visualPrefs.isolateGroupId === '__NO_GROUP__') {
                state.visualPrefs.isolateGroupId = null;
            } else {
                state.visualPrefs.isolateGroupId = null;
                state.visualPrefs.showNoGroup = !state.visualPrefs.showNoGroup;
                localStorage.setItem(STORAGE_KEYS.SHOW_NO_GROUP, String(state.visualPrefs.showNoGroup));
            }
            renderGroupBar();
            renderGrid(true);
            return;
        }

        const chip = e.target.closest('.group-chip[data-group-id]');
        if (!chip) return;
        const gid = chip.dataset.groupId;
        const group = state.groups.find((g) => g.id === gid);
        if (!group) return;

        if (e.target.closest('[data-act="isolate"]')) {
            state.visualPrefs.isolateGroupId = state.visualPrefs.isolateGroupId === gid ? null : gid;
            renderGroupBar();
            renderGrid(true);
            return;
        }

        if (e.target.closest('[data-act="edit-group"]')) {
            openGroupEditModal({
                group,
                onSave: async ({ name, color }) => {
                    group.name = name;
                    group.color = color;
                    group.updatedAt = new Date().toISOString();
                    await saveGroupsCloud(state.groups);
                    emit('vault:changed');
                    renderGroupBar();
                    renderGrid(true);
                    showToast(`已更新群組「${name}」`, { type: 'success' });
                },
                onDelete: async (deleteId) => {
                    state.groups = state.groups.filter((g) => g.id !== deleteId);
                    Object.keys(state.cardGroups).forEach((fn) => {
                        if (state.cardGroups[fn] === deleteId) delete state.cardGroups[fn];
                    });
                    if (state.visualPrefs.isolateGroupId === deleteId) {
                        state.visualPrefs.isolateGroupId = null;
                    }
                    await Promise.all([saveGroupsCloud(state.groups), saveCardGroupsCloud(state.cardGroups)]);
                    emit('vault:changed');
                    renderGroupBar();
                    renderGrid(true);
                    showToast('群組已刪除，原圖卡已轉為未分組', { type: 'info' });
                }
            });
            return;
        }

        // Default click on group chip: toggle visibility
        state.visualPrefs.isolateGroupId = null;
        group.visible = group.visible === false;
        saveGroupsCloud(state.groups).catch(console.warn);
        renderGroupBar();
        renderGrid(true);
    });

    /* ---------- Batch Actions ---------- */

    root.querySelector('#vgBatchSelectAllBtn')?.addEventListener('click', () => {
        filteredCache.forEach((c) => state.visualPrefs.selectedBatch.add(c.fileName));
        els.grid.querySelectorAll('.vcard-batch-check').forEach((cb) => { cb.checked = true; });
        syncBatchBar();
    });

    root.querySelector('#vgBatchClearBtn')?.addEventListener('click', () => {
        state.visualPrefs.selectedBatch.clear();
        els.grid.querySelectorAll('.vcard-batch-check').forEach((cb) => { cb.checked = false; });
        syncBatchBar();
    });

    root.querySelector('#vgBatchAssignBtn')?.addEventListener('click', () => {
        const selected = Array.from(state.visualPrefs.selectedBatch);
        if (!selected.length) return;
        openGroupAssignModal({
            title: `批量指派 ${selected.length} 張圖卡的群組`,
            groups: state.groups,
            onAssign: async (gid) => {
                for (const fn of selected) {
                    if (gid) state.cardGroups[fn] = gid;
                    else delete state.cardGroups[fn];
                }
                await saveCardGroupsCloud(state.cardGroups);
                state.visualPrefs.selectedBatch.clear();
                emit('vault:changed');
                renderGroupBar();
                renderGrid(true);
                showToast(`已更新 ${selected.length} 張圖卡的群組`, { type: 'success' });
            }
        });
    });

    root.querySelector('#vgBatchDeleteBtn')?.addEventListener('click', async () => {
        const selected = Array.from(state.visualPrefs.selectedBatch);
        if (!selected.length) return;
        const ok = await openConfirmModal({
            title: '批量刪除圖卡',
            message: `確定要刪除所選的 ${selected.length} 張圖卡嗎？此動作無法復原。`,
            confirmLabel: `確定刪除 (${selected.length})`,
            danger: true
        });
        if (!ok) return;

        for (const fn of selected) {
            await deleteVisualCardCloud(fn);
            delete state.cardGroups[fn];
        }
        await saveCardGroupsCloud(state.cardGroups).catch(console.warn);
        const delSet = new Set(selected);
        state.visualCards = state.visualCards.filter((c) => !delSet.has(c.fileName));
        state.visualPrefs.selectedBatch.clear();
        emit('vault:changed');
        renderGroupBar();
        renderGrid(true);
        showToast(`已刪除 ${selected.length} 張圖卡`, { type: 'success' });
    });

    /* ---------- Card Actions & Inline Editing (Delegation) ---------- */

    async function handleAssignCardGroup(card) {
        openGroupAssignModal({
            title: `為「${card.word}」選擇群組`,
            currentGroupId: state.cardGroups[card.fileName] || '',
            groups: state.groups,
            onAssign: async (gid) => {
                if (gid) state.cardGroups[card.fileName] = gid;
                else delete state.cardGroups[card.fileName];
                await saveCardGroupsCloud(state.cardGroups);
                emit('vault:changed');
                renderGroupBar();
                renderGrid(true);
                showToast('群組已更新', { type: 'success' });
            }
        });
    }

    async function handleOpenEditModal(card) {
        openVisualCardModal({
            mode: 'edit',
            previewUrl: card.publicUrl,
            word: card.word,
            chineseName: card.chineseName,
            explanation: card.explanation,
            groupId: state.cardGroups[card.fileName] || '',
            groups: state.groups,
            onSubmit: async ({ word, chineseName, explanation, groupId }) => {
                await upsertVisualCardData(card.fileName, word, chineseName, explanation);
                card.word = word;
                card.chineseName = chineseName;
                card.explanation = explanation;

                const prevGid = state.cardGroups[card.fileName] || null;
                if (prevGid !== (groupId || null)) {
                    if (groupId) state.cardGroups[card.fileName] = groupId;
                    else delete state.cardGroups[card.fileName];
                    await saveCardGroupsCloud(state.cardGroups);
                }

                emit('vault:changed');
                renderGroupBar();
                renderGrid(true);
                showToast(`已更新「${word}」`, { type: 'success' });
            }
        });
    }

    async function handleSendToDeck(card) {
        let zh = card.chineseName?.trim();
        if (!zh) {
            try {
                zh = await translateText(card.word, 'en', 'zh-TW');
            } catch {
                zh = card.word;
            }
        }
        const exists = state.deckCards.some((d) => d.english.toLowerCase() === card.word.toLowerCase());
        if (exists) {
            showToast(`「${card.word}」已存在於單字庫中`, {
                type: 'info',
                actionLabel: '前往查看',
                onAction: () => {
                    onSwitchTab('deck');
                    emit('deck:search', card.word);
                }
            });
            return;
        }
        try {
            const created = await createDeckCardCloud({
                english: card.word,
                chinese: zh,
                rating: 1,
                card_type: card.word.trim().split(/\s+/).length >= 4 ? 'sentence' : 'word'
            });
            state.deckCards.unshift(created);
            emit('vault:changed');
            emit('deck:refresh');
            showToast(`已將「${card.word}」存入單字庫`, {
                type: 'success',
                actionLabel: '查看',
                onAction: () => onSwitchTab('deck')
            });
        } catch (err) {
            showToast(`存入失敗：${err.message}`, { type: 'error' });
        }
    }

    function openCardLightbox(card) {
        const idx = filteredCache.findIndex((c) => c.fileName === card.fileName);
        openLightboxModal({
            cards: filteredCache,
            startIndex: Math.max(0, idx),
            groups: state.groups,
            cardGroups: state.cardGroups,
            onSpeak: (w) => speakEnglish(w, { voiceSetting: state.deckSettings.englishTts, rate: state.visualPrefs.speechRate }),
            onEdit: handleOpenEditModal,
            onSendToDeck: handleSendToDeck,
            onAssignGroup: handleAssignCardGroup
        });
    }

    els.grid.addEventListener('change', (e) => {
        if (e.target.classList.contains('vcard-batch-check')) {
            const cardEl = e.target.closest('.visual-card');
            if (!cardEl) return;
            const fn = cardEl.dataset.fileName;
            if (e.target.checked) state.visualPrefs.selectedBatch.add(fn);
            else state.visualPrefs.selectedBatch.delete(fn);
            syncBatchBar();
        }
    });

    els.grid.addEventListener('dblclick', (e) => {
        if (e.target.closest('.vcard-inline-edit, button, input')) return;
        const cardEl = e.target.closest('.visual-card');
        if (!cardEl) return;
        const card = state.visualCards.find((c) => c.fileName === cardEl.dataset.fileName);
        if (!card) return;
        cardEl.classList.add('temp-reveal');
        speakEnglish(card.word, {
            voiceSetting: state.deckSettings.englishTts,
            rate: state.visualPrefs.speechRate
        });
        setTimeout(() => cardEl.classList.remove('temp-reveal'), 3000);
    });

    els.grid.addEventListener('click', async (e) => {
        const cardEl = e.target.closest('.visual-card');
        if (!cardEl) return;
        const fn = cardEl.dataset.fileName;
        const card = state.visualCards.find((c) => c.fileName === fn);
        if (!card) return;

        const actEl = e.target.closest('[data-card-act]');
        if (actEl) {
            e.stopPropagation();
            const act = actEl.dataset.cardAct;

            if (act === 'speak') {
                speakEnglish(card.word, {
                    voiceSetting: state.deckSettings.englishTts,
                    rate: state.visualPrefs.speechRate
                });
            } else if (act === 'zoom') {
                openCardLightbox(card);
            } else if (act === 'assign-group') {
                await handleAssignCardGroup(card);
            } else if (act === 'edit-modal') {
                await handleOpenEditModal(card);
            } else if (act === 'to-deck') {
                await handleSendToDeck(card);
            } else if (act === 'delete') {
                const ok = await openConfirmModal({
                    title: '刪除圖卡',
                    message: `確定要刪除「${card.word}」嗎？此操作無法撤銷。`,
                    confirmLabel: '確定刪除',
                    danger: true
                });
                if (ok) {
                    const { storageWarning } = await deleteVisualCardCloud(fn);
                    if (state.cardGroups[fn]) {
                        delete state.cardGroups[fn];
                        saveCardGroupsCloud(state.cardGroups).catch(console.warn);
                    }
                    state.visualCards = state.visualCards.filter((c) => c.fileName !== fn);
                    emit('vault:changed');
                    renderGroupBar();
                    renderGrid(true);
                    showToast(storageWarning ? '圖卡已隱藏（雲端儲存權限未開刪除）' : '圖卡已刪除', {
                        type: storageWarning ? 'warning' : 'success'
                    });
                }
            } else if (act === 'retry-img') {
                card.imageFailed = false;
                card.publicUrl = `${card.publicUrl.split('?')[0]}?retry=${Date.now()}`;
                renderGrid(true);
            } else if (act === 'trans-word') {
                actEl.disabled = true;
                try {
                    const zh = await translateText(card.word, 'en', 'zh-TW');
                    await upsertVisualCardData(fn, card.word, zh, card.explanation);
                    card.chineseName = zh;
                    const zhNode = cardEl.querySelector('.vcard-zh');
                    if (zhNode) zhNode.textContent = zh;
                    showToast(`翻譯完成：${zh}`, { type: 'success' });
                } catch (err) {
                    showToast(`翻譯失敗：${err.message}`, { type: 'error' });
                } finally {
                    actEl.disabled = false;
                }
            } else if (act === 'trans-exp') {
                const transBox = cardEl.querySelector('.vcard-exp-trans');
                if (!transBox || !card.explanation) return;
                if (!transBox.hidden) {
                    transBox.hidden = true;
                    return;
                }
                actEl.disabled = true;
                try {
                    const zh = await translateText(card.explanation, 'en', 'zh-TW');
                    transBox.innerHTML = formatEscapedBreaks(zh);
                    transBox.hidden = false;
                } catch (err) {
                    showToast(`翻譯解釋失敗：${err.message}`, { type: 'error' });
                } finally {
                    actEl.disabled = false;
                }
            }
            return;
        }

        // Toggle explanation collapse on click outside edit mode
        const expEl = e.target.closest('.vcard-exp');
        if (expEl && !state.visualPrefs.editMode) {
            expEl.classList.toggle('collapsed');
            expEl.classList.toggle('expanded');
            return;
        }

        // Inline Edit in Edit Mode
        const fieldEl = e.target.closest('[data-field]');
        if (fieldEl && state.visualPrefs.editMode && !fieldEl.querySelector('.vcard-inline-edit')) {
            const fieldName = fieldEl.dataset.field;
            const currentVal = card[fieldName] || '';
            const input = fieldName === 'explanation'
                ? document.createElement('textarea')
                : document.createElement('input');
            input.className = 'vcard-inline-edit';
            input.value = currentVal;
            if (fieldName === 'explanation') input.rows = 3;

            fieldEl.innerHTML = '';
            fieldEl.appendChild(input);
            input.focus();

            let done = false;
            const commit = async () => {
                if (done) return;
                done = true;
                const nextVal = input.value.trim();
                if (fieldName === 'word' && !nextVal) {
                    fieldEl.textContent = card.word;
                    showToast('單詞名稱不能為空', { type: 'warning' });
                    return;
                }
                if (nextVal !== currentVal) {
                    const nextWord = fieldName === 'word' ? nextVal : card.word;
                    const nextZh = fieldName === 'chineseName' ? nextVal : card.chineseName;
                    const nextExp = fieldName === 'explanation' ? nextVal : card.explanation;
                    try {
                        await upsertVisualCardData(fn, nextWord, nextZh, nextExp);
                        card.word = nextWord;
                        card.chineseName = nextZh;
                        card.explanation = nextExp;
                        showToast('已儲存修改', { type: 'success' });
                    } catch (err) {
                        showToast(`儲存失敗：${err.message}`, { type: 'error' });
                    }
                }
                if (fieldName === 'explanation') {
                    fieldEl.innerHTML = formatEscapedBreaks(card.explanation);
                } else {
                    fieldEl.textContent = card[fieldName] || '';
                }
            };

            input.addEventListener('blur', commit);
            input.addEventListener('keydown', (ke) => {
                if (ke.key === 'Enter' && (fieldName !== 'explanation' || !ke.shiftKey)) {
                    ke.preventDefault();
                    commit();
                } else if (ke.key === 'Escape') {
                    done = true;
                    if (fieldName === 'explanation') fieldEl.innerHTML = formatEscapedBreaks(currentVal);
                    else fieldEl.textContent = currentVal;
                }
            });
        }
    });

    /* ---------- Global Subscriptions ---------- */

    subscribe('visual:loaded', () => {
        syncPreferencesUI();
        renderGroupBar();
        renderGrid(true);
    });

    subscribe('gallery:openStudio', () => {
        state.visualPrefs.studioOpen = true;
        els.studioDrawer.hidden = false;
        setStudioTab('search');
        setTimeout(() => els.imgSearchInput.focus(), 50);
    });

    subscribe('gallery:searchImage', (query) => {
        state.visualPrefs.studioOpen = true;
        els.studioDrawer.hidden = false;
        setStudioTab('search');
        els.imgSearchInput.value = query;
        runImageSearch(1);
    });

    subscribe('gallery:isolateGroup', (gid) => {
        state.visualPrefs.isolateGroupId = gid;
        renderGroupBar();
        renderGrid(true);
    });

    subscribe('gallery:inspectCard', (fileName) => {
        const card = state.visualCards.find((c) => c.fileName === fileName);
        if (!card) return;
        state.visualPrefs.isolateGroupId = null;
        state.visualPrefs.searchQuery = card.word;
        els.searchInput.value = card.word;
        els.searchClearBtn.hidden = false;
        renderGroupBar();
        renderGrid(true);
        openCardLightbox(card);
    });

    syncPreferencesUI();
    renderGroupBar();
    renderGrid(true);

    return {
        handleClipboardPaste,
        refresh: () => {
            syncPreferencesUI();
            renderGroupBar();
            renderGrid(true);
        }
    };
}
