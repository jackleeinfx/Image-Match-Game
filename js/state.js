import { STORAGE_KEYS } from './config.js';
import { readJson } from './services/storage.js';

/**
 * Centralized Reactive Application State
 */

const listeners = new Map();

function readLocalTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    if (saved === 'light' || saved === 'dark') return saved;
    const legacyDark = localStorage.getItem('darkMode');
    if (legacyDark === 'false') return 'light';
    return 'dark';
}

function readLocalTab() {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB);
    if (['gallery', 'deck', 'arena', 'dashboard'].includes(saved)) return saved;
    return 'gallery';
}

export const state = {
    activeTab: readLocalTab(),
    theme: readLocalTheme(),

    loading: {
        visual: true,
        deck: true
    },

    cloudHealth: {
        project1: { ok: null, latencyMs: null },
        project2: { ok: null, latencyMs: null },
        lastActivate: Number(localStorage.getItem(STORAGE_KEYS.LAST_ACTIVATE) || 0),
        remainDays: null
    },

    // Project 1 — Visual Flashcards
    visualCards: [],
    groups: [],
    cardGroups: {},
    visualStats: {
        totalStorageCount: 0,
        maskedCount: 0
    },
    visualPrefs: {
        cardSize: Number(localStorage.getItem(STORAGE_KEYS.CARD_SIZE) || 240),
        viewMode: localStorage.getItem(STORAGE_KEYS.VIEW_MODE) || 'complete-mode',
        sortMode: localStorage.getItem(STORAGE_KEYS.SORT_MODE) || 'timeDesc',
        hideChinese: localStorage.getItem(STORAGE_KEYS.HIDE_CHINESE) === 'true',
        hideExplanation: localStorage.getItem(STORAGE_KEYS.HIDE_EXPLANATION) === 'true',
        showFailed: localStorage.getItem(STORAGE_KEYS.SHOW_FAILED) === 'true',
        editMode: localStorage.getItem(STORAGE_KEYS.EDIT_MODE) === 'true',
        speechRate: parseFloat(localStorage.getItem(STORAGE_KEYS.SPEECH_RATE) || '0.85') || 0.85,
        compressionPreset: localStorage.getItem(STORAGE_KEYS.COMPRESSION_PRESET) || 'light',
        showNoGroup: localStorage.getItem(STORAGE_KEYS.SHOW_NO_GROUP) !== 'false',
        isolateGroupId: null,
        searchQuery: '',
        studioOpen: false,
        studioTab: 'search',
        selectedBatch: new Set(),
        shuffledOrder: null
    },

    // Project 2 — Word & Sentence Deck
    deckCards: readJson(STORAGE_KEYS.DECK_CACHE, []),
    deckSettings: {
        playCount: localStorage.getItem('playCount') || '2',
        playInterval: localStorage.getItem('playInterval') || '1',
        displayMode: localStorage.getItem('displayMode') || 'all',
        sortMode: localStorage.getItem('sortMode') || 'time',
        hideAddCard: localStorage.getItem('hideAddCard') !== 'false',
        englishTts: localStorage.getItem('englishTts') || 'rv:US English Male',
        cardType: localStorage.getItem('cardType') || 'word',
        typeFilter: localStorage.getItem('typeFilter') || 'all'
    },
    deckFilters: {
        searchQuery: '',
        starFilter: 'all', // 'all' | '3' | '2' | '1' | '0'
        shuffledOrder: null
    },

    // Persistent Audio Playback State
    audioPlayer: {
        visible: false,
        isPlaying: false,
        isPaused: false,
        queue: [],
        currentIndex: 0,
        currentRepeat: 1,
        playCount: Number(localStorage.getItem('playCount') || 2),
        playInterval: Number(localStorage.getItem('playInterval') || 1),
        speakChinese: false,
        loopAll: false,
        activeCardKey: null
    },

    // Arena initial preset (optional jump from dashboard)
    arenaPreset: null
};

export function subscribe(topic, fn) {
    if (!listeners.has(topic)) {
        listeners.set(topic, new Set());
    }
    listeners.get(topic).add(fn);
    return () => listeners.get(topic)?.delete(fn);
}

export function emit(topic, payload) {
    const set = listeners.get(topic);
    if (set) {
        for (const fn of set) {
            try {
                fn(payload);
            } catch (err) {
                console.error(`Listener error on [${topic}]:`, err);
            }
        }
    }
}
