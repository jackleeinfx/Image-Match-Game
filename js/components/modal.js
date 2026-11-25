import { COLOR_GROUPS, GROUP_COLORS, STORAGE_KEYS, escapeHtml, formatEscapedBreaks } from '../config.js';
import { state, emit } from '../state.js';
import { translateText } from '../services/translate.js';
import { VOICE_OPTIONS, resolveSupportedVoice, speakEnglish } from '../services/tts.js';
import {
    clearDeletedMask,
    exportAnkiTsv,
    exportDeckCsv,
    exportFullBackupJson,
    exportGalleryCsv,
    getDeletedMaskEntries,
    removeDeletedMask
} from '../services/storage.js';
import { showToast } from './toast.js';

/**
 * Accessible Modal System & Specialized Dialogs
 */

let activeModalCleanup = null;

export function closeActiveModal() {
    if (typeof activeModalCleanup === 'function') {
        activeModalCleanup();
        activeModalCleanup = null;
    }
}

export function openModal({ title, bodyHtml = '', footerHtml = '', size = 'md', onMount = null, onClose = null }) {
    closeActiveModal();
    const root = document.getElementById('modalRoot');
    if (!root) return null;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const sizeClass = size === 'lg' ? 'modal-lg' : size === 'xl' ? 'modal-xl' : '';
    backdrop.innerHTML = `
        <div class="modal-dialog ${sizeClass}" role="dialog" aria-modal="true">
            <div class="modal-header">
                <h3>${escapeHtml(title)}</h3>
                <button type="button" class="modal-close" aria-label="關閉">&times;</button>
            </div>
            <div class="modal-body">${bodyHtml}</div>
            ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
        </div>
    `;

    root.appendChild(backdrop);

    const close = () => {
        document.removeEventListener('keydown', onEsc);
        backdrop.remove();
        if (activeModalCleanup === close) {
            activeModalCleanup = null;
        }
        if (typeof onClose === 'function') onClose();
    };

    const onEsc = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    };

    document.addEventListener('keydown', onEsc);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
    });
    backdrop.querySelector('.modal-close')?.addEventListener('click', close);

    activeModalCleanup = close;
    if (typeof onMount === 'function') {
        onMount(backdrop, close);
    }

    return { backdrop, close };
}

/* ---------- Confirm Modal ---------- */

export function openConfirmModal({ title = '確認操作', message, confirmLabel = '確定', cancelLabel = '取消', danger = false }) {
    return new Promise((resolve) => {
        let resolved = false;
        const finish = (val) => {
            if (!resolved) {
                resolved = true;
                resolve(val);
            }
        };

        openModal({
            title,
            bodyHtml: `<p style="color:var(--text-secondary);line-height:1.6;">${escapeHtml(message)}</p>`,
            footerHtml: `
                <button type="button" class="btn btn-ghost" data-act="cancel">${escapeHtml(cancelLabel)}</button>
                <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="confirm">${escapeHtml(confirmLabel)}</button>
            `,
            onMount: (el, close) => {
                el.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
                    finish(false);
                    close();
                });
                const confirmBtn = el.querySelector('[data-act="confirm"]');
                confirmBtn?.addEventListener('click', () => {
                    finish(true);
                    close();
                });
                setTimeout(() => confirmBtn?.focus(), 40);
            },
            onClose: () => finish(false)
        });
    });
}

/* ---------- Visual Card Create / Edit Modal ---------- */

export function openVisualCardModal({
    mode = 'create',
    previewUrl = '',
    word = '',
    chineseName = '',
    explanation = '',
    groupId = '',
    groups = [],
    onSubmit
}) {
    const groupOptions = [
        `<option value="">未分組</option>`,
        ...groups.map((g) => `<option value="${escapeHtml(g.id)}" ${g.id === groupId ? 'selected' : ''}>${escapeHtml(g.name)}</option>`)
    ].join('');

    const bodyHtml = `
        ${previewUrl ? `
            <div style="background:var(--bg-stage);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:10px;text-align:center;">
                <img src="${escapeHtml(previewUrl)}" alt="預覽圖片" style="max-height:190px;max-width:100%;object-fit:contain;border-radius:8px;">
            </div>
        ` : ''}
        <div class="form-field">
            <div class="form-field-header">
                <label for="vcWordInput">單詞 / 名稱 *</label>
                <button type="button" class="btn btn-xs btn-ghost" id="vcAutoTranslateBtn">🌐 自動翻譯中文名</button>
            </div>
            <input type="text" id="vcWordInput" class="field-input" value="${escapeHtml(word)}" placeholder="例如：Circuit breaker">
        </div>
        <div class="form-field">
            <label for="vcZhInput">中文名稱</label>
            <input type="text" id="vcZhInput" class="field-input" value="${escapeHtml(chineseName)}" placeholder="例如：斷路器（可選）">
        </div>
        <div class="form-field">
            <label for="vcGroupSelect">所屬群組</label>
            <select id="vcGroupSelect" class="field-select">${groupOptions}</select>
        </div>
        <div class="form-field">
            <label for="vcExpInput">詳細解釋 / 筆記</label>
            <textarea id="vcExpInput" class="field-textarea" placeholder="輸入英文定義、用途或記憶筆記…（可選，Ctrl+Enter 儲存）">${escapeHtml(explanation)}</textarea>
        </div>
    `;

    const footerHtml = `
        <button type="button" class="btn btn-ghost" data-act="cancel">取消</button>
        <button type="button" class="btn btn-primary" id="vcSaveBtn">${mode === 'create' ? '儲存圖卡' : '儲存變更'}</button>
    `;

    openModal({
        title: mode === 'create' ? '新增視覺圖卡' : '編輯視覺圖卡',
        bodyHtml,
        footerHtml,
        onMount: (el, close) => {
            const wordInput = el.querySelector('#vcWordInput');
            const zhInput = el.querySelector('#vcZhInput');
            const groupSelect = el.querySelector('#vcGroupSelect');
            const expInput = el.querySelector('#vcExpInput');
            const saveBtn = el.querySelector('#vcSaveBtn');
            const transBtn = el.querySelector('#vcAutoTranslateBtn');

            el.querySelector('[data-act="cancel"]')?.addEventListener('click', close);

            transBtn?.addEventListener('click', async () => {
                const w = wordInput.value.trim();
                if (!w) {
                    showToast('請先輸入英文單詞', { type: 'warning' });
                    wordInput.focus();
                    return;
                }
                transBtn.disabled = true;
                transBtn.textContent = '翻譯中…';
                try {
                    const zh = await translateText(w, 'en', 'zh-TW');
                    zhInput.value = zh;
                    showToast(`已翻譯：${zh}`, { type: 'success' });
                } catch (err) {
                    showToast(`翻譯失敗：${err.message}`, { type: 'error' });
                } finally {
                    transBtn.disabled = false;
                    transBtn.textContent = '🌐 自動翻譯中文名';
                }
            });

            const submit = async () => {
                const nextWord = wordInput.value.trim();
                if (!nextWord) {
                    showToast('單詞名稱不能為空', { type: 'error' });
                    wordInput.focus();
                    return;
                }
                saveBtn.disabled = true;
                saveBtn.textContent = '儲存中…';
                try {
                    await onSubmit({
                        word: nextWord,
                        chineseName: zhInput.value.trim(),
                        explanation: expInput.value.trim(),
                        groupId: groupSelect.value || null
                    });
                    close();
                } catch (err) {
                    showToast(`儲存失敗：${err.message}`, { type: 'error' });
                    saveBtn.disabled = false;
                    saveBtn.textContent = mode === 'create' ? '儲存圖卡' : '儲存變更';
                }
            };

            saveBtn?.addEventListener('click', submit);
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    submit();
                }
            });
            setTimeout(() => {
                wordInput?.focus();
                wordInput?.select();
            }, 40);
        }
    });
}

/* ---------- Group Edit / Create Modal ---------- */

export function openGroupEditModal({ group = null, onSave, onDelete = null }) {
    const selected = group?.color || GROUP_COLORS[0];
    const paletteHtml = COLOR_GROUPS.map((row) => `
        <div class="color-group-row">
            ${row.map((c) => `
                <button type="button" class="color-swatch ${c.toUpperCase() === selected.toUpperCase() ? 'selected' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>
            `).join('')}
        </div>
    `).join('');

    const bodyHtml = `
        <div class="form-field">
            <label for="grpNameInput">群組名稱 *</label>
            <input type="text" id="grpNameInput" class="field-input" value="${escapeHtml(group?.name || '')}" placeholder="例如：電氣控制、工業管件">
        </div>
        <div class="form-field">
            <div class="form-field-header">
                <label>群組代表色</label>
                <input type="color" id="grpCustomColor" value="${escapeHtml(selected)}" style="width:36px;height:24px;border:none;background:none;cursor:pointer;">
            </div>
            <div class="color-groups-grid" id="grpColorGrid">${paletteHtml}</div>
        </div>
    `;

    const footerHtml = `
        ${group && onDelete ? `<button type="button" class="btn btn-danger" id="grpDeleteBtn" style="margin-right:auto;">刪除群組</button>` : ''}
        <button type="button" class="btn btn-ghost" data-act="cancel">取消</button>
        <button type="button" class="btn btn-primary" id="grpSaveBtn">確定儲存</button>
    `;

    openModal({
        title: group ? '編輯群組' : '新增群組',
        bodyHtml,
        footerHtml,
        onMount: (el, close) => {
            let currentColor = selected;
            const nameInput = el.querySelector('#grpNameInput');
            const customColor = el.querySelector('#grpCustomColor');
            const swatches = el.querySelectorAll('.color-swatch');

            const selectColor = (hex) => {
                currentColor = hex;
                customColor.value = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#6366F1';
                swatches.forEach((s) => s.classList.toggle('selected', s.dataset.color.toUpperCase() === hex.toUpperCase()));
            };

            el.querySelector('#grpColorGrid')?.addEventListener('click', (e) => {
                const btn = e.target.closest('.color-swatch');
                if (btn) selectColor(btn.dataset.color);
            });

            customColor?.addEventListener('input', () => {
                selectColor(customColor.value);
            });

            el.querySelector('[data-act="cancel"]')?.addEventListener('click', close);

            el.querySelector('#grpSaveBtn')?.addEventListener('click', async () => {
                const name = nameInput.value.trim();
                if (!name) {
                    showToast('請輸入群組名稱', { type: 'warning' });
                    nameInput.focus();
                    return;
                }
                await onSave({ name, color: currentColor });
                close();
            });

            el.querySelector('#grpDeleteBtn')?.addEventListener('click', async () => {
                const ok = await openConfirmModal({
                    title: '刪除群組',
                    message: `確定要刪除群組「${group.name}」嗎？群組內的圖卡不會被刪除，僅變為未分組狀態。`,
                    confirmLabel: '確定刪除',
                    danger: true
                });
                if (ok) {
                    await onDelete(group.id);
                    close();
                }
            });

            setTimeout(() => nameInput?.focus(), 40);
        }
    });
}

/* ---------- Group Assign Modal ---------- */

export function openGroupAssignModal({ title = '選擇群組', currentGroupId = '', groups = [], onAssign }) {
    const itemsHtml = [
        `<button type="button" class="btn btn-ghost ${!currentGroupId ? 'active' : ''}" data-gid="" style="justify-content:flex-start;width:100%;">
            <span class="group-chip-dot" style="background:#64748B;"></span>
            <span>無群組（未分類）</span>
        </button>`,
        ...groups.map((g) => `
            <button type="button" class="btn btn-ghost ${currentGroupId === g.id ? 'active' : ''}" data-gid="${escapeHtml(g.id)}" style="justify-content:flex-start;width:100%;">
                <span class="group-chip-dot" style="background:${escapeHtml(g.color)};"></span>
                <span>${escapeHtml(g.name)}</span>
            </button>
        `)
    ].join('');

    openModal({
        title,
        bodyHtml: `<div style="display:flex;flex-direction:column;gap:8px;" id="grpAssignList">${itemsHtml}</div>`,
        footerHtml: `<button type="button" class="btn btn-ghost" data-act="cancel">取消</button>`,
        onMount: (el, close) => {
            el.querySelector('[data-act="cancel"]')?.addEventListener('click', close);
            el.querySelector('#grpAssignList')?.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-gid]');
                if (!btn) return;
                await onAssign(btn.dataset.gid || null);
                close();
            });
        }
    });
}

/* ---------- Image Lightbox Modal ---------- */

export function openLightboxModal({
    cards,
    startIndex = 0,
    groups = [],
    cardGroups = {},
    onSpeak,
    onEdit,
    onSendToDeck,
    onAssignGroup
}) {
    let idx = Math.max(0, Math.min(cards.length - 1, startIndex));
    const groupMap = new Map(groups.map((g) => [g.id, g]));

    const modalRef = openModal({
        title: `圖卡預覽 (${idx + 1} / ${cards.length})`,
        size: 'xl',
        bodyHtml: `<div id="lbContent"></div>`,
        footerHtml: `
            <button type="button" class="btn btn-ghost" id="lbPrevBtn">← 上一張</button>
            <button type="button" class="btn btn-ghost" id="lbNextBtn">下一張 →</button>
            <button type="button" class="btn btn-ghost" id="lbSendDeckBtn">↗ 存到單字庫</button>
            <button type="button" class="btn btn-primary" id="lbEditBtn">✎ 編輯此卡</button>
        `,
        onMount: (el, close) => {
            const titleEl = el.querySelector('.modal-header h3');
            const contentEl = el.querySelector('#lbContent');

            const renderCard = () => {
                const card = cards[idx];
                if (!card) return;
                const grp = groupMap.get(cardGroups[card.fileName]);
                titleEl.textContent = `圖卡預覽 (${idx + 1} / ${cards.length})`;

                contentEl.innerHTML = `
                    <div class="lightbox-stage">
                        <div class="lightbox-img-box">
                            <img src="${escapeHtml(card.publicUrl)}" alt="${escapeHtml(card.word)}">
                        </div>
                        <div class="lightbox-info">
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                <span class="group-chip" id="lbGroupBtn" style="cursor:pointer;">
                                    <span class="group-chip-dot" style="background:${escapeHtml(grp?.color || '#64748B')}"></span>
                                    <span>${escapeHtml(grp?.name || '未分組')}</span>
                                </span>
                                <button type="button" class="btn btn-xs btn-ghost" id="lbSpeakBtn">🔊 發音朗讀</button>
                            </div>
                            <h2 style="font-size:24px;font-weight:800;line-height:1.25;">${escapeHtml(card.word)}</h2>
                            <div style="font-size:17px;font-weight:600;color:var(--accent-emerald-text);">
                                ${card.chineseName ? escapeHtml(card.chineseName) : '<span style="color:var(--text-muted);font-weight:400;">尚未填寫中文名</span>'}
                            </div>
                            <div style="padding:12px;border-radius:var(--radius-md);background:var(--bg-input);border:1px solid var(--border-subtle);font-size:13.5px;line-height:1.6;color:var(--text-secondary);max-height:220px;overflow-y:auto;">
                                ${card.explanation ? formatEscapedBreaks(card.explanation) : '<span style="color:var(--text-muted);">尚未填寫解釋內容</span>'}
                            </div>
                            ${card.explanation ? `
                                <div>
                                    <button type="button" class="btn btn-xs btn-ghost" id="lbTransExpBtn">🌐 翻譯解釋內容</button>
                                    <div id="lbTransResult" class="vcard-exp-trans" hidden style="margin-top:8px;"></div>
                                </div>
                            ` : ''}
                            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);word-break:break-all;">
                                檔案：${escapeHtml(card.fileName)}
                            </div>
                        </div>
                    </div>
                `;

                contentEl.querySelector('#lbSpeakBtn')?.addEventListener('click', () => onSpeak?.(card.word));
                contentEl.querySelector('#lbGroupBtn')?.addEventListener('click', () => {
                    close();
                    onAssignGroup?.(card);
                });
                const transBtn = contentEl.querySelector('#lbTransExpBtn');
                transBtn?.addEventListener('click', async () => {
                    const resBox = contentEl.querySelector('#lbTransResult');
                    transBtn.disabled = true;
                    transBtn.textContent = '翻譯中…';
                    try {
                        const zh = await translateText(card.explanation, 'en', 'zh-TW');
                        resBox.innerHTML = formatEscapedBreaks(zh);
                        resBox.hidden = false;
                    } catch (err) {
                        showToast(`翻譯失敗：${err.message}`, { type: 'error' });
                    } finally {
                        transBtn.disabled = false;
                        transBtn.textContent = '🌐 翻譯解釋內容';
                    }
                });
            };

            const goPrev = () => {
                idx = (idx - 1 + cards.length) % cards.length;
                renderCard();
            };
            const goNext = () => {
                idx = (idx + 1) % cards.length;
                renderCard();
            };

            el.querySelector('#lbPrevBtn')?.addEventListener('click', goPrev);
            el.querySelector('#lbNextBtn')?.addEventListener('click', goNext);
            el.querySelector('#lbEditBtn')?.addEventListener('click', () => {
                const c = cards[idx];
                close();
                onEdit?.(c);
            });
            el.querySelector('#lbSendDeckBtn')?.addEventListener('click', () => {
                onSendToDeck?.(cards[idx]);
            });

            const onKey = (e) => {
                if (e.key === 'ArrowLeft') goPrev();
                else if (e.key === 'ArrowRight') goNext();
            };
            document.addEventListener('keydown', onKey);
            const origClose = close;
            activeModalCleanup = () => {
                document.removeEventListener('keydown', onKey);
                origClose();
            };

            renderCard();
        }
    });
    return modalRef;
}

/* ---------- Settings, Cloud Health & Export Modal ---------- */

export function openSettingsModal({ onPingNow, onToggleTheme, onSaveSpeechRate, onSaveVoice, onRestoreMasked }) {
    const maskedEntries = getDeletedMaskEntries();
    const currentVoice = resolveSupportedVoice(state.deckSettings.englishTts);

    const voiceGroupsMap = new Map();
    for (const v of VOICE_OPTIONS) {
        if (!voiceGroupsMap.has(v.group)) voiceGroupsMap.set(v.group, []);
        voiceGroupsMap.get(v.group).push(v);
    }
    const voiceOptionsHtml = Array.from(voiceGroupsMap.entries()).map(([grp, opts]) => `
        <optgroup label="${escapeHtml(grp)}">
            ${opts.map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === currentVoice ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
        </optgroup>
    `).join('');

    const h = state.cloudHealth;
    const lastTimeStr = h.lastActivate ? new Date(h.lastActivate).toLocaleString('zh-TW') : '尚未記錄';

    const bodyHtml = `
        <div class="form-field">
            <div class="form-field-header">
                <label>Supabase 雙資料庫連線與保活狀態</label>
                <button type="button" class="btn btn-xs btn-primary" id="stPingNowBtn">立即保活測試</button>
            </div>
            <div class="settings-grid">
                <div class="health-card">
                    <div class="health-card-top">
                        <span>🖼️ Project 1 · 視覺圖卡庫</span>
                        <span id="stP1Badge">${h.project1?.ok ? '🟢 正常' : '🟡 待檢'}</span>
                    </div>
                    <div class="health-meta">圖卡數：${state.visualCards.length} · 群組：${state.groups.length}</div>
                    <div class="health-meta" id="stP1Lat">${h.project1?.latencyMs ? `延遲：${h.project1.latencyMs} ms` : '6 天自動保活周期'}</div>
                </div>
                <div class="health-card">
                    <div class="health-card-top">
                        <span>📚 Project 2 · 單字長句庫</span>
                        <span id="stP2Badge">${h.project2?.ok ? '🟢 正常' : '🟡 待檢'}</span>
                    </div>
                    <div class="health-meta">卡片數：${state.deckCards.length} · 即時同步已啟用</div>
                    <div class="health-meta" id="stP2Lat">${h.project2?.latencyMs ? `延遲：${h.project2.latencyMs} ms` : '6 天自動保活周期'}</div>
                </div>
            </div>
            <div class="health-meta" id="stLastPingText">上次保活記錄：${escapeHtml(lastTimeStr)}</div>
        </div>

        <div class="settings-grid">
            <div class="form-field">
                <label for="stVoiceSelect">英文朗讀引擎 / 聲線</label>
                <select id="stVoiceSelect" class="field-select">${voiceOptionsHtml}</select>
            </div>
            <div class="form-field">
                <div class="form-field-header">
                    <label for="stRateRange">預設語音速度</label>
                    <span id="stRateVal" style="font-family:var(--font-mono);font-size:12px;">${state.visualPrefs.speechRate}x</span>
                </div>
                <input type="range" id="stRateRange" min="0.4" max="1.3" step="0.05" value="${state.visualPrefs.speechRate}">
            </div>
        </div>

        <div class="settings-grid">
            <div class="form-field">
                <label for="stCompressionSelect">上傳圖片壓縮品質</label>
                <select id="stCompressionSelect" class="field-select">
                    <option value="light" ${state.visualPrefs.compressionPreset === 'light' ? 'selected' : ''}>極致省流量（≤ 10KB，沿用舊版規格）</option>
                    <option value="hq" ${state.visualPrefs.compressionPreset === 'hq' ? 'selected' : ''}>高畫質圖解（≤ 50KB，線條/文字更清晰）</option>
                </select>
            </div>
            <div class="form-field">
                <label>外觀與快捷鍵</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button type="button" class="btn btn-sm btn-ghost" id="stThemeBtn">🌓 切換主題 (${state.theme === 'dark' ? '目前深色' : '目前淺色'})</button>
                    <button type="button" class="btn btn-sm btn-ghost" id="stTestSpeakBtn">🔊 試聽語音</button>
                </div>
            </div>
        </div>

        <div class="form-field">
            <label>資料匯出與本機完整備份</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn btn-sm btn-ghost" id="expJsonBtn">📦 完整備份 (.json)</button>
                <button type="button" class="btn btn-sm btn-ghost" id="expGalleryCsvBtn">🖼️ 圖卡表格 (.csv)</button>
                <button type="button" class="btn btn-sm btn-ghost" id="expDeckCsvBtn">📚 單字長句 (.csv)</button>
                <button type="button" class="btn btn-sm btn-ghost" id="expAnkiBtn">🃏 Anki 匯入檔 (.txt)</button>
            </div>
        </div>

        <div class="form-field">
            <div class="form-field-header">
                <label>24 小時本機遮蔽清單（已刪除圖卡快取：${maskedEntries.length} 張）</label>
                ${maskedEntries.length > 0 ? `<button type="button" class="btn btn-xs btn-ghost" id="stClearMaskBtn">全部解除遮蔽</button>` : ''}
            </div>
            ${maskedEntries.length === 0
                ? `<div class="health-meta">目前沒有被本機遮蔽的圖卡。</div>`
                : `<div style="max-height:110px;overflow-y:auto;display:flex;flex-wrap:wrap;gap:6px;" id="stMaskList">
                    ${maskedEntries.map((m) => `
                        <button type="button" class="btn btn-xs btn-ghost" data-restore-file="${escapeHtml(m.n)}" title="點擊恢復顯示">
                            ↺ ${escapeHtml(m.n)}
                        </button>
                    `).join('')}
                </div>`
            }
        </div>

        <div class="health-card">
            <div class="health-card-top">⌨️ 鍵盤快捷鍵指南</div>
            <div class="health-meta" style="line-height:1.7;">
                <code>Ctrl + K</code> 或 <code>/</code> 全域搜尋命令面板 · <code>Ctrl + V</code> 圖卡工坊快速貼圖 · <code>Alt + 1~4</code> 切換分頁 · <code>Space</code> 測驗翻卡 · <code>1~4</code> 選擇題作答
            </div>
        </div>
    `;

    openModal({
        title: '系統設定 · 雲端保活 · 資料備份',
        size: 'lg',
        bodyHtml,
        footerHtml: `<button type="button" class="btn btn-primary" data-act="done">完成</button>`,
        onMount: (el, close) => {
            el.querySelector('[data-act="done"]')?.addEventListener('click', close);

            const pingBtn = el.querySelector('#stPingNowBtn');
            pingBtn?.addEventListener('click', async () => {
                pingBtn.disabled = true;
                pingBtn.textContent = '測試中…';
                const res = await onPingNow();
                if (res) {
                    el.querySelector('#stP1Badge').textContent = res.project1.ok ? '🟢 正常' : '🔴 失敗';
                    el.querySelector('#stP2Badge').textContent = res.project2.ok ? '🟢 正常' : '🔴 失敗';
                    el.querySelector('#stP1Lat').textContent = res.project1.ok ? `延遲：${res.project1.latencyMs} ms` : res.project1.error;
                    el.querySelector('#stP2Lat').textContent = res.project2.ok ? `延遲：${res.project2.latencyMs} ms` : res.project2.error;
                    el.querySelector('#stLastPingText').textContent = `上次保活記錄：${new Date().toLocaleString('zh-TW')}`;
                }
                pingBtn.disabled = false;
                pingBtn.textContent = '立即保活測試';
            });

            el.querySelector('#stVoiceSelect')?.addEventListener('change', (e) => {
                onSaveVoice?.(e.target.value);
            });

            const rateSlider = el.querySelector('#stRateRange');
            const rateVal = el.querySelector('#stRateVal');
            rateSlider?.addEventListener('input', () => {
                rateVal.textContent = `${rateSlider.value}x`;
            });
            rateSlider?.addEventListener('change', () => {
                onSaveSpeechRate?.(parseFloat(rateSlider.value));
            });

            el.querySelector('#stCompressionSelect')?.addEventListener('change', (e) => {
                state.visualPrefs.compressionPreset = e.target.value;
                localStorage.setItem(STORAGE_KEYS.COMPRESSION_PRESET, e.target.value);
                showToast(`已切換壓縮模式：${e.target.value === 'hq' ? '高畫質 (≤50KB)' : '省流量 (≤10KB)'}`, { type: 'success' });
            });

            el.querySelector('#stThemeBtn')?.addEventListener('click', () => {
                onToggleTheme?.();
                el.querySelector('#stThemeBtn').textContent = `🌓 切換主題 (${state.theme === 'dark' ? '目前深色' : '目前淺色'})`;
            });

            el.querySelector('#stTestSpeakBtn')?.addEventListener('click', () => {
                speakEnglish('LexiVault studio is ready for your study session.', {
                    voiceSetting: state.deckSettings.englishTts,
                    rate: state.visualPrefs.speechRate
                });
            });

            el.querySelector('#expJsonBtn')?.addEventListener('click', () => {
                exportFullBackupJson({
                    visualCards: state.visualCards,
                    groups: state.groups,
                    cardGroups: state.cardGroups,
                    deckCards: state.deckCards,
                    deckSettings: state.deckSettings
                });
                showToast('已匯出完整 JSON 備份檔', { type: 'success' });
            });
            el.querySelector('#expGalleryCsvBtn')?.addEventListener('click', () => {
                exportGalleryCsv(state.visualCards, state.groups, state.cardGroups);
                showToast('已匯出圖卡 CSV 表格', { type: 'success' });
            });
            el.querySelector('#expDeckCsvBtn')?.addEventListener('click', () => {
                exportDeckCsv(state.deckCards);
                showToast('已匯出單字長句 CSV 表格', { type: 'success' });
            });
            el.querySelector('#expAnkiBtn')?.addEventListener('click', () => {
                exportAnkiTsv(state.visualCards, state.deckCards);
                showToast('已匯出 Anki 匯入檔 (.txt)', { type: 'success' });
            });

            el.querySelector('#stClearMaskBtn')?.addEventListener('click', async () => {
                clearDeletedMask();
                close();
                await onRestoreMasked?.();
                showToast('已清除本機遮蔽清單並重新載入圖卡', { type: 'success' });
            });

            el.querySelector('#stMaskList')?.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-restore-file]');
                if (!btn) return;
                removeDeletedMask(btn.dataset.restoreFile);
                btn.remove();
                await onRestoreMasked?.();
                showToast('已恢復該圖卡顯示', { type: 'success' });
            });

            emit('settings:opened');
        }
    });
}
