/**
 * Unified Speech & Audio Service
 * Supports ResponsiveVoice (rv:*) and Web Speech API (ws:*) with safe timeout fallback
 * + Screen Wake Lock for uninterrupted playback on mobile devices.
 */

export const VOICE_OPTIONS = [
    { group: 'ResponsiveVoice（雲端・預設較穩）', value: 'rv:US English Male', label: 'RV · 美語男聲' },
    { group: 'ResponsiveVoice（雲端・預設較穩）', value: 'rv:US English Female', label: 'RV · 美語女聲' },
    { group: 'ResponsiveVoice（雲端・預設較穩）', value: 'rv:UK English Male', label: 'RV · 英國男聲' },
    { group: 'ResponsiveVoice（雲端・預設較穩）', value: 'rv:UK English Female', label: 'RV · 英國女聲' },
    { group: 'ResponsiveVoice（雲端・預設較穩）', value: 'rv:Australian Female', label: 'RV · 澳洲女聲' },
    { group: 'ResponsiveVoice（雲端・預設較穩）', value: 'rv:Indian English Female', label: 'RV · 印度英語女聲' },
    { group: 'Web Speech（裝置內建・離線可用）', value: 'ws:auto', label: '內建 · 自動挑英文最佳' },
    { group: 'Web Speech（裝置內建・離線可用）', value: 'ws:en-US', label: '內建 · 美式 en-US' },
    { group: 'Web Speech（裝置內建・離線可用）', value: 'ws:en-GB', label: '內建 · 英式 en-GB' }
];

let activeSpeakResolver = null;
let wakeLockSentinel = null;

export function resolveSupportedVoice(rawValue) {
    const exists = VOICE_OPTIONS.some((v) => v.value === rawValue);
    return exists ? rawValue : 'rv:US English Male';
}

export function cancelSpeech() {
    if (typeof window.responsiveVoice !== 'undefined') {
        try {
            window.responsiveVoice.cancel();
        } catch {
            // ignore
        }
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
            window.speechSynthesis.cancel();
        } catch {
            // ignore
        }
    }
    if (activeSpeakResolver) {
        const resolve = activeSpeakResolver;
        activeSpeakResolver = null;
        resolve();
    }
}

function ensureVoicesReady() {
    return new Promise((resolve) => {
        if (!window.speechSynthesis) {
            resolve();
            return;
        }
        if ((window.speechSynthesis.getVoices() || []).length > 0) {
            resolve();
            return;
        }
        const onChanged = () => {
            window.speechSynthesis.removeEventListener('voiceschanged', onChanged);
            resolve();
        };
        window.speechSynthesis.addEventListener('voiceschanged', onChanged);
        setTimeout(() => {
            window.speechSynthesis.removeEventListener('voiceschanged', onChanged);
            resolve();
        }, 700);
    });
}

function pickWebSpeechVoice(prefer = 'auto', langPrefix = 'en') {
    if (!window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    const matching = voices.filter((v) => (v.lang || '').toLowerCase().startsWith(langPrefix));
    if (matching.length === 0) return null;

    const p = prefer.toLowerCase();
    if (p !== 'auto') {
        const exact = matching.find((v) => (v.lang || '').toLowerCase().startsWith(p));
        if (exact) return exact;
    }

    const score = (v) => {
        const sig = `${v.name} ${v.voiceURI || ''}`.toLowerCase();
        let s = 0;
        if (sig.includes('natural')) s += 8;
        if (sig.includes('google')) s += 6;
        if (sig.includes('premium') || sig.includes('enhanced')) s += 5;
        if (/(samantha|karen|daniel|moira|aria|jenny|guy|zira)/i.test(sig)) s += 3;
        if (sig.includes('microsoft')) s += 2;
        return s;
    };

    return [...matching].sort((a, b) => score(b) - score(a))[0];
}

async function speakWithWebSpeech(text, { lang = 'en', prefer = 'auto', rate = 0.85 }) {
    if (!window.speechSynthesis) return;
    await ensureVoicesReady();

    return new Promise((resolve) => {
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            clearTimeout(safetyTimer);
            if (activeSpeakResolver === done) activeSpeakResolver = null;
            resolve();
        };
        activeSpeakResolver = done;

        const u = new SpeechSynthesisUtterance(text);
        const voice = pickWebSpeechVoice(prefer, lang);
        if (voice) {
            u.voice = voice;
            u.lang = voice.lang;
        } else {
            u.lang = lang === 'zh' ? 'zh-TW' : (prefer === 'en-gb' ? 'en-GB' : 'en-US');
        }
        u.rate = Math.max(0.3, Math.min(1.8, Number(rate) || 0.85));
        u.pitch = 1;
        u.volume = 1;
        u.onend = done;
        u.onerror = done;

        // Safety timer in case mobile browser drops onend
        const estMs = Math.max(4500, Math.min(25000, text.length * 170 + 2500));
        const safetyTimer = setTimeout(done, estMs);

        window.speechSynthesis.speak(u);
    });
}

function canUseResponsiveVoice() {
    try {
        return typeof window.responsiveVoice !== 'undefined' &&
            typeof window.responsiveVoice.speak === 'function' &&
            window.responsiveVoice.voiceSupport();
    } catch {
        return false;
    }
}

export async function speakEnglish(text, { voiceSetting = 'rv:US English Male', rate = 0.85 } = {}) {
    const clean = String(text || '').trim();
    if (!clean) return;

    cancelSpeech();
    const resolved = resolveSupportedVoice(voiceSetting);
    const clampedRate = Math.max(0.3, Math.min(1.5, Number(rate) || 0.85));

    if (resolved.startsWith('ws:')) {
        const prefer = resolved.slice(3);
        await speakWithWebSpeech(clean, { lang: 'en', prefer, rate: clampedRate });
        return;
    }

    const rvVoice = resolved.startsWith('rv:') ? resolved.slice(3) : 'US English Male';
    if (canUseResponsiveVoice()) {
        await new Promise((resolve) => {
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                clearTimeout(safetyTimer);
                if (activeSpeakResolver === done) activeSpeakResolver = null;
                resolve();
            };
            activeSpeakResolver = done;

            const estMs = Math.max(4500, Math.min(28000, clean.length * 180 + 3000));
            const safetyTimer = setTimeout(done, estMs);

            try {
                window.responsiveVoice.speak(clean, rvVoice, {
                    pitch: 1,
                    rate: clampedRate,
                    volume: 1,
                    onend: done,
                    onerror: done
                });
            } catch {
                done();
            }
        });
        return;
    }

    await speakWithWebSpeech(clean, { lang: 'en', prefer: 'auto', rate: clampedRate });
}

export async function speakChinese(text, { rate = 0.95 } = {}) {
    const clean = String(text || '').trim();
    if (!clean) return;
    cancelSpeech();
    await speakWithWebSpeech(clean, { lang: 'zh', prefer: 'zh-tw', rate });
}

export async function acquireWakeLock() {
    try {
        if ('wakeLock' in navigator && !wakeLockSentinel) {
            wakeLockSentinel = await navigator.wakeLock.request('screen');
            wakeLockSentinel.addEventListener('release', () => {
                wakeLockSentinel = null;
            });
        }
    } catch {
        // WakeLock optional
    }
}

export async function releaseWakeLock() {
    try {
        if (wakeLockSentinel) {
            await wakeLockSentinel.release();
            wakeLockSentinel = null;
        }
    } catch {
        wakeLockSentinel = null;
    }
}
