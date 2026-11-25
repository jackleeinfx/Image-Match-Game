/**
 * Translation Service
 * Primary: Google Translate free gtx endpoint (joins ALL segments!)
 * Fallback: MyMemory Translated API
 */

export function isChineseText(text) {
    return /[\u3400-\u9FFF]/.test(String(text || ''));
}

async function translateWithGoogle(text, from, to) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Google HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!data || !Array.isArray(data[0])) {
            throw new Error('Google 回應格式異常');
        }
        // Join all translated segments so multi-line / multi-sentence text is never truncated
        const full = data[0].map((seg) => (Array.isArray(seg) ? seg[0] || '' : '')).join('').trim();
        if (!full) throw new Error('Google 翻譯結果為空');
        return full;
    } catch (err) {
        console.warn('Google translate fallback triggered:', err.message);
        return null;
    }
}

async function translateWithMyMemory(text, from, to) {
    try {
        const pair = `${from === 'zh-TW' ? 'zh-TW' : from}|${to === 'zh-TW' ? 'zh-TW' : to}`;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`MyMemory HTTP ${response.status}`);
        }
        const data = await response.json();
        if (data?.responseStatus && data.responseStatus !== 200) {
            throw new Error(`MyMemory status ${data.responseStatus}`);
        }
        const translated = data?.responseData?.translatedText?.trim();
        if (!translated) throw new Error('MyMemory 翻譯結果為空');
        return translated;
    } catch (err) {
        console.warn('MyMemory translate failed:', err.message);
        return null;
    }
}

export async function translateText(text, from = 'en', to = 'zh-TW') {
    const clean = String(text || '').trim();
    if (!clean) throw new Error('翻譯內容為空');

    const gResult = await translateWithGoogle(clean, from, to);
    if (gResult) return gResult;

    const mResult = await translateWithMyMemory(clean, from, to);
    if (mResult) return mResult;

    throw new Error('主要與備用翻譯服務目前都暫時不可用，請稍後再試');
}

export async function smartTranslatePair(sourceText) {
    const clean = String(sourceText || '').trim();
    if (!clean) throw new Error('請先輸入要翻譯的文字');

    if (isChineseText(clean)) {
        const en = await translateText(clean, 'zh-TW', 'en');
        return { english: en, chinese: clean, sourceLang: 'zh' };
    }
    const zh = await translateText(clean, 'en', 'zh-TW');
    return { english: clean, chinese: zh, sourceLang: 'en' };
}
