import { escapeHtml } from '../config.js';
import { state, emit, subscribe } from '../state.js';
import {
    exportAnkiTsv,
    exportDeckCsv,
    exportFullBackupJson,
    exportGalleryCsv,
    getActivitySummary
} from '../services/storage.js';
import { translateText } from '../services/translate.js';
import { upsertVisualCardData } from '../services/supabase.js';
import { showToast } from '../components/toast.js';

/**
 * View 4: Learning Insights & Data Management Dashboard
 */

export function initDashboardView({ onSwitchTab }) {
    const root = document.getElementById('view-dashboard');
    if (!root) return {};

    function render() {
        const vCards = state.visualCards;
        const dCards = state.deckCards;
        const activity = getActivitySummary();

        const withZh = vCards.filter((c) => Boolean(c.chineseName?.trim())).length;
        const withExp = vCards.filter((c) => Boolean(c.explanation?.trim())).length;
        const zhPct = vCards.length ? Math.round((withZh / vCards.length) * 100) : 0;

        const wordsOnly = dCards.filter((c) => (c.card_type || 'word') === 'word').length;
        const sentOnly = dCards.filter((c) => c.card_type === 'sentence').length;

        // Group breakdown
        const counts = new Map();
        let ungrouped = 0;
        const validIds = new Set(state.groups.map((g) => g.id));
        for (const c of vCards) {
            const gid = state.cardGroups[c.fileName];
            if (gid && validIds.has(gid)) counts.set(gid, (counts.get(gid) || 0) + 1);
            else ungrouped += 1;
        }
        const maxGroupCount = Math.max(1, ungrouped, ...Array.from(counts.values()));

        // Star breakdown
        const starCounts = [3, 2, 1, 0].map((s) => ({
            star: s,
            label: s === 0 ? '未評星 (0★)' : '★'.repeat(s),
            count: dCards.filter((c) => (s === 3 ? (c.rating || 0) >= 3 : (c.rating || 0) === s)).length
        }));
        const maxStar = Math.max(1, ...starCounts.map((x) => x.count));

        // 14-day heatmap max
        const maxDay = Math.max(1, ...activity.days.map((d) => d.count));

        // Enrich queue (cards missing Chinese name)
        const needZh = vCards.filter((c) => !c.chineseName?.trim() && !c.imageFailed).slice(0, 8);

        root.innerHTML = `
            <div class="dash-kpis">
                <div class="glass-panel kpi-card">
                    <span class="kpi-label">🖼️ 視覺圖卡總數</span>
                    <span class="kpi-value">${vCards.length}</span>
                    <span class="kpi-sub">已填寫中文 ${withZh} 張 (${zhPct}%) · 詳細解釋 ${withExp} 張</span>
                </div>
                <div class="glass-panel kpi-card">
                    <span class="kpi-label">📚 單字與長句庫</span>
                    <span class="kpi-value">${dCards.length}</span>
                    <span class="kpi-sub">單詞 ${wordsOnly} 筆 · 長句 ${sentOnly} 筆</span>
                </div>
                <div class="glass-panel kpi-card">
                    <span class="kpi-label">🔥 連續學習天數</span>
                    <span class="kpi-value">${activity.streak} <small style="font-size:14px;font-weight:600;">天</small></span>
                    <span class="kpi-sub">累計測驗複習 ${activity.totalReviews} 次</span>
                </div>
                <div class="glass-panel kpi-card">
                    <span class="kpi-label">⚡ 今日複習次數</span>
                    <span class="kpi-value">${activity.todayCount}</span>
                    <span class="kpi-sub">在「互動測驗」進行練習將自動累積</span>
                </div>
            </div>

            <div class="dash-panels">
                <div class="glass-panel dash-panel">
                    <h3><span>🏷️ 視覺圖卡群組分佈</span><span style="font-size:12px;color:var(--text-muted);">點擊直接瀏覽或開戰測驗</span></h3>
                    ${state.groups.map((g) => {
                        const cnt = counts.get(g.id) || 0;
                        const w = Math.round((cnt / maxGroupCount) * 100);
                        return `
                            <div class="bar-row">
                                <div class="bar-row-head">
                                    <span style="display:flex;align-items:center;gap:7px;font-weight:600;">
                                        <span class="group-chip-dot" style="background:${escapeHtml(g.color)}"></span>
                                        <span>${escapeHtml(g.name)}</span>
                                    </span>
                                    <span style="display:flex;align-items:center;gap:6px;">
                                        <span style="font-family:var(--font-mono);color:var(--text-secondary);">${cnt} 張</span>
                                        <button type="button" class="btn btn-xs btn-ghost" data-dash-browse="${escapeHtml(g.id)}">瀏覽</button>
                                        ${cnt >= 4 ? `<button type="button" class="btn btn-xs btn-primary" data-dash-quiz="${escapeHtml(g.id)}">測驗</button>` : ''}
                                    </span>
                                </div>
                                <div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${escapeHtml(g.color)};"></div></div>
                            </div>
                        `;
                    }).join('')}
                    <div class="bar-row">
                        <div class="bar-row-head">
                            <span style="display:flex;align-items:center;gap:7px;font-weight:600;">
                                <span class="group-chip-dot" style="background:#64748B"></span>
                                <span>未分組圖卡</span>
                            </span>
                            <span style="display:flex;align-items:center;gap:6px;">
                                <span style="font-family:var(--font-mono);color:var(--text-secondary);">${ungrouped} 張</span>
                                <button type="button" class="btn btn-xs btn-ghost" data-dash-browse="__NO_GROUP__">瀏覽</button>
                            </span>
                        </div>
                        <div class="bar-track"><div class="bar-fill" style="width:${Math.round((ungrouped / maxGroupCount) * 100)}%;background:#64748B;"></div></div>
                    </div>
                </div>

                <div style="display:flex;flex-direction:column;gap:16px;">
                    <div class="glass-panel dash-panel">
                        <h3><span>📈 近 14 天學習熱力</span></h3>
                        <div class="heatmap-row">
                            ${activity.days.map((d) => {
                                const hPct = d.count > 0 ? Math.max(16, Math.round((d.count / maxDay) * 100)) : 8;
                                return `
                                    <div class="heatmap-col" title="${d.dateKey}：${d.count} 次複習">
                                        <div class="heatmap-bar ${d.count > 0 ? 'active' : ''}" style="height:${hPct}%;"></div>
                                        <span class="heatmap-day">${d.label.split('/')[1]}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <div class="glass-panel dash-panel">
                        <h3><span>⭐ 單字庫星級分佈</span></h3>
                        ${starCounts.map((s) => `
                            <div class="bar-row">
                                <div class="bar-row-head">
                                    <span>${s.label}</span>
                                    <span style="font-family:var(--font-mono);color:var(--text-secondary);">${s.count} 張</span>
                                </div>
                                <div class="bar-track"><div class="bar-fill" style="width:${Math.round((s.count / maxStar) * 100)}%;background:var(--accent-amber);"></div></div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="glass-panel dash-panel">
                        <h3><span>💾 一鍵匯出與資料備份</span></h3>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button type="button" class="btn btn-sm btn-primary" id="dbExpJson">📦 完整 JSON 備份</button>
                            <button type="button" class="btn btn-sm btn-ghost" id="dbExpGalleryCsv">🖼️ 圖卡 CSV</button>
                            <button type="button" class="btn btn-sm btn-ghost" id="dbExpDeckCsv">📚 單字長句 CSV</button>
                            <button type="button" class="btn btn-sm btn-ghost" id="dbExpAnki">🃏 Anki 匯入檔</button>
                        </div>
                    </div>
                </div>
            </div>

            ${needZh.length > 0 ? `
                <div class="glass-panel dash-panel" style="margin-top:16px;">
                    <h3><span>✍️ 待補充中文名圖卡（顯示前 ${needZh.length} 張）</span></h3>
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;" id="dbEnrichGrid">
                        ${needZh.map((c) => `
                            <div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:var(--radius-md);background:var(--bg-input);border:1px solid var(--border-subtle);">
                                <img src="${escapeHtml(c.publicUrl)}" alt="" style="width:46px;height:46px;border-radius:8px;object-fit:cover;flex-shrink:0;">
                                <div style="min-width:0;flex:1;">
                                    <div style="font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(c.word)}</div>
                                    <div style="font-size:11.5px;color:var(--text-muted);">尚未填寫中文名</div>
                                </div>
                                <button type="button" class="btn btn-xs btn-ghost" data-enrich-trans="${escapeHtml(c.fileName)}">🌐 翻譯補齊</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    }

    root.addEventListener('click', async (e) => {
        const browseBtn = e.target.closest('[data-dash-browse]');
        if (browseBtn) {
            onSwitchTab('gallery');
            emit('gallery:isolateGroup', browseBtn.dataset.dashBrowse);
            return;
        }
        const quizBtn = e.target.closest('[data-dash-quiz]');
        if (quizBtn) {
            onSwitchTab('arena');
            emit('arena:launchGroup', quizBtn.dataset.dashQuiz);
            return;
        }
        if (e.target.closest('#dbExpJson')) {
            exportFullBackupJson({
                visualCards: state.visualCards,
                groups: state.groups,
                cardGroups: state.cardGroups,
                deckCards: state.deckCards,
                deckSettings: state.deckSettings
            });
            showToast('已下載完整 JSON 備份', { type: 'success' });
            return;
        }
        if (e.target.closest('#dbExpGalleryCsv')) {
            exportGalleryCsv(state.visualCards, state.groups, state.cardGroups);
            showToast('已下載圖卡 CSV', { type: 'success' });
            return;
        }
        if (e.target.closest('#dbExpDeckCsv')) {
            exportDeckCsv(state.deckCards);
            showToast('已下載單字長句 CSV', { type: 'success' });
            return;
        }
        if (e.target.closest('#dbExpAnki')) {
            exportAnkiTsv(state.visualCards, state.deckCards);
            showToast('已下載 Anki 匯入檔', { type: 'success' });
            return;
        }
        const enrichBtn = e.target.closest('[data-enrich-trans]');
        if (enrichBtn) {
            const fn = enrichBtn.dataset.enrichTrans;
            const card = state.visualCards.find((c) => c.fileName === fn);
            if (!card) return;
            enrichBtn.disabled = true;
            enrichBtn.textContent = '翻譯中…';
            try {
                const zh = await translateText(card.word, 'en', 'zh-TW');
                await upsertVisualCardData(card.fileName, card.word, zh, card.explanation);
                card.chineseName = zh;
                emit('visual:loaded');
                render();
                showToast(`已補齊「${card.word}」→ ${zh}`, { type: 'success' });
            } catch (err) {
                showToast(`補齊失敗：${err.message}`, { type: 'error' });
                enrichBtn.disabled = false;
                enrichBtn.textContent = '🌐 翻譯補齊';
            }
        }
    });

    subscribe('visual:loaded', render);
    subscribe('deck:loaded', render);
    subscribe('vault:changed', render);

    render();
    return { refresh: render };
}
