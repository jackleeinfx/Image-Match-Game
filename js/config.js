/**
 * LexiVault Studio Configuration & Shared Helpers
 * 100% compatible with legacy Supabase projects (Project 1 Visuals + Project 2 Deck)
 */

export const DEFAULT_CONFIG = {
    imageProject: {
        url: 'https://lnuguottscfwsmthmrkv.supabase.co',
        anonKey: 'sb_publishable_kywRcUbkTQza7NwH8N4_Fg_oE0h4tSj',
        bucket: 'images',
        table: 'flashcard_explanations'
    },
    deckProject: {
        url: 'https://fsqjuteaoprcrdsphqpt.supabase.co',
        anonKey: 'sb_publishable_DIcf1pkMLybWGtAafbLABw_FZ4GQEs8',
        cardsTable: 'user_cards',
        settingsTable: 'user_settings'
    },
    googleSearch: {
        apiKey: 'AIzaSyDr_AXqYOMKlLTzqCwKzDM9o34sP3HmPS4',
        cx: '352d6a09646db440e'
    }
};

export const STORAGE_KEYS = {
    CUSTOM_CONFIG: 'lexivault_custom_config',
    THEME: 'lexivault_theme',
    ACTIVE_TAB: 'integrated_learn_tools_active_v2',
    LAST_ACTIVATE: 'integrated_learn_tools_last_activate',
    DELETED_CARDS: 'deletedFlashcardNames',
    CARD_SIZE: 'cardSize',
    VIEW_MODE: 'viewMode',
    SORT_MODE: 'sortMode',
    HIDE_CHINESE: 'hideChineseName',
    HIDE_EXPLANATION: 'hideExplanation',
    SHOW_FAILED: 'showFailedFlashcards',
    EDIT_MODE: 'editMode',
    SPEECH_RATE: 'speechRate',
    COMPRESSION_PRESET: 'lexivault_compression_preset',
    SHOW_NO_GROUP: 'lexivault_show_no_group',
    DECK_CACHE: 'flashcards',
    SRS_DATA: 'lexivault_srs_v1',
    ACTIVITY_LOG: 'lexivault_activity_v1',
    MATCH_BEST: 'lexivault_match_best_v1'
};

export const ACTIVATE_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000;
export const DELETED_CARDS_TTL_MS = 24 * 60 * 60 * 1000;

export const SPECIAL_FILE_KEYS = {
    GROUPS: '__GROUPS_DATA__',
    CARD_GROUPS: '__CARD_GROUPS_DATA__',
    SPEECH_RATE: '__SPEECH_RATE_SETTING__'
};

export const COLOR_GROUPS = [
    ['#B1B6B4', '#6171F1', '#504EAA', '#E2E0D4', '#111524'],
    ['#004DFF', '#FF9040', '#FF5050', '#A200FF', '#111441'],
    ['#99D31B', '#E2B9B5', '#64C5C7', '#FA5032'],
    ['#0275B1', '#DEB9CB', '#FFC23D', '#FF7751', '#F53B29', '#C41E32', '#4E0875'],
    ['#FCE214', '#CD9CC3', '#F5E9A6', '#B6B87B', '#BDD9AA'],
    ['#5DF4B4', '#F11118', '#FFE129', '#F5B0B7', '#FFB2B4'],
    ['#1B988B', '#ED217C', '#2D3047', '#FFFD82', '#FF9B71'],
    ['#5CE3B7', '#D9D1D6', '#F4F3DD', '#F71BAE', '#244B17'],
    ['#5D64BE', '#B9B051', '#F679B0', '#F5B475', '#F1F1D8']
];

export const GROUP_COLORS = COLOR_GROUPS.flat();

export function getEffectiveConfig() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_CONFIG);
        if (!raw) return structuredClone(DEFAULT_CONFIG);
        const parsed = JSON.parse(raw);
        return {
            imageProject: { ...DEFAULT_CONFIG.imageProject, ...(parsed.imageProject || {}) },
            deckProject: { ...DEFAULT_CONFIG.deckProject, ...(parsed.deckProject || {}) },
            googleSearch: { ...DEFAULT_CONFIG.googleSearch, ...(parsed.googleSearch || {}) }
        };
    } catch {
        return structuredClone(DEFAULT_CONFIG);
    }
}

export function saveCustomConfig(override) {
    if (!override) {
        localStorage.removeItem(STORAGE_KEYS.CUSTOM_CONFIG);
        return;
    }
    localStorage.setItem(STORAGE_KEYS.CUSTOM_CONFIG, JSON.stringify(override));
}

export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function formatEscapedBreaks(str) {
    return escapeHtml(str || '').replace(/\r?\n/g, '<br>');
}

export function debounce(fn, delay = 180) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

export function parseCardFileName(fileName, createdAtFallback = null) {
    const match = String(fileName || '').match(/^(.+)_(\d+)\.[^.]+$/);
    if (match) {
        return {
            word: match[1].trim(),
            timestamp: parseInt(match[2], 10) || Date.now()
        };
    }
    const base = String(fileName || '').replace(/\.[^.]+$/, '');
    const ts = createdAtFallback ? new Date(createdAtFallback).getTime() : Date.now();
    return {
        word: base.trim() || 'Untitled',
        timestamp: Number.isFinite(ts) ? ts : Date.now()
    };
}

export function sanitizeWordForFile(word) {
    const cleaned = String(word || 'word')
        .replace(/[\\/:*?"<>|#%?]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || 'card';
}

export function isValidImageFileName(name) {
    if (!name || name === '.emptyFolderPlaceholder' || name.startsWith('__')) return false;
    return /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(name);
}
