import { escapeHtml } from '../config.js';
import { state, emit } from '../state.js';
import {
    acquireWakeLock,
    cancelSpeech,
    releaseWakeLock,
    speakChinese,
    speakEnglish
} from '../services/tts.js';
import { saveUserSettingCloud } from '../services/supabase.js';
import { showToast } from './toast.js';

/**
 * Persistent Floating Audio Playback Dock
 * Supports continuous loop playback across filtered deck cards, repeat counts,
 * adjustable pause intervals, bilingual EN -> ZH commute mode, and Screen Wake Lock.
 */

let sleepTimer = null;
let sessionToken = 0;

function clearSleep() {
    if (sleepTimer) {
        clearTimeout(sleepTimer);
        sleepTimer = null;
    }
}

function waitMs(ms) {
    return new Promise((resolve) => {
        clearSleep();
        sleepTimer = setTimeout(resolve, ms);
    });
}

export function getDeckCardKey(card) {
    return card?.id !== undefined && card?.id !== null
        ? `id:${card.id}`
        : `txt:${card?.english || ''}::${card?.chinese || ''}`;
}

export function initAudioDock() {
    const dockEl = document.getElementById('audioDock');
    if (!dockEl) return { startQueue: () => {}, stop: () => {} };

    function renderDock() {
        const ap = state.audioPlayer;
        if (!ap.visible || ap.queue.length === 0) {
            dockEl.hidden = true;
            dockEl.innerHTML = '';
            return;
        }
        dockEl.hidden = false;
        const card = ap.queue[ap.currentIndex] || ap.queue[0];
        const total = ap.queue.length;
        const pct = Math.round(((ap.currentIndex + 1) / Math.max(1, total)) * 100);

        dockEl.innerHTML = `
            <div class="dock-progress-track">
                <div class="dock-progress-fill" style="width:${pct}%"></div>
            </div>
            <div class="dock-row">
                <div class="dock-now">
                    <div class="eq-bars ${ap.isPaused || !ap.isPlaying ? 'paused' : ''}">
                        <span></span><span></span><span></span>
                    </div>
                    <div class="dock-text">
                        <div class="dock-en">${escapeHtml(card.english)}</div>
                        <div class="dock-meta">${ap.currentIndex + 1} / ${total} · 第 ${ap.currentRepeat}/${ap.playCount} 次${card.chinese ? ` · ${escapeHtml(card.chinese)}` : ''}</div>
                    </div>
                </div>
                <div class="dock-controls">
                    <button type="button" class="btn btn-xs btn-ghost" id="dockPrevBtn" title="上一張">⏮</button>
                    <button type="button" class="btn btn-sm btn-primary" id="dockPlayPauseBtn">${ap.isPaused ? '▶ 繼續' : '⏸ 暫停'}</button>
                    <button type="button" class="btn btn-xs btn-ghost" id="dockNextBtn" title="下一張">⏭</button>
                    <button type="button" class="btn btn-xs btn-danger" id="dockStopBtn" title="停止播放">■ 停止</button>
                </div>
            </div>
            <div class="dock-row" style="padding-top:2px;border-top:1px solid var(--border-subtle);">
                <div class="dock-opts">
                    <label>次數 <input type="number" id="dockCountInput" min="1" max="10" value="${ap.playCount}"></label>
                    <label>間隔(秒) <input type="number" id="dockIntervalInput" min="0" max="30" value="${ap.playInterval}"></label>
                </div>
                <div class="dock-opts">
                    <button type="button" class="btn btn-xs btn-ghost ${ap.speakChinese ? 'active' : ''}" id="dockZhToggle" title="英文唸完後接中文翻譯">中英雙語</button>
                    <button type="button" class="btn btn-xs btn-ghost ${ap.loopAll ? 'active' : ''}" id="dockLoopToggle" title="全部播完後自動重頭循環">列表循環</button>
                </div>
            </div>
        `;
    }

    async function runLoop(token) {
        const ap = state.audioPlayer;
        await acquireWakeLock();

        while (ap.isPlaying && token === sessionToken) {
            if (ap.isPaused) {
                await waitMs(250);
                continue;
            }

            if (ap.currentIndex >= ap.queue.length) {
                if (ap.loopAll && ap.queue.length > 0) {
                    ap.currentIndex = 0;
                    ap.currentRepeat = 1;
                } else {
                    stop(true);
                    return;
                }
            }

            const card = ap.queue[ap.currentIndex];
            ap.activeCardKey = getDeckCardKey(card);
            emit('audio:activeChanged', ap.activeCardKey);
            renderDock();

            for (let rep = ap.currentRepeat; rep <= ap.playCount; rep++) {
                if (!ap.isPlaying || token !== sessionToken) return;
                while (ap.isPaused && ap.isPlaying && token === sessionToken) {
                    renderDock();
                    await waitMs(200);
                }
                if (!ap.isPlaying || token !== sessionToken) return;

                ap.currentRepeat = rep;
                renderDock();

                await speakEnglish(card.english, {
                    voiceSetting: state.deckSettings.englishTts,
                    rate: state.visualPrefs.speechRate
                });

                if (!ap.isPlaying || token !== sessionToken) return;

                if (ap.speakChinese && card.chinese && rep === ap.playCount) {
                    await waitMs(250);
                    if (!ap.isPlaying || token !== sessionToken) return;
                    await speakChinese(card.chinese, { rate: 0.95 });
                }

                if (rep < ap.playCount && ap.isPlaying && token === sessionToken) {
                    await waitMs(480);
                }
            }

            if (!ap.isPlaying || token !== sessionToken) return;
            ap.currentIndex += 1;
            ap.currentRepeat = 1;

            if (ap.currentIndex < ap.queue.length || ap.loopAll) {
                const gapMs = Math.max(0, Number(ap.playInterval) || 0) * 1000;
                if (gapMs > 0) await waitMs(gapMs);
            }
        }
    }

    function startQueue(cards, startIndex = 0) {
        if (!Array.isArray(cards) || cards.length === 0) {
            showToast('目前篩選條件下沒有可播放的卡片', { type: 'warning' });
            return;
        }
        sessionToken += 1;
        const myToken = sessionToken;
        clearSleep();
        cancelSpeech();

        const ap = state.audioPlayer;
        ap.queue = [...cards];
        ap.currentIndex = Math.max(0, Math.min(cards.length - 1, startIndex));
        ap.currentRepeat = 1;
        ap.visible = true;
        ap.isPlaying = true;
        ap.isPaused = false;
        ap.playCount = Math.max(1, Math.min(10, Number(state.deckSettings.playCount) || 2));
        ap.playInterval = Math.max(0, Math.min(30, Number(state.deckSettings.playInterval) || 1));

        renderDock();
        runLoop(myToken).catch((err) => {
            console.error('Audio dock error:', err);
            stop(false);
        });
    }

    function stop(completed = false) {
        sessionToken += 1;
        clearSleep();
        cancelSpeech();
        releaseWakeLock();

        const ap = state.audioPlayer;
        ap.isPlaying = false;
        ap.isPaused = false;
        ap.visible = false;
        ap.activeCardKey = null;
        emit('audio:activeChanged', null);
        renderDock();
        if (completed) {
            showToast('全部卡片朗讀播放完畢！', { type: 'success' });
        }
    }

    function jumpTo(nextIdx) {
        const ap = state.audioPlayer;
        if (!ap.queue.length) return;
        sessionToken += 1;
        const myToken = sessionToken;
        clearSleep();
        cancelSpeech();
        ap.currentIndex = (nextIdx + ap.queue.length) % ap.queue.length;
        ap.currentRepeat = 1;
        ap.isPaused = false;
        ap.isPlaying = true;
        renderDock();
        runLoop(myToken).catch(console.error);
    }

    // Event delegation on dock container
    dockEl.addEventListener('click', (e) => {
        const ap = state.audioPlayer;
        if (e.target.closest('#dockStopBtn')) {
            stop(false);
        } else if (e.target.closest('#dockPlayPauseBtn')) {
            ap.isPaused = !ap.isPaused;
            if (ap.isPaused) cancelSpeech();
            renderDock();
        } else if (e.target.closest('#dockPrevBtn')) {
            jumpTo(ap.currentIndex - 1);
        } else if (e.target.closest('#dockNextBtn')) {
            jumpTo(ap.currentIndex + 1);
        } else if (e.target.closest('#dockZhToggle')) {
            ap.speakChinese = !ap.speakChinese;
            renderDock();
        } else if (e.target.closest('#dockLoopToggle')) {
            ap.loopAll = !ap.loopAll;
            renderDock();
        }
    });

    dockEl.addEventListener('change', (e) => {
        const ap = state.audioPlayer;
        if (e.target.id === 'dockCountInput') {
            const val = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 2));
            ap.playCount = val;
            state.deckSettings.playCount = String(val);
            saveUserSettingCloud('playCount', val);
        } else if (e.target.id === 'dockIntervalInput') {
            const val = Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 1));
            ap.playInterval = val;
            state.deckSettings.playInterval = String(val);
            saveUserSettingCloud('playInterval', val);
        }
    });

    return { startQueue, stop };
}
