import { STORAGE_KEYS } from './config.js';
import { state, emit, subscribe } from './state.js';
import {
    fetchDeckVault,
    fetchVisualVault,
    initSupabaseClients,
    pingAllProjects,
    saveSpeechRateCloud,
    saveUserSettingCloud,
    subscribeDeckRealtime
} from './services/supabase.js';
import { showToast } from './components/toast.js';
import { openSettingsModal } from './components/modal.js';
import { initCommandPalette } from './components/commandPalette.js';
import { initAudioDock } from './components/audioDock.js';
import { initGalleryView } from './views/galleryView.js';
import { initDeckView } from './views/deckView.js';
import { initArenaView } from './views/arenaView.js';
import { initDashboardView } from './views/dashboardView.js';

/**
 * LexiVault Studio Main Bootstrap
 */

function applyTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem(STORAGE_KEYS.THEME, state.theme);
    const meta = document.getElementById('metaThemeColor');
    if (meta) {
        meta.setAttribute('content', state.theme === 'dark' ? '#090D16' : '#F3F5FA');
    }
}

function updateNavBadges() {
    const gBadge = document.getElementById('badgeGalleryCount');
    const dBadge = document.getElementById('badgeDeckCount');
    if (gBadge) gBadge.textContent = state.visualCards.length ? String(state.visualCards.length) : '—';
    if (dBadge) dBadge.textContent = state.deckCards.length ? String(state.deckCards.length) : '—';
}

function updateCloudPill() {
    const dot = document.getElementById('cloudStatusDot');
    const text = document.getElementById('cloudStatusText');
    if (!dot || !text) return;

    const { project1, project2, remainDays } = state.cloudHealth;
    if (project1.ok && project2.ok) {
        dot.className = 'cloud-dot ok';
        text.textContent = remainDays ? `已保活 (${remainDays}d)` : '雙庫連線';
    } else if (project1.ok === false || project2.ok === false) {
        dot.className = 'cloud-dot err';
        text.textContent = '連線異常';
    } else {
        dot.className = 'cloud-dot';
        text.textContent = '連線中';
    }
}

function switchTab(tabName) {
    if (!['gallery', 'deck', 'arena', 'dashboard'].includes(tabName)) tabName = 'gallery';
    state.activeTab = tabName;
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, tabName);

    document.querySelectorAll('.app-view').forEach((v) => {
        const match = v.id === `view-${tabName}`;
        v.hidden = !match;
        v.classList.toggle('active', match);
    });

    document.querySelectorAll('[data-tab]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    emit('tab:changed', tabName);
}

async function runKeepAlive(force = false) {
    try {
        const res = await pingAllProjects(force);
        state.cloudHealth = {
            project1: res.project1,
            project2: res.project2,
            lastActivate: res.lastActivate,
            remainDays: res.remainDays
        };
        updateCloudPill();
        if (force) {
            if (res.project1.ok && res.project2.ok) {
                showToast(`雙庫保活成功（圖卡 ${res.project1.latencyMs}ms · 單字 ${res.project2.latencyMs}ms）`, { type: 'success' });
            } else {
                showToast('部分 Supabase 連線異常，請檢查網路或設定', { type: 'error' });
            }
        }
        return res;
    } catch (err) {
        state.cloudHealth.project1 = { ok: false, error: err.message };
        state.cloudHealth.project2 = { ok: false, error: err.message };
        updateCloudPill();
        if (force) showToast(`保活檢查失敗：${err.message}`, { type: 'error' });
        return null;
    }
}

async function loadVisualData() {
    state.loading.visual = true;
    try {
        const data = await fetchVisualVault();
        state.visualCards = data.cards;
        state.groups = data.groups;
        state.cardGroups = data.cardGroups;
        state.visualStats = {
            totalStorageCount: data.totalStorageCount,
            maskedCount: data.maskedCount
        };
        if (data.speechRate !== null) {
            state.visualPrefs.speechRate = data.speechRate;
            localStorage.setItem(STORAGE_KEYS.SPEECH_RATE, String(data.speechRate));
        }
        state.cloudHealth.project1 = { ...state.cloudHealth.project1, ok: true };
    } catch (err) {
        console.error('載入視覺圖卡失敗:', err);
        state.cloudHealth.project1 = { ok: false, error: err.message };
        showToast(`圖卡資料庫載入失敗：${err.message}`, { type: 'error', duration: 4500 });
    } finally {
        state.loading.visual = false;
        updateNavBadges();
        updateCloudPill();
        emit('visual:loaded');
    }
}

async function loadDeckData() {
    state.loading.deck = true;
    try {
        const { cards, settings } = await fetchDeckVault();
        state.deckCards = cards;
        localStorage.setItem(STORAGE_KEYS.DECK_CACHE, JSON.stringify(cards));

        if (settings && Object.keys(settings).length > 0) {
            state.deckSettings = { ...state.deckSettings, ...settings };
            Object.entries(settings).forEach(([k, v]) => localStorage.setItem(k, v));
        }
        state.cloudHealth.project2 = { ...state.cloudHealth.project2, ok: true };
    } catch (err) {
        console.error('載入單字庫失敗:', err);
        state.cloudHealth.project2 = { ok: false, error: err.message };
        showToast(`單字庫連線失敗，目前顯示本機快取`, { type: 'warning' });
    } finally {
        state.loading.deck = false;
        updateNavBadges();
        updateCloudPill();
        emit('deck:loaded');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    applyTheme(state.theme);

    try {
        initSupabaseClients();
    } catch (err) {
        showToast(err.message, { type: 'error', duration: 5000 });
    }

    const audioDock = initAudioDock();
    const galleryView = initGalleryView({ onSwitchTab: switchTab });
    const deckView = initDeckView({ audioDock, onSwitchTab: switchTab });
    const arenaView = initArenaView();
    const dashboardView = initDashboardView({ onSwitchTab: switchTab });

    const toggleTheme = () => {
        const next = state.theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        saveUserSettingCloud('darkMode', next === 'dark' ? 'true' : 'false');
    };

    const openSettings = () => {
        openSettingsModal({
            onPingNow: () => runKeepAlive(true),
            onToggleTheme: toggleTheme,
            onSaveSpeechRate: async (rate) => {
                state.visualPrefs.speechRate = rate;
                localStorage.setItem(STORAGE_KEYS.SPEECH_RATE, String(rate));
                galleryView.refresh();
                await saveSpeechRateCloud(rate);
            },
            onSaveVoice: (voice) => {
                state.deckSettings.englishTts = voice;
                saveUserSettingCloud('englishTts', voice);
                showToast('已更新朗讀聲線', { type: 'success', duration: 1500 });
            },
            onRestoreMasked: () => loadVisualData()
        });
    };

    const cmdPalette = initCommandPalette({
        onSwitchTab: switchTab,
        onToggleTheme: toggleTheme,
        onStartAudio: () => {
            switchTab('deck');
            audioDock.startQueue(deckView.getFilteredCards(), 0);
        },
        onOpenSettings: openSettings
    });

    // Topbar & Mobile Nav click bindings
    document.querySelectorAll('[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    document.getElementById('brandHomeBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab('gallery');
    });
    document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);
    document.getElementById('openSettingsBtn')?.addEventListener('click', openSettings);
    document.getElementById('cloudHealthBtn')?.addEventListener('click', openSettings);
    document.getElementById('openCmdPaletteBtn')?.addEventListener('click', () => cmdPalette.open());

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) ||
            document.activeElement?.isContentEditable;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            cmdPalette.open();
            return;
        }
        if (!inInput && e.key === '/') {
            e.preventDefault();
            cmdPalette.open();
            return;
        }
        if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
            e.preventDefault();
            const map = { '1': 'gallery', '2': 'deck', '3': 'arena', '4': 'dashboard' };
            switchTab(map[e.key]);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && !inInput && state.activeTab === 'gallery') {
            if (!document.querySelector('.modal-backdrop')) {
                e.preventDefault();
                galleryView.handleClipboardPaste();
            }
        }
    });

    subscribe('vault:changed', updateNavBadges);
    subscribe('tab:changed', (tab) => {
        if (tab === 'arena') arenaView.refresh();
        if (tab === 'dashboard') dashboardView.refresh();
    });

    // Activate initial tab & boot cloud sync
    switchTab(state.activeTab);
    updateNavBadges();
    updateCloudPill();

    runKeepAlive(false);
    Promise.all([loadVisualData(), loadDeckData()]);

    // Realtime subscription for Project 2 (debounced refresh)
    let rtTimer = null;
    try {
        subscribeDeckRealtime(() => {
            clearTimeout(rtTimer);
            rtTimer = setTimeout(() => {
                loadDeckData();
            }, 600);
        });
    } catch (err) {
        console.warn('Realtime 訂閱略過:', err);
    }
});
