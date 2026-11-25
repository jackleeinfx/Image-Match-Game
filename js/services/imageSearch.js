import { getEffectiveConfig } from '../config.js';

/**
 * Image Search (Google Custom Search + Wikimedia Commons CORS fallback)
 * and Client-side Image Fetch & Compression
 */

export async function searchGoogleImages(query, page = 1) {
    const clean = String(query || '').trim();
    if (!clean) throw new Error('請輸入搜尋關鍵字');

    const { googleSearch } = getEffectiveConfig();
    const safePage = Math.max(1, Math.min(10, page));
    const startIndex = (safePage - 1) * 10 + 1;

    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(googleSearch.apiKey)}&cx=${encodeURIComponent(googleSearch.cx)}&searchType=image&q=${encodeURIComponent(clean)}&start=${startIndex}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
        throw new Error(data.error.message || 'Google 圖片搜尋發生錯誤');
    }

    const totalResults = parseInt(data?.searchInformation?.totalResults || '0', 10) || 0;
    const totalPages = Math.max(1, Math.min(10, Math.ceil(totalResults / 10)));

    const items = (data.items || []).map((item) => ({
        title: item.title || clean,
        url: item.link,
        thumbUrl: item.image?.thumbnailLink || item.link,
        source: 'Google'
    }));

    return { items, page: safePage, totalPages };
}

export async function searchWikimediaImages(query, page = 1) {
    const clean = String(query || '').trim();
    if (!clean) throw new Error('請輸入搜尋關鍵字');

    const limit = 12;
    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * limit;

    const params = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrnamespace: '6',
        gsrsearch: `${clean} filetype:bitmap|drawing`,
        gsrlimit: String(limit),
        gsroffset: String(offset),
        prop: 'imageinfo',
        iiprop: 'url|mime|size',
        iiurlwidth: '640',
        format: 'json',
        origin: '*'
    });

    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
    if (!res.ok) {
        throw new Error(`Wikimedia 搜尋失敗 (HTTP ${res.status})`);
    }
    const data = await res.json();
    const pages = data?.query?.pages ? Object.values(data.query.pages) : [];

    const items = pages
        .sort((a, b) => (a.index || 0) - (b.index || 0))
        .map((p) => {
            const info = p.imageinfo?.[0];
            if (!info) return null;
            const thumb = info.thumburl || info.url;
            if (!thumb) return null;
            return {
                title: (p.title || clean).replace(/^File:/i, ''),
                url: info.thumburl || info.url,
                thumbUrl: info.thumburl || info.url,
                source: 'Wikimedia'
            };
        })
        .filter(Boolean);

    const hasNext = Boolean(data?.continue?.gsroffset);
    return {
        items,
        page: safePage,
        totalPages: hasNext ? safePage + 1 : safePage
    };
}

async function fetchUrlViaCanvas(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => reject(new Error('圖片讀取超時')), 12000);
        img.onload = () => {
            clearTimeout(timer);
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Canvas 轉換失敗'));
                }, 'image/jpeg', 0.92);
            } catch (e) {
                reject(new Error('來源圖片有 CORS 限制，無法直接讀取'));
            }
        };
        img.onerror = () => {
            clearTimeout(timer);
            reject(new Error('來源圖片無法載入'));
        };
        const sep = url.includes('?') ? '&' : '?';
        img.src = `${url}${sep}_cb=${Date.now()}`;
    });
}

export async function fetchImageAsBlob(url, fallbackUrl = null) {
    const candidates = [url, fallbackUrl].filter(Boolean);
    let lastError = null;

    for (const candidate of candidates) {
        try {
            const res = await fetch(candidate, { mode: 'cors' });
            if (res.ok) {
                const blob = await res.blob();
                if (blob && blob.size > 0 && blob.type.startsWith('image/')) {
                    return blob;
                }
            }
        } catch (err) {
            lastError = err;
        }

        try {
            return await fetchUrlViaCanvas(candidate);
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error('無法取得該圖片檔案，可改用右鍵複製圖片後 Ctrl+V 貼上');
}

export async function compressImageBlob(blob, preset = 'light') {
    const config = preset === 'hq'
        ? { targetBytes: 50 * 1024, startDim: 720, minDim: 420, startQuality: 0.82, minQuality: 0.35 }
        : { targetBytes: 10 * 1024, startDim: 400, minDim: 200, startQuality: 0.55, minQuality: 0.12 };

    const objectUrl = URL.createObjectURL(blob);
    try {
        const img = await new Promise((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('圖片解碼失敗'));
            el.src = objectUrl;
        });

        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;
        let maxDim = config.startDim;
        let quality = config.startQuality;
        let finalBlob = blob;
        let finalW = origW;
        let finalH = origH;

        for (let attempt = 0; attempt < 6; attempt++) {
            let newW = origW;
            let newH = origH;
            if (origW >= origH && origW > maxDim) {
                newH = Math.max(1, Math.round((origH * maxDim) / origW));
                newW = maxDim;
            } else if (origH > maxDim) {
                newW = Math.max(1, Math.round((origW * maxDim) / origH));
                newH = maxDim;
            }

            const canvas = document.createElement('canvas');
            canvas.width = newW;
            canvas.height = newH;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, newW, newH);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, newW, newH);

            finalBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
            finalW = newW;
            finalH = newH;

            if (finalBlob && finalBlob.size <= config.targetBytes) {
                break;
            }
            if (quality > config.minQuality + 0.05) {
                quality = Math.max(config.minQuality, quality - 0.12);
            } else {
                maxDim = Math.max(config.minDim, Math.round(maxDim * 0.78));
            }
        }

        return {
            blob: finalBlob,
            originalSize: blob.size,
            compressedSize: finalBlob?.size || blob.size,
            width: finalW,
            height: finalH
        };
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}
