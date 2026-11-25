import { escapeHtml, formatEscapedBreaks } from '../config.js';
import { state, subscribe } from '../state.js';
import { speakEnglish } from '../services/tts.js';
import {
    getMatchBestTime,
    isCardDueForReview,
    recordReviewResult,
    saveMatchBestTime
} from '../services/storage.js';
import { showToast } from '../components/toast.js';

/**
 * View 3: Interactive Study Arena
 * 4 Modes:
 *  1. 3D Flip SRS (Space flip, 1/2/3 confidence)
 *  2. Visual / Meaning 4-Choice Quiz (Image<->Word or EN<->ZH, 1-4 hotkeys, wrong retry)
 *  3. Audio Dictation Sprint (Replay + Slow Play + Progressive Hint + Char Diff)
 *  4. Pair Match Game (6 or 8 pairs, Image<->Word or EN<->ZH, timer & best time)
 */

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function normalizeAnswer(str) {
    return String(str || '')
        .trim()
        .toLowerCase()
        .replace(/[.,!?;:'"()\-–—]/g, '')
        .replace(/\s+/g, ' ');
}

function launchConfetti() {
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const colors = ['#6366F1', '#06B6D4', '#10B981', '#F59E0B', '#EC4899'];

    const particles = Array.from({ length: 85 }, () => ({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 140,
        vx: (Math.random() - 0.5) * 4,
        vy: 3 + Math.random() * 4,
        size: 5 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.2
    }));

    let frames = 0;
    function tick() {
        frames += 1;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vrot;
            p.vy += 0.06;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            ctx.restore();
        }
        if (frames < 145) {
            requestAnimationFrame(tick);
        } else {
            canvas.remove();
        }
    }
    requestAnimationFrame(tick);
}

export function initArenaView() {
    const root = document.getElementById('view-arena');
    if (!root) return {};

    let selectedSource = 'visual:all';
    let roundLimit = 15;
    let quizDirection = 'forward'; // 'forward' = Image/EN -> Word/ZH, 'reverse' = Word/ZH -> Image/EN
    let activeSession = null;
    let matchTimerId = null;

    function clearMatchTimer() {
        if (matchTimerId) {
            clearInterval(matchTimerId);
            matchTimerId = null;
        }
    }

    function buildSourcePool(sourceKey) {
        if (sourceKey === 'visual:all') {
            return state.visualCards
                .filter((c) => !c.imageFailed)
                .map((c) => ({
                    key: `v:${c.fileName}`,
                    kind: 'visual',
                    english: c.word,
                    chinese: c.chineseName,
                    explanation: c.explanation,
                    imageUrl: c.publicUrl
                }));
        }
        if (sourceKey.startsWith('group:')) {
            const gid = sourceKey.slice(6);
            return state.visualCards
                .filter((c) => !c.imageFailed && state.cardGroups[c.fileName] === gid)
                .map((c) => ({
                    key: `v:${c.fileName}`,
                    kind: 'visual',
                    english: c.word,
                    chinese: c.chineseName,
                    explanation: c.explanation,
                    imageUrl: c.publicUrl
                }));
        }
        if (sourceKey === 'deck:all') {
            return state.deckCards.map((c) => ({
                key: `d:${c.id ?? c.english}`,
                kind: 'deck',
                english: c.english,
                chinese: c.chinese,
                explanation: '',
                imageUrl: null
            }));
        }
        if (sourceKey === 'deck:word') {
            return state.deckCards
                .filter((c) => (c.card_type || 'word') === 'word')
                .map((c) => ({
                    key: `d:${c.id ?? c.english}`,
                    kind: 'deck',
                    english: c.english,
                    chinese: c.chinese,
                    explanation: '',
                    imageUrl: null
                }));
        }
        if (sourceKey === 'deck:sentence') {
            return state.deckCards
                .filter((c) => c.card_type === 'sentence')
                .map((c) => ({
                    key: `d:${c.id ?? c.english}`,
                    kind: 'deck',
                    english: c.english,
                    chinese: c.chinese,
                    explanation: '',
                    imageUrl: null
                }));
        }
        if (sourceKey === 'deck:starred') {
            return state.deckCards
                .filter((c) => (c.rating || 0) >= 2)
                .map((c) => ({
                    key: `d:${c.id ?? c.english}`,
                    kind: 'deck',
                    english: c.english,
                    chinese: c.chinese,
                    explanation: '',
                    imageUrl: null
                }));
        }
        if (sourceKey === 'srs:due') {
            const vPool = state.visualCards
                .filter((c) => !c.imageFailed && isCardDueForReview(`v:${c.fileName}`))
                .map((c) => ({
                    key: `v:${c.fileName}`,
                    kind: 'visual',
                    english: c.word,
                    chinese: c.chineseName,
                    explanation: c.explanation,
                    imageUrl: c.publicUrl
                }));
            const dPool = state.deckCards
                .filter((c) => isCardDueForReview(`d:${c.id ?? c.english}`))
                .map((c) => ({
                    key: `d:${c.id ?? c.english}`,
                    kind: 'deck',
                    english: c.english,
                    chinese: c.chinese,
                    explanation: '',
                    imageUrl: null
                }));
            return [...vPool, ...dPool];
        }
        return [];
    }

    function speakPrompt(text, rateOverride = null) {
        speakEnglish(text, {
            voiceSetting: state.deckSettings.englishTts,
            rate: rateOverride ?? state.visualPrefs.speechRate
        });
    }

    /* ---------- Render Lobby ---------- */

    function renderLobby() {
        clearMatchTimer();
        activeSession = null;

        const pool = buildSourcePool(selectedSource);
        const groupOptions = state.groups.map((g) => {
            const cnt = state.visualCards.filter((c) => state.cardGroups[c.fileName] === g.id).length;
            return `<option value="group:${escapeHtml(g.id)}" ${selectedSource === `group:${g.id}` ? 'selected' : ''}>群組：${escapeHtml(g.name)} (${cnt})</option>`;
        }).join('');

        root.innerHTML = `
            <div class="arena-shell">
                <div class="glass-panel arena-config-bar">
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <h2 style="font-size:20px;font-weight:800;">🎯 互動測驗與記憶競技場</h2>
                        <span style="font-size:13px;color:var(--text-secondary);">選擇你的詞庫來源，立即開始 4 種沉浸式練習模式</span>
                    </div>

                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <select id="arSourceSelect" class="field-select" style="width:auto;min-width:210px;">
                            <option value="visual:all" ${selectedSource === 'visual:all' ? 'selected' : ''}>🖼️ 全部視覺圖卡 (${state.visualCards.length})</option>
                            ${groupOptions}
                            <option value="deck:all" ${selectedSource === 'deck:all' ? 'selected' : ''}>📚 單字長句庫 - 全部 (${state.deckCards.length})</option>
                            <option value="deck:word" ${selectedSource === 'deck:word' ? 'selected' : ''}>🔤 單字長句庫 - 僅單詞</option>
                            <option value="deck:sentence" ${selectedSource === 'deck:sentence' ? 'selected' : ''}>💬 單字長句庫 - 僅長句</option>
                            <option value="deck:starred" ${selectedSource === 'deck:starred' ? 'selected' : ''}>⭐ 重點星級卡片 (≥2★)</option>
                            <option value="srs:due" ${selectedSource === 'srs:due' ? 'selected' : ''}>🧠 SRS 待複習 / 錯題</option>
                        </select>

                        <select id="arLimitSelect" class="field-select" style="width:auto;">
                            <option value="10" ${roundLimit === 10 ? 'selected' : ''}>每輪 10 題</option>
                            <option value="15" ${roundLimit === 15 ? 'selected' : ''}>每輪 15 題</option>
                            <option value="25" ${roundLimit === 25 ? 'selected' : ''}>每輪 25 題</option>
                            <option value="9999" ${roundLimit === 9999 ? 'selected' : ''}>全部練習</option>
                        </select>
                    </div>
                </div>

                <div style="font-size:13px;color:var(--text-secondary);padding:0 4px;">
                    目前可用題庫：<strong>${pool.length}</strong> 張卡片
                </div>

                <div class="arena-setup-grid">
                    <button type="button" class="mode-card" data-start-mode="flip" ${pool.length < 1 ? 'disabled' : ''}>
                        <span class="mode-card-icon">🃏</span>
                        <h3>3D 翻轉記憶卡</h3>
                        <p>立體翻轉卡片搭配 SRS 間隔複習記錄。空白鍵翻卡、1/2/3 快速評估記憶程度。</p>
                    </button>

                    <button type="button" class="mode-card" data-start-mode="quiz" ${pool.length < 4 ? 'disabled' : ''}>
                        <span class="mode-card-icon" style="background:var(--accent-cyan-soft);">🖼️</span>
                        <h3>圖文四選一測驗</h3>
                        <p>看圖選英文 / 看英文選圖（支援單字庫中英互測），數字鍵 1~4 極速作答與錯題重練。</p>
                    </button>

                    <button type="button" class="mode-card" data-start-mode="dictation" ${pool.length < 1 ? 'disabled' : ''}>
                        <span class="mode-card-icon" style="background:var(--accent-emerald-soft);">🎧</span>
                        <h3>聽音拼寫挑戰</h3>
                        <p>播放標準發音與慢速提示，逐字比對你的拼寫精準度，強化技術詞彙聽寫。</p>
                    </button>

                    <button type="button" class="mode-card" data-start-mode="match" ${pool.length < 4 ? 'disabled' : ''}>
                        <span class="mode-card-icon" style="background:var(--accent-amber-soft);">🧩</span>
                        <h3>極速配對消除</h3>
                        <p>圖片與單字（或英文與中文）限時配對消消樂，記錄個人最佳通關秒數。</p>
                    </button>
                </div>
            </div>
        `;

        root.querySelector('#arSourceSelect')?.addEventListener('change', (e) => {
            selectedSource = e.target.value;
            renderLobby();
        });
        root.querySelector('#arLimitSelect')?.addEventListener('change', (e) => {
            roundLimit = Number(e.target.value) || 15;
        });
        root.querySelectorAll('[data-start-mode]').forEach((btn) => {
            btn.addEventListener('click', () => startMode(btn.dataset.startMode));
        });
    }

    /* ---------- Start Any Mode ---------- */

    function startMode(mode, customPool = null) {
        const rawPool = customPool || buildSourcePool(selectedSource);
        if (rawPool.length === 0) {
            showToast('目前選擇的詞庫沒有足夠卡片', { type: 'warning' });
            return;
        }
        const items = shuffle(rawPool).slice(0, roundLimit);

        if (mode === 'flip') {
            activeSession = { mode: 'flip', items, idx: 0, flipped: false, stats: { again: 0, hard: 0, good: 0 } };
            renderFlipStage();
        } else if (mode === 'quiz') {
            if (rawPool.length < 4) {
                showToast('四選一至少需要 4 張卡片', { type: 'warning' });
                return;
            }
            activeSession = { mode: 'quiz', allPool: rawPool, items, idx: 0, score: 0, streak: 0, maxStreak: 0, wrongItems: [], answered: false };
            renderQuizStage();
        } else if (mode === 'dictation') {
            activeSession = { mode: 'dictation', items, idx: 0, score: 0, hintLevel: 0, checked: false, wrongItems: [] };
            renderDictationStage();
        } else if (mode === 'match') {
            const pairCount = Math.min(rawPool.length >= 8 ? 8 : 6, rawPool.length);
            const chosen = shuffle(rawPool).slice(0, pairCount);
            const tiles = [];
            chosen.forEach((item, i) => {
                tiles.push({
                    uid: `a_${i}`,
                    pairId: item.key,
                    side: 'prompt',
                    imageUrl: item.imageUrl,
                    text: item.imageUrl ? '' : (item.chinese || item.english),
                    label: item.english
                });
                tiles.push({
                    uid: `b_${i}`,
                    pairId: item.key,
                    side: 'word',
                    imageUrl: null,
                    text: item.english
                });
            });
            activeSession = {
                mode: 'match',
                pairCount,
                tiles: shuffle(tiles),
                selectedTile: null,
                matchedPairs: new Set(),
                moves: 0,
                startTime: Date.now(),
                elapsedSec: 0,
                locked: false
            };
            renderMatchStage();
            startMatchClock();
        }
    }

    /* ---------- Mode 1: 3D Flip SRS ---------- */

    function renderFlipStage() {
        const s = activeSession;
        if (!s || s.mode !== 'flip') return;

        if (s.idx >= s.items.length) {
            const totalDone = s.stats.again + s.stats.hard + s.stats.good;
            launchConfetti();
            root.innerHTML = `
                <div class="arena-shell">
                    <div class="glass-panel game-stage" style="align-items:center;text-align:center;">
                        <div style="font-size:46px;">🎉</div>
                        <h2 style="font-size:22px;">本輪記憶閃卡完成！</h2>
                        <p style="color:var(--text-secondary);">共複習 ${totalDone} 張：熟記 ${s.stats.good} · 模糊 ${s.stats.hard} · 重來 ${s.stats.again}</p>
                        <div style="display:flex;gap:10px;margin-top:8px;">
                            <button type="button" class="btn btn-ghost" id="arBackLobbyBtn">返回大廳</button>
                            <button type="button" class="btn btn-primary" id="arRestartBtn">再練一輪</button>
                        </div>
                    </div>
                </div>
            `;
            root.querySelector('#arBackLobbyBtn')?.addEventListener('click', renderLobby);
            root.querySelector('#arRestartBtn')?.addEventListener('click', () => startMode('flip'));
            return;
        }

        const item = s.items[s.idx];
        const pct = Math.round(((s.idx) / s.items.length) * 100);

        root.innerHTML = `
            <div class="arena-shell">
                <div class="glass-panel game-stage">
                    <div class="game-hud">
                        <button type="button" class="btn btn-xs btn-ghost" id="arExitBtn">← 返回</button>
                        <div class="hud-stats">
                            <span>第 ${s.idx + 1} / ${s.items.length} 張</span>
                            <button type="button" class="btn btn-xs btn-ghost" id="arFlipSpeakBtn">🔊 朗讀</button>
                        </div>
                    </div>
                    <div class="game-progress-bar"><div class="game-progress-fill" style="width:${pct}%"></div></div>

                    <div class="flip-scene ${s.flipped ? 'flipped' : ''}" id="arFlipScene" title="點擊或按空白鍵翻轉卡片">
                        <div class="flip-card-inner">
                            <div class="flip-face">
                                ${item.imageUrl ? `<img class="flip-img" src="${escapeHtml(item.imageUrl)}" alt="">` : ''}
                                <div style="font-size:24px;font-weight:800;">${escapeHtml(item.english)}</div>
                                <div style="font-size:12.5px;color:var(--text-muted);">點擊卡片或按 Space 查看釋義</div>
                            </div>
                            <div class="flip-face flip-face-back">
                                <div style="font-size:18px;font-weight:700;">${escapeHtml(item.english)}</div>
                                <div style="font-size:21px;font-weight:700;color:var(--accent-emerald-text);">
                                    ${item.chinese ? escapeHtml(item.chinese) : '（未填寫中文名）'}
                                </div>
                                ${item.explanation ? `
                                    <div style="font-size:13.5px;color:var(--text-secondary);line-height:1.6;max-height:160px;overflow-y:auto;">
                                        ${formatEscapedBreaks(item.explanation)}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    <div class="flip-controls">
                        <button type="button" class="btn btn-ghost" id="arDoFlipBtn">🔄 翻轉卡片 (Space)</button>
                        ${s.flipped ? `
                            <button type="button" class="btn btn-danger" data-srs="again">1 · 忘記重來</button>
                            <button type="button" class="btn btn-ghost" data-srs="hard">2 · 有點模糊</button>
                            <button type="button" class="btn btn-emerald" data-srs="good">3 · 完全熟記</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        root.querySelector('#arExitBtn')?.addEventListener('click', renderLobby);
        root.querySelector('#arFlipSpeakBtn')?.addEventListener('click', () => speakPrompt(item.english));
        const toggleFlip = () => {
            s.flipped = !s.flipped;
            renderFlipStage();
        };
        root.querySelector('#arFlipScene')?.addEventListener('click', toggleFlip);
        root.querySelector('#arDoFlipBtn')?.addEventListener('click', toggleFlip);
        root.querySelectorAll('[data-srs]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const q = btn.dataset.srs;
                s.stats[q] += 1;
                recordReviewResult(item.key, q);
                s.idx += 1;
                s.flipped = false;
                renderFlipStage();
                if (s.items[s.idx]) speakPrompt(s.items[s.idx].english);
            });
        });
    }

    /* ---------- Mode 2: 4-Choice Quiz ---------- */

    function prepareQuizQuestion() {
        const s = activeSession;
        const target = s.items[s.idx];
        const distractors = shuffle(s.allPool.filter((c) => c.key !== target.key)).slice(0, 3);
        s.currentOptions = shuffle([target, ...distractors]);
        s.answered = false;
        s.chosenKey = null;
    }

    function renderQuizStage() {
        const s = activeSession;
        if (!s || s.mode !== 'quiz') return;

        if (s.idx >= s.items.length) {
            const pct = Math.round((s.score / Math.max(1, s.items.length)) * 100);
            if (pct >= 75) launchConfetti();
            root.innerHTML = `
                <div class="arena-shell">
                    <div class="glass-panel game-stage" style="align-items:center;text-align:center;">
                        <div style="font-size:48px;">${pct >= 80 ? '🏆' : '💪'}</div>
                        <h2 style="font-size:24px;">測驗完成 · 得分 ${s.score} / ${s.items.length} (${pct}%)</h2>
                        <p style="color:var(--text-secondary);">最高連擊：${s.maxStreak} 題 · 錯題數：${s.wrongItems.length} 題</p>
                        ${s.wrongItems.length > 0 ? `
                            <div style="width:100%;max-width:520px;text-align:left;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:12px;max-height:200px;overflow-y:auto;">
                                <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:6px;">錯題回顧：</div>
                                ${s.wrongItems.map((w) => `<div style="padding:4px 0;font-size:13px;"><strong>${escapeHtml(w.english)}</strong> — <span style="color:var(--accent-emerald-text);">${escapeHtml(w.chinese || '')}</span></div>`).join('')}
                            </div>
                        ` : ''}
                        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
                            <button type="button" class="btn btn-ghost" id="arBackLobbyBtn">返回大廳</button>
                            ${s.wrongItems.length >= 4 ? `<button type="button" class="btn btn-danger" id="arRetryWrongBtn">只重練錯題 (${s.wrongItems.length})</button>` : ''}
                            <button type="button" class="btn btn-primary" id="arRestartBtn">再測一輪</button>
                        </div>
                    </div>
                </div>
            `;
            root.querySelector('#arBackLobbyBtn')?.addEventListener('click', renderLobby);
            root.querySelector('#arRestartBtn')?.addEventListener('click', () => startMode('quiz'));
            root.querySelector('#arRetryWrongBtn')?.addEventListener('click', () => startMode('quiz', s.wrongItems));
            return;
        }

        if (!s.currentOptions) prepareQuizQuestion();

        const target = s.items[s.idx];
        const isVisual = Boolean(target.imageUrl);
        const pct = Math.round((s.idx / s.items.length) * 100);

        let promptHtml = '';
        if (isVisual && quizDirection === 'forward') {
            promptHtml = `
                <img class="quiz-prompt-img" src="${escapeHtml(target.imageUrl)}" alt="猜單詞">
                <div style="font-size:13px;color:var(--text-secondary);">請選出這張圖片對應的英文單詞</div>
            `;
        } else if (isVisual && quizDirection === 'reverse') {
            promptHtml = `
                <div style="font-size:26px;font-weight:800;">${escapeHtml(target.english)}</div>
                ${target.chinese ? `<div style="font-size:15px;color:var(--accent-emerald-text);">${escapeHtml(target.chinese)}</div>` : ''}
                <button type="button" class="btn btn-xs btn-ghost" id="arQuizSpeakBtn">🔊 朗讀發音</button>
            `;
        } else if (!isVisual && quizDirection === 'forward') {
            promptHtml = `
                <div style="font-size:24px;font-weight:800;">${escapeHtml(target.english)}</div>
                <button type="button" class="btn btn-xs btn-ghost" id="arQuizSpeakBtn">🔊 朗讀發音</button>
            `;
        } else {
            promptHtml = `
                <div style="font-size:22px;font-weight:700;color:var(--accent-emerald-text);">${escapeHtml(target.chinese)}</div>
                <div style="font-size:13px;color:var(--text-secondary);">請選出對應的英文</div>
            `;
        }

        const optionsHtml = s.currentOptions.map((opt, i) => {
            let stateCls = '';
            if (s.answered) {
                if (opt.key === target.key) stateCls = 'correct';
                else if (opt.key === s.chosenKey) stateCls = 'wrong';
            }

            let inner = '';
            if (isVisual && quizDirection === 'reverse' && opt.imageUrl) {
                inner = `<img src="${escapeHtml(opt.imageUrl)}" alt="">`;
            } else if (!isVisual && quizDirection === 'forward') {
                inner = `<span style="font-size:15px;font-weight:600;">${escapeHtml(opt.chinese)}</span>`;
            } else {
                inner = `<span style="font-size:16px;font-weight:700;">${escapeHtml(opt.english)}</span>${s.answered && opt.chinese ? `<span style="font-size:12px;color:var(--text-secondary);">${escapeHtml(opt.chinese)}</span>` : ''}`;
            }

            return `
                <button type="button" class="quiz-option ${stateCls}" data-opt-idx="${i}" ${s.answered ? 'disabled' : ''}>
                    <span class="quiz-kbd">${i + 1}</span>
                    ${inner}
                </button>
            `;
        }).join('');

        root.innerHTML = `
            <div class="arena-shell">
                <div class="glass-panel game-stage">
                    <div class="game-hud">
                        <button type="button" class="btn btn-xs btn-ghost" id="arExitBtn">← 返回</button>
                        <div class="hud-stats">
                            <button type="button" class="btn btn-xs btn-ghost" id="arToggleDirBtn">
                                ${isVisual ? (quizDirection === 'forward' ? '模式：看圖選詞 ⇄' : '模式：看詞選圖 ⇄') : (quizDirection === 'forward' ? '模式：英選中 ⇄' : '模式：中選英 ⇄')}
                            </button>
                            <span class="streak-pill">🔥 ${s.streak} 連勝</span>
                            <span>${s.idx + 1} / ${s.items.length}</span>
                        </div>
                    </div>
                    <div class="game-progress-bar"><div class="game-progress-fill" style="width:${pct}%"></div></div>

                    <div class="quiz-prompt-box">${promptHtml}</div>
                    <div class="quiz-options-grid">${optionsHtml}</div>

                    ${s.answered ? `
                        <div style="display:flex;justify-content:center;">
                            <button type="button" class="btn btn-primary" id="arQuizNextBtn">下一題 (Enter / Space) →</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        root.querySelector('#arExitBtn')?.addEventListener('click', renderLobby);
        root.querySelector('#arQuizSpeakBtn')?.addEventListener('click', () => speakPrompt(target.english));
        root.querySelector('#arToggleDirBtn')?.addEventListener('click', () => {
            quizDirection = quizDirection === 'forward' ? 'reverse' : 'forward';
            renderQuizStage();
        });
        root.querySelector('#arQuizNextBtn')?.addEventListener('click', advanceQuiz);
        root.querySelectorAll('[data-opt-idx]').forEach((btn) => {
            btn.addEventListener('click', () => selectQuizOption(Number(btn.dataset.optIdx)));
        });
    }

    function selectQuizOption(optIdx) {
        const s = activeSession;
        if (!s || s.mode !== 'quiz' || s.answered) return;
        const target = s.items[s.idx];
        const chosen = s.currentOptions[optIdx];
        if (!chosen) return;

        s.answered = true;
        s.chosenKey = chosen.key;

        if (chosen.key === target.key) {
            s.score += 1;
            s.streak += 1;
            s.maxStreak = Math.max(s.maxStreak, s.streak);
            recordReviewResult(target.key, 'good');
            speakPrompt(target.english);
        } else {
            s.streak = 0;
            s.wrongItems.push(target);
            recordReviewResult(target.key, 'again');
        }
        renderQuizStage();
    }

    function advanceQuiz() {
        const s = activeSession;
        if (!s || s.mode !== 'quiz') return;
        s.idx += 1;
        s.currentOptions = null;
        if (s.idx < s.items.length) prepareQuizQuestion();
        renderQuizStage();
    }

    /* ---------- Mode 3: Audio Dictation ---------- */

    function renderDictationStage() {
        const s = activeSession;
        if (!s || s.mode !== 'dictation') return;

        if (s.idx >= s.items.length) {
            const pct = Math.round((s.score / Math.max(1, s.items.length)) * 100);
            if (pct >= 75) launchConfetti();
            root.innerHTML = `
                <div class="arena-shell">
                    <div class="glass-panel game-stage" style="align-items:center;text-align:center;">
                        <div style="font-size:48px;">🎧</div>
                        <h2>聽音拼寫挑戰完成！正確率 ${pct}% (${s.score}/${s.items.length})</h2>
                        <div style="display:flex;gap:10px;">
                            <button type="button" class="btn btn-ghost" id="arBackLobbyBtn">返回大廳</button>
                            <button type="button" class="btn btn-primary" id="arRestartBtn">再挑戰一次</button>
                        </div>
                    </div>
                </div>
            `;
            root.querySelector('#arBackLobbyBtn')?.addEventListener('click', renderLobby);
            root.querySelector('#arRestartBtn')?.addEventListener('click', () => startMode('dictation'));
            return;
        }

        const target = s.items[s.idx];
        const pct = Math.round((s.idx / s.items.length) * 100);
        const revealCount = Math.min(target.english.length, s.hintLevel * 2);
        const maskedHint = target.english
            .split('')
            .map((ch, i) => (ch === ' ' ? ' ' : (i < revealCount ? ch : '_')))
            .join('');

        root.innerHTML = `
            <div class="arena-shell">
                <div class="glass-panel game-stage">
                    <div class="game-hud">
                        <button type="button" class="btn btn-xs btn-ghost" id="arExitBtn">← 返回</button>
                        <div class="hud-stats">
                            <span>得分：${s.score}</span>
                            <span>${s.idx + 1} / ${s.items.length}</span>
                        </div>
                    </div>
                    <div class="game-progress-bar"><div class="game-progress-fill" style="width:${pct}%"></div></div>

                    <div class="dictation-box">
                        ${target.imageUrl ? `<img class="quiz-prompt-img" src="${escapeHtml(target.imageUrl)}" alt="" style="max-height:160px;">` : ''}
                        ${target.chinese ? `<div style="font-size:17px;font-weight:600;color:var(--accent-emerald-text);">${escapeHtml(target.chinese)}</div>` : ''}

                        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                            <button type="button" class="btn btn-primary btn-sm" id="arDictPlayBtn">🔊 正常語速播放</button>
                            <button type="button" class="btn btn-ghost btn-sm" id="arDictSlowBtn">🐢 慢速播放 (0.6x)</button>
                            <button type="button" class="btn btn-ghost btn-sm" id="arDictHintBtn">💡 提示字母</button>
                        </div>

                        ${s.hintLevel > 0 ? `<div style="font-family:var(--font-mono);letter-spacing:0.15em;color:var(--accent-cyan);">${escapeHtml(maskedHint)}</div>` : ''}

                        <input type="text" id="arDictInput" class="field-input" placeholder="聽音輸入對應英文拼寫，按 Enter 送出…" autocomplete="off" spellcheck="false" style="text-align:center;font-size:17px;" value="${escapeHtml(s.userAnswer || '')}" ${s.checked ? 'disabled' : ''}>

                        ${s.checked ? `
                            <div style="padding:12px 16px;border-radius:var(--radius-md);background:var(--bg-input);border:1px solid var(--border-default);width:100%;">
                                <div style="font-size:13px;margin-bottom:6px;">${s.isCorrect ? '✅ 完全正確！' : '❌ 正確拼寫如下：'}</div>
                                <div class="diff-chars">${s.diffHtml}</div>
                            </div>
                            <button type="button" class="btn btn-primary" id="arDictNextBtn">下一題 →</button>
                        ` : `
                            <button type="button" class="btn btn-emerald" id="arDictSubmitBtn">送出檢查</button>
                        `}
                    </div>
                </div>
            </div>
        `;

        root.querySelector('#arExitBtn')?.addEventListener('click', renderLobby);
        root.querySelector('#arDictPlayBtn')?.addEventListener('click', () => speakPrompt(target.english));
        root.querySelector('#arDictSlowBtn')?.addEventListener('click', () => speakPrompt(target.english, 0.58));
        root.querySelector('#arDictHintBtn')?.addEventListener('click', () => {
            s.hintLevel += 1;
            renderDictationStage();
        });

        const inputEl = root.querySelector('#arDictInput');
        if (!s.checked) {
            setTimeout(() => inputEl?.focus(), 30);
            if (!s.autoSpokenForIdx || s.autoSpokenForIdx !== s.idx) {
                s.autoSpokenForIdx = s.idx;
                speakPrompt(target.english);
            }
        }

        const checkAnswer = () => {
            const raw = inputEl.value.trim();
            if (!raw) return;
            s.userAnswer = raw;
            const ok = normalizeAnswer(raw) === normalizeAnswer(target.english);
            s.checked = true;
            s.isCorrect = ok;
            if (ok) {
                s.score += 1;
                recordReviewResult(target.key, 'good');
            } else {
                s.wrongItems.push(target);
                recordReviewResult(target.key, 'again');
            }

            // Build character diff
            const expected = target.english;
            s.diffHtml = expected.split('').map((ch, i) => {
                const uCh = raw[i] || '';
                const same = uCh.toLowerCase() === ch.toLowerCase();
                return `<span class="${same ? 'diff-ok' : 'diff-bad'}">${escapeHtml(ch === ' ' ? '␣' : ch)}</span>`;
            }).join('');

            renderDictationStage();
        };

        root.querySelector('#arDictSubmitBtn')?.addEventListener('click', checkAnswer);
        inputEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                checkAnswer();
            }
        });
        root.querySelector('#arDictNextBtn')?.addEventListener('click', () => {
            s.idx += 1;
            s.checked = false;
            s.hintLevel = 0;
            s.userAnswer = '';
            renderDictationStage();
        });
    }

    /* ---------- Mode 4: Memory Pair Match ---------- */

    function startMatchClock() {
        clearMatchTimer();
        matchTimerId = setInterval(() => {
            if (!activeSession || activeSession.mode !== 'match') {
                clearMatchTimer();
                return;
            }
            activeSession.elapsedSec = Math.floor((Date.now() - activeSession.startTime) / 1000);
            const clockEl = root.querySelector('#arMatchTimer');
            if (clockEl) clockEl.textContent = `${activeSession.elapsedSec}s`;
        }, 500);
    }

    function renderMatchStage() {
        const s = activeSession;
        if (!s || s.mode !== 'match') return;

        if (s.matchedPairs.size >= s.pairCount) {
            clearMatchTimer();
            const finalSec = Math.max(1, Math.round((Date.now() - s.startTime) / 1000));
            const isRecord = saveMatchBestTime(s.pairCount, finalSec);
            const best = getMatchBestTime(s.pairCount);
            launchConfetti();

            root.innerHTML = `
                <div class="arena-shell">
                    <div class="glass-panel game-stage" style="align-items:center;text-align:center;">
                        <div style="font-size:48px;">⚡</div>
                        <h2>配對消除成功！${isRecord ? ' 🏅 刷新個人紀錄！' : ''}</h2>
                        <p style="color:var(--text-secondary);">用時：<strong>${finalSec} 秒</strong> · 步數：${s.moves} 次${best ? ` · 最佳紀錄：${best} 秒` : ''}</p>
                        <div style="display:flex;gap:10px;">
                            <button type="button" class="btn btn-ghost" id="arBackLobbyBtn">返回大廳</button>
                            <button type="button" class="btn btn-primary" id="arRestartBtn">再玩一局</button>
                        </div>
                    </div>
                </div>
            `;
            root.querySelector('#arBackLobbyBtn')?.addEventListener('click', renderLobby);
            root.querySelector('#arRestartBtn')?.addEventListener('click', () => startMode('match'));
            return;
        }

        const best = getMatchBestTime(s.pairCount);

        root.innerHTML = `
            <div class="arena-shell">
                <div class="glass-panel game-stage">
                    <div class="game-hud">
                        <button type="button" class="btn btn-xs btn-ghost" id="arExitBtn">← 返回</button>
                        <div class="hud-stats">
                            <span>已配對：${s.matchedPairs.size} / ${s.pairCount}</span>
                            <span>步數：${s.moves}</span>
                            <span>⏱️ <strong id="arMatchTimer">${s.elapsedSec}s</strong></span>
                            ${best ? `<span style="color:var(--accent-amber);">最佳 ${best}s</span>` : ''}
                        </div>
                    </div>

                    <div class="match-grid">
                        ${s.tiles.map((t) => {
                            const isMatched = s.matchedPairs.has(t.pairId);
                            const isSelected = s.selectedTile?.uid === t.uid;
                            const isMismatch = s.mismatchUids?.includes(t.uid);
                            return `
                                <button type="button" class="match-tile ${isMatched ? 'matched' : ''} ${isSelected ? 'selected' : ''} ${isMismatch ? 'mismatch' : ''}" data-uid="${escapeHtml(t.uid)}" ${isMatched ? 'disabled' : ''}>
                                    ${t.imageUrl ? `<img src="${escapeHtml(t.imageUrl)}" alt="">` : escapeHtml(t.text)}
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;

        root.querySelector('#arExitBtn')?.addEventListener('click', renderLobby);
        root.querySelectorAll('.match-tile').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (s.locked) return;
                const tile = s.tiles.find((t) => t.uid === btn.dataset.uid);
                if (!tile || s.matchedPairs.has(tile.pairId)) return;

                if (tile.side === 'word') {
                    speakPrompt(tile.text);
                }

                if (!s.selectedTile) {
                    s.selectedTile = tile;
                    renderMatchStage();
                    return;
                }

                if (s.selectedTile.uid === tile.uid) {
                    s.selectedTile = null;
                    renderMatchStage();
                    return;
                }

                s.moves += 1;
                const prev = s.selectedTile;
                if (prev.pairId === tile.pairId && prev.side !== tile.side) {
                    s.matchedPairs.add(tile.pairId);
                    s.selectedTile = null;
                    recordReviewResult(tile.pairId, 'good');
                    renderMatchStage();
                } else {
                    s.locked = true;
                    s.mismatchUids = [prev.uid, tile.uid];
                    s.selectedTile = null;
                    renderMatchStage();
                    setTimeout(() => {
                        if (!activeSession || activeSession.mode !== 'match') return;
                        s.mismatchUids = null;
                        s.locked = false;
                        renderMatchStage();
                    }, 520);
                }
            });
        });
    }

    /* ---------- Global Keyboard Shortcuts for Arena ---------- */

    document.addEventListener('keydown', (e) => {
        if (state.activeTab !== 'arena' || !activeSession) return;
        if (document.querySelector('.modal-backdrop') || !document.getElementById('commandPalette')?.hidden) return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

        if (activeSession.mode === 'flip') {
            if (e.code === 'Space') {
                e.preventDefault();
                activeSession.flipped = !activeSession.flipped;
                renderFlipStage();
            } else if (activeSession.flipped && ['1', '2', '3'].includes(e.key)) {
                const map = { '1': 'again', '2': 'hard', '3': 'good' };
                const btn = root.querySelector(`[data-srs="${map[e.key]}"]`);
                btn?.click();
            }
        } else if (activeSession.mode === 'quiz') {
            if (!activeSession.answered && ['1', '2', '3', '4'].includes(e.key)) {
                selectQuizOption(Number(e.key) - 1);
            } else if (activeSession.answered && (e.key === 'Enter' || e.code === 'Space')) {
                e.preventDefault();
                advanceQuiz();
            }
        }
    });

    subscribe('arena:launchGroup', (groupId) => {
        selectedSource = `group:${groupId}`;
        renderLobby();
        startMode('quiz');
    });

    subscribe('vault:changed', () => {
        if (!activeSession && state.activeTab === 'arena') renderLobby();
    });

    renderLobby();

    return {
        refresh: () => {
            if (!activeSession) renderLobby();
        }
    };
}
