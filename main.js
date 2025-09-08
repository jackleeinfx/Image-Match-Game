// Supabase 配置檢查
if (!window.supabase) {
    console.error('Supabase SDK 未載入');
}

// Supabase 配置
const SUPABASE_URL = 'https://lnuguottscfwsmthmrkv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kywRcUbkTQza7NwH8N4_Fg_oE0h4tSj';

// 初始化 Supabase 客戶端
let supabaseClient;

try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase 初始化成功');
    
    // 測試 Supabase 連接
    supabaseClient.storage.listBuckets().then(({ data, error }) => {
        if (error) {
            console.error('Supabase Storage 連接失敗:', error);
        } else {
            console.log('Supabase Storage 連接正常');
        }
    });
    
    // 在頁面載入完成後立即載入單詞卡
    window.addEventListener('load', () => {
        console.log('頁面載入完成，開始載入單詞卡...');
        loadFlashcards();
    });
} catch (error) {
    console.error('Supabase 初始化失敗:', error);
    alert('請先設置 Supabase 配置！請在 main.js 中填入您的 SUPABASE_URL 和 SUPABASE_ANON_KEY');
}

// Google Custom Search API 配置
const GOOGLE_API_KEY = 'AIzaSyDr_AXqYOMKlLTzqCwKzDM9o34sP3HmPS4';
const SEARCH_ENGINE_ID = '352d6a09646db440e';

document.getElementById('searchButton').addEventListener('click', () => {
    searchImages(1); // 重置到第一頁
});

// 添加分頁相關變量
let currentPage = 1;
let currentSearchTerm = '';
let totalPages = 1;

// 修改 searchImages 函數
async function searchImages(page = 1) {
    const searchTerm = document.getElementById('searchInput').value.trim();
    if (!searchTerm) {
        alert('請輸入搜尋關鍵字');
        return;
    }

    currentSearchTerm = searchTerm;
    currentPage = page;

    // 修正分頁計算，確保 start 是有效的整數
    const startIndex = ((page - 1) * 10) + 1;
    if (isNaN(startIndex) || startIndex < 1) {
        console.error('無效的起始索引:', startIndex);
        return;
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&searchType=image&q=${encodeURIComponent(searchTerm)}&start=${startIndex}`;

    try {
        console.log('開始搜尋:', url);
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            console.error('Google API 錯誤：', data.error);
            alert(`搜尋錯誤：${data.error.message}`);
            return;
        }
        
        if (!data.items || data.items.length === 0) {
            alert('沒有找到相關圖片');
            return;
        }

        // 計算總頁數，確保不會出現 NaN
        const totalResults = parseInt(data.searchInformation.totalResults) || 0;
        totalPages = Math.max(1, Math.ceil(totalResults / 10));
        
        // 更新換頁按鈕狀態
        updatePageButtons();
        
        console.log('搜尋結果：', data);
        displaySearchResults(data.items, searchTerm);
    } catch (error) {
        console.error('搜尋圖片時發生錯誤', error);
        alert('搜尋過程中發生錯誤，請檢查控制台');
    }
}

// 修改換頁按鈕事件處理
document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1 && currentSearchTerm) {
        const newPage = Math.max(1, currentPage - 1);
        if (!isNaN(newPage)) {
            searchImages(newPage);
        }
    }
});

document.getElementById('nextPage').addEventListener('click', () => {
    if (currentPage < totalPages && currentSearchTerm) {
        const newPage = Math.min(totalPages, currentPage + 1);
        if (!isNaN(newPage)) {
            searchImages(newPage);
        }
    }
});

// 添加更新換頁按鈕狀態的函數
function updatePageButtons() {
    const prevButton = document.getElementById('prevPage');
    const nextButton = document.getElementById('nextPage');
    
    prevButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
}

// 修改圖片壓縮函數，確保檔案大小低於 10KB
async function compressImage(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // 從較小的尺寸開始，確保檔案夠小
            let maxDimension = 400; // 開始時用更小的尺寸
            let quality = 0.5; // 開始時用較低的品質
            const targetSize = 10 * 1024; // 10KB 目標大小
            let attempts = 0;
            const maxAttempts = 5;
            
            while (attempts < maxAttempts) {
                // 計算新的尺寸，保持寬高比
                let newWidth = width;
                let newHeight = height;
                
                if (width > height && width > maxDimension) {
                    newHeight = Math.round((height * maxDimension) / width);
                    newWidth = maxDimension;
                } else if (height > maxDimension) {
                    newWidth = Math.round((width * maxDimension) / height);
                    newHeight = maxDimension;
                }
                
                canvas.width = newWidth;
                canvas.height = newHeight;
                const ctx = canvas.getContext('2d');
                
                // 清除畫布
                ctx.clearRect(0, 0, newWidth, newHeight);
                
                // 使用雙線性插值算法來提高圖片品質
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, newWidth, newHeight);
                
                // 嘗試壓縮
                const compressedBlob = await new Promise(resolve => {
                    canvas.toBlob(resolve, 'image/jpeg', quality);
                });
                
                console.log(`壓縮嘗試 ${attempts + 1}: 尺寸=${newWidth}x${newHeight}, 品質=${quality}, 大小=${Math.round(compressedBlob.size / 1024)}KB`);
                
                // 如果檔案大小符合要求，返回結果
                if (compressedBlob.size <= targetSize) {
                    console.log(`✅ 壓縮成功！最終大小: ${Math.round(compressedBlob.size / 1024)}KB`);
                    resolve(compressedBlob);
                    return;
                }
                
                // 如果還是太大，進一步降低參數
                attempts++;
                if (attempts < maxAttempts) {
                    // 優先降低品質，然後降低尺寸
                    if (quality > 0.1) {
                        quality = Math.max(0.1, quality - 0.1);
                    } else {
                        maxDimension = Math.max(200, Math.round(maxDimension * 0.8));
                        quality = 0.1; // 重置品質到最低
                    }
                }
            }
            
            // 如果所有嘗試都失敗，返回最後一次的結果
            canvas.toBlob(resolve, 'image/jpeg', 0.1);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
    });
}

// 添加圖片預載入函數
async function preloadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// 修改 saveImageToSupabase 函數（替換原來的 saveImageToFirebase）
async function saveImageToSupabase(imageUrl, searchTerm) {
    try {
        console.log('開始儲存圖片到 Supabase:', imageUrl);
        
        if (!supabaseClient) {
            throw new Error('Supabase 客戶端未初始化');
        }
        
        const timestamp = Date.now();
        const fileName = `${searchTerm}_${timestamp}.jpg`;
        
        // 获取图片数据
        let blob;
        try {
            // 先嘗試直接獲取圖片
            const response = await fetch(imageUrl, {
                mode: 'cors',
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            });
            
            if (!response.ok) {
                throw new Error('直接獲取圖片失敗');
            }
            
            blob = await response.blob();
        } catch (error) {
            console.log('直接獲取失敗，嘗試使用圖片元素獲取:', error);
            
            // 如果直接獲取失敗，使用圖片元素獲取
            blob = await new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    
                    try {
                        ctx.drawImage(img, 0, 0);
                        canvas.toBlob(resolve, 'image/jpeg', 0.95);
                    } catch (e) {
                        reject(new Error('圖片處理失敗: ' + e.message));
                    }
                };
                
                img.onerror = () => {
                    reject(new Error('圖片載入失敗'));
                };
                
                // 添加時間戳避免快取問題
                img.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
            });
        }

        if (!blob || blob.size === 0) {
            throw new Error('圖片數據無效');
        }

        // 壓縮圖片
        console.log('開始壓縮圖片，原始大小:', blob.size);
        const compressedBlob = await compressImage(blob);
        console.log('壓縮完成，壓縮後大小:', compressedBlob.size);
        
        // 上传到 Supabase Storage
        console.log('開始上傳到 Supabase Storage:', fileName);
        
        // images bucket 應該已經手動創建，直接使用
        
        // 上傳檔案到 Supabase Storage
        const { data, error } = await supabaseClient.storage
            .from('images')
            .upload(fileName, compressedBlob, {
                contentType: 'image/jpeg',
                upsert: true  // 改為 true，允許覆蓋
            });
        
        if (error) {
            console.error('上傳失敗:', error);
            throw error;
        }
        
        console.log('上傳完成，獲取公開 URL...');
        
        // 獲取公開 URL
        const { data: urlData } = supabaseClient.storage
            .from('images')
            .getPublicUrl(fileName);
        
        const downloadUrl = urlData.publicUrl;
        console.log('公開 URL:', downloadUrl);
        
        // 创建单词卡
        createFlashcard(downloadUrl, searchTerm, fileName, timestamp);
        
        console.log('圖片儲存成功:', fileName);
        
    } catch (error) {
        console.error('儲存過程中發生錯誤：', error);
        throw error;
    }
}

function displaySearchResults(images, searchTerm) {
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = '';

    images.forEach(image => {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'image-item';
        
        const imgContainer = document.createElement('div');
        imgContainer.className = 'image-container';
        
        // 添加載入指示器
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-indicator';
        loadingDiv.textContent = '載入中...';
        imgContainer.appendChild(loadingDiv);
        
        const img = document.createElement('img');
        img.src = image.link;
        img.alt = searchTerm;
        img.crossOrigin = 'anonymous'; // 添加跨域支援
        img.style.display = 'none'; // 初始隱藏圖片
        
        // 添加圖片載入失敗處理
        img.addEventListener('error', () => {
            console.log('圖片載入失敗，移除:', image.link);
            imgDiv.remove(); // 完全移除圖片容器
        });
        
        // 添加圖片載入成功處理
        img.addEventListener('load', () => {
            loadingDiv.style.display = 'none'; // 隱藏載入指示器
            img.style.display = 'block'; // 顯示圖片
            imgDiv.style.display = 'block'; // 確保容器顯示
        });
        
        // 添加載入超時處理（10秒後如果還沒載入完成就移除）
        setTimeout(() => {
            if (!img.complete) {
                console.log('圖片載入超時，移除:', image.link);
                imgDiv.remove();
            }
        }, 10000);
        
        const saveButton = document.createElement('button');
        saveButton.className = 'save-button';
        saveButton.textContent = '儲存圖片';
        
        // 修改儲存按鈕的事件處理
        saveButton.addEventListener('click', async () => {
            try {
                saveButton.disabled = true;
                saveButton.textContent = '儲存中...';
                await saveImageToSupabase(image.link, searchTerm);
                
                // 成功後重置按鈕狀態並顯示提示
                saveButton.textContent = '儲存成功';
                showTemporaryMessage('圖片已成功儲存！');
                setTimeout(() => {
                    saveButton.disabled = false;
                    saveButton.textContent = '儲存圖片';
                }, 2000);
                
            } catch (error) {
                console.error('儲存圖片時發生錯誤：', error);
                saveButton.textContent = '儲存失敗';
                showTemporaryMessage('儲存失敗：' + error.message, 'error');
                setTimeout(() => {
                    saveButton.disabled = false;
                    saveButton.textContent = '儲存圖片';
                }, 2000);
            }
        });
        
        imgContainer.appendChild(img);
        imgContainer.appendChild(saveButton);
        imgDiv.appendChild(imgContainer);
        resultsDiv.appendChild(imgDiv);
    });
}

// 無限滾動相關變數
let allFlashcards = []; // 儲存所有單詞卡數據
let currentLoadedCount = 0; // 目前已載入的數量
const CARDS_PER_LOAD = 20; // 每次載入的卡片數量
let isLoading = false; // 防止重複載入

// 修改 loadFlashcards 函數，實現無限滾動
async function loadFlashcards() {
    try {
        console.log('開始載入單詞卡...');
        
        const flashcardsDiv = document.getElementById('flashcards');
        flashcardsDiv.innerHTML = '';
        
        if (!supabaseClient) {
            throw new Error('Supabase 客戶端未初始化');
        }
        
        // 從 Supabase Storage 獲取圖片列表
        const { data: files, error } = await supabaseClient.storage
            .from('images')
            .list('', {
                limit: 1000,
                sortBy: { column: 'created_at', order: 'desc' }
            });
        
        if (error) {
            console.error('獲取圖片列表失敗:', error);
            if (error.message.includes('bucket')) {
                flashcardsDiv.innerHTML = '<p>儲存空間尚未設置，請先儲存一張圖片</p>';
                return;
            }
            throw error;
        }
        
        console.log('找到 ' + files.length + ' 張圖片');
        
        if (files.length === 0) {
            console.log('還沒有儲存任何圖片');
            flashcardsDiv.innerHTML = '<p>還沒有儲存任何單詞卡</p>';
            return;
        }

        // 預處理所有圖片數據，但不載入圖片
        allFlashcards = files.map(file => {
            const fileName = file.name;
            const word = fileName.split('_')[0];
            const timestampMatch = fileName.match(/_(\d+)\.jpg$/);
            const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : Date.now();
            
            return {
                fileName,
                word,
                timestamp,
                loaded: false
            };
        });
        
        // 重置載入狀態
        currentLoadedCount = 0;
        
        // 載入第一批卡片
        await loadMoreFlashcards();
        
        // 設置無限滾動監聽器
        setupInfiniteScroll();
        
        // 載入完成後套用保存的排序狀態
        setTimeout(() => {
            applySavedSortMode();
        }, 200);
        
    } catch (error) {
        console.error('載入單詞卡時發生錯誤：', error);
        alert('載入單詞卡失敗：' + error.message);
    }
}

// 載入更多單詞卡（只創建卡片結構，不載入圖片）
async function loadMoreFlashcards() {
    if (isLoading || currentLoadedCount >= allFlashcards.length) {
        return;
    }
    
    isLoading = true;
    console.log(`創建更多卡片: ${currentLoadedCount} - ${currentLoadedCount + CARDS_PER_LOAD}`);
    
    // 顯示載入指示器
    showLoadingIndicator();
    
    const flashcardsDiv = document.getElementById('flashcards');
    const cardsToLoad = allFlashcards.slice(currentLoadedCount, currentLoadedCount + CARDS_PER_LOAD);
    
    // 快速創建卡片結構（不載入圖片）
    cardsToLoad.forEach(cardData => {
        try {
            // 獲取公開 URL（不下載圖片）
            const { data: urlData } = supabaseClient.storage
                .from('images')
                .getPublicUrl(cardData.fileName);
            
            const imageUrl = urlData.publicUrl;
            
            // 創建懶加載的單詞卡
            createLazyFlashcard(imageUrl, cardData.word, cardData.fileName, cardData.timestamp);
            
        } catch (error) {
            console.error('創建卡片失敗:', cardData.fileName, error);
            const errorCard = document.createElement('div');
            errorCard.className = 'flashcard error';
            errorCard.innerHTML = `<p>載入失敗: ${cardData.word}</p>`;
            flashcardsDiv.appendChild(errorCard);
        }
    });
    
    currentLoadedCount += cardsToLoad.length;
    hideLoadingIndicator();
    isLoading = false;
    
    console.log(`已創建 ${currentLoadedCount}/${allFlashcards.length} 張卡片結構`);
    
    // 設置懶加載觀察器（延遲執行確保DOM已更新）
    setTimeout(() => {
        setupLazyLoading();
    }, 100);
}

// 設置無限滾動監聽器
function setupInfiniteScroll() {
    // 移除舊的監聽器（如果有）
    window.removeEventListener('scroll', handleScroll);
    
    // 添加新的監聽器
    window.addEventListener('scroll', handleScroll);
}

// 處理滾動事件
function handleScroll() {
    // 檢查是否滾動到接近底部
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    // 當滾動到距離底部 500px 時開始載入更多
    const threshold = 500;
    
    if (scrollTop + windowHeight >= documentHeight - threshold) {
        loadMoreFlashcards();
    }
}

// 顯示載入指示器
function showLoadingIndicator() {
    let indicator = document.getElementById('loadingIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'loadingIndicator';
        indicator.className = 'loading-indicator-infinite';
        indicator.innerHTML = `
            <div class="spinner"></div>
            <p>載入更多單詞卡中...</p>
        `;
        document.getElementById('flashcards').appendChild(indicator);
    }
    indicator.style.display = 'block';
}

// 隱藏載入指示器
function hideLoadingIndicator() {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// 設置懶加載觀察器
let imageObserver = null;

function setupLazyLoading() {
    console.log('設置懶加載觀察器...');
    
    // 如果瀏覽器不支援 Intersection Observer，回退到立即載入
    if (!('IntersectionObserver' in window)) {
        console.log('瀏覽器不支援 Intersection Observer，使用立即載入');
        const lazyCards = document.querySelectorAll('.lazy-card[data-loaded="false"]');
        console.log('找到', lazyCards.length, '個需要立即載入的卡片');
        lazyCards.forEach(loadImageForCard);
        return;
    }
    
    // 重新創建觀察器（確保是最新的）
    if (imageObserver) {
        imageObserver.disconnect();
    }
    
    imageObserver = new IntersectionObserver((entries) => {
        console.log('觀察器觸發，檢查', entries.length, '個元素');
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const card = entry.target;
                console.log('卡片進入視窗:', card.querySelector('.word-div')?.textContent);
                if (card.dataset.loaded === 'false') {
                    loadImageForCard(card);
                    imageObserver.unobserve(card); // 載入後停止觀察
                }
            }
        });
    }, {
        rootMargin: '200px', // 增加到200px，更早開始載入
        threshold: 0.1 // 當10%可見時就觸發
    });
    
    // 觀察所有未載入的懶加載卡片
    const lazyCards = document.querySelectorAll('.lazy-card[data-loaded="false"]');
    console.log('找到', lazyCards.length, '個懶加載卡片');
    lazyCards.forEach((card, index) => {
        console.log(`觀察卡片 ${index + 1}:`, card.querySelector('.word-div')?.textContent);
        imageObserver.observe(card);
    });
    
    // 立即載入視窗內的卡片
    setTimeout(() => {
        const visibleCards = Array.from(lazyCards).filter(card => {
            const rect = card.getBoundingClientRect();
            return rect.top < window.innerHeight && rect.bottom > 0;
        });
        console.log('立即載入', visibleCards.length, '個可見卡片');
        visibleCards.forEach(card => {
            if (card.dataset.loaded === 'false') {
                loadImageForCard(card);
                imageObserver.unobserve(card);
            }
        });
    }, 200);
}

// 為卡片載入圖片
async function loadImageForCard(card) {
    const imageUrl = card.dataset.imageUrl;
    const word = card.querySelector('.word-div').textContent;
    
    // 防止重複載入
    if (card.dataset.loaded !== 'false') {
        console.log('卡片已載入或正在載入:', word);
        return;
    }
    
    // 標記為載入中
    card.dataset.loaded = 'loading';
    
    try {
        console.log('開始載入圖片:', word, 'URL:', imageUrl);
        
        // 創建新的圖片元素
        const img = document.createElement('img');
        img.alt = word;
        img.loading = 'eager'; // 改為立即載入
        img.style.width = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        
        // 設置載入超時（10秒）
        const loadPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('載入超時'));
            }, 10000);
            
            img.onload = () => {
                clearTimeout(timeout);
                console.log('圖片載入成功:', word);
                resolve();
            };
            
            img.onerror = (e) => {
                clearTimeout(timeout);
                console.error('圖片載入錯誤:', word, e);
                reject(new Error('圖片載入失敗'));
            };
            
            // 開始載入圖片
            img.src = imageUrl;
        });
        
        // 等待圖片載入完成
        await loadPromise;
        
        // 替換佔位符
        const placeholder = card.querySelector('.image-placeholder');
        if (placeholder) {
            card.replaceChild(img, placeholder);
            console.log('佔位符已替換為圖片:', word);
        } else {
            console.warn('找不到佔位符:', word);
        }
        
        // 標記為已載入
        card.dataset.loaded = 'true';
        card.classList.remove('lazy-card');
        
        console.log('✅ 圖片載入完成:', word);
        
    } catch (error) {
        console.error('❌ 圖片載入失敗:', word, 'Error:', error.message, 'URL:', imageUrl);
        
        // 顯示錯誤佔位符
        const placeholder = card.querySelector('.image-placeholder');
        if (placeholder) {
            placeholder.innerHTML = `
                <div class="placeholder-icon">❌</div>
                <div class="placeholder-text">載入失敗<br>${error.message}</div>
            `;
            placeholder.style.color = '#ff6b6b';
        }
        
        card.dataset.loaded = 'error';
        card.classList.remove('lazy-card');
    }
}

// 應用保存的排序模式
function applySavedSortMode() {
    const savedSortMode = localStorage.getItem('sortMode');
    console.log('載入保存的排序模式:', savedSortMode);
    
    // 確保所有卡片都有正確的時間戳
    const flashcardsContainer = document.getElementById('flashcards');
    const flashcards = Array.from(flashcardsContainer.children);
    
    flashcards.forEach(card => {
        if (!card.dataset.timestamp && card.dataset.fileName) {
            const match = card.dataset.fileName.match(/_(\d+)\.jpg$/);
            if (match) {
                card.dataset.timestamp = match[1];
                console.log('為卡片添加時間戳:', card.dataset.fileName, '-> ', match[1]);
            }
        }
    });
    
    // 應用排序
    if (savedSortMode === 'timeDesc') {
        sortFlashcardsByTime(false);
        const btn = document.getElementById('sortByTimeDesc');
        if (btn) btn.classList.add('active');
    } else if (savedSortMode === 'timeAsc') {
        sortFlashcardsByTime(true);
        const btn = document.getElementById('sortByTimeAsc');
        if (btn) btn.classList.add('active');
    } else {
        // 如果沒有保存的排序模式，默認使用最新優先
        sortFlashcardsByTime(false);
        const btn = document.getElementById('sortByTimeDesc');
        if (btn) btn.classList.add('active');
        localStorage.setItem('sortMode', 'timeDesc');
    }
}

// 在 DOMContentLoaded 事件中初始化語音設置
document.addEventListener('DOMContentLoaded', () => {
    // 添加頂部隨機排序按鈕事件
    const topShuffleButton = document.getElementById('topShuffleButton');
    if (topShuffleButton) {
        topShuffleButton.addEventListener('click', shuffleFlashcards);
    }

    // 添加隨機排序按鈕事件
    const shuffleButton = document.getElementById('shuffleCards');
    if (shuffleButton) {
        shuffleButton.addEventListener('click', shuffleFlashcards);
    }
});

// 修改speakWord函數
function speakWord(word) {
    if (word) {
        responsiveVoice.cancel(); // 如果有正在播放的語音，先停止
        responsiveVoice.speak(word, "UK English Female", {
            rate: 0.8,
            pitch: 1,
            volume: 1
        });
    }
}

// 創建懶加載的單詞卡（只顯示佔位符，圖片稍後載入）
function createLazyFlashcard(imageUrl, word, fileName, timestamp = Date.now()) {
    const flashcardsDiv = document.getElementById('flashcards');
    
    const card = document.createElement('div');
    card.className = 'flashcard lazy-card';
    card.dataset.timestamp = timestamp;
    card.dataset.fileName = fileName;
    card.dataset.imageUrl = imageUrl; // 儲存圖片URL，稍後載入
    card.dataset.loaded = 'false';
    
    // 創建佔位符
    const placeholder = document.createElement('div');
    placeholder.className = 'image-placeholder';
    placeholder.innerHTML = `
        <div class="placeholder-icon">🖼️</div>
        <div class="placeholder-text">載入中...</div>
    `;
    
    const wordDiv = document.createElement('div');
    wordDiv.className = 'word-div';
    wordDiv.textContent = word;
    
    const deleteButton = document.createElement('button');
    deleteButton.textContent = '×';
    deleteButton.className = 'delete-button';
    deleteButton.onclick = async (e) => {
        e.stopPropagation();
        try {
            const { error } = await supabaseClient.storage
                .from('images')
                .remove([fileName]);
            
            if (error) {
                throw error;
            }
            
            card.remove();
            showTemporaryMessage('卡片已刪除！');
        } catch (error) {
            console.error('刪除失敗：', error);
            showTemporaryMessage('刪除失敗：' + error.message, 'error');
        }
    };
    
    card.addEventListener('dblclick', () => {
        card.classList.toggle('show-all');
        speakWord(word);
        setTimeout(() => {
            card.classList.remove('show-all');
        }, 3000);
    });
    
    card.appendChild(placeholder);
    card.appendChild(wordDiv);
    card.appendChild(deleteButton);
    
    flashcardsDiv.appendChild(card);
}

// 修改 createFlashcard 函數，添加漸進式載入效果（用於直接載入的圖片）
function createFlashcard(imageUrl, word, fileName, timestamp = Date.now()) {
    const flashcardsDiv = document.getElementById('flashcards');
    
    const card = document.createElement('div');
    card.className = 'flashcard';
    card.dataset.timestamp = timestamp;
    card.dataset.fileName = fileName;
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = word;
    img.loading = 'lazy';
    
    const wordDiv = document.createElement('div');
    wordDiv.className = 'word-div';
    wordDiv.textContent = word;
    
    const deleteButton = document.createElement('button');
    deleteButton.textContent = '×';
    deleteButton.className = 'delete-button';
    deleteButton.onclick = async (e) => {
        e.stopPropagation();
        try {
            const { error } = await supabaseClient.storage
                .from('images')
                .remove([fileName]);
            
            if (error) {
                throw error;
            }
            
            card.remove();
            showTemporaryMessage('卡片已刪除！');
        } catch (error) {
            console.error('刪除失敗：', error);
            showTemporaryMessage('刪除失敗：' + error.message, 'error');
        }
    };
    
    card.addEventListener('dblclick', () => {
        card.classList.toggle('show-all');
        speakWord(word);
        setTimeout(() => {
            card.classList.remove('show-all');
        }, 3000);
    });
    
    card.appendChild(img);
    card.appendChild(wordDiv);
    card.appendChild(deleteButton);
    
    // 將新卡片插入到最上方
    if (flashcardsDiv.firstChild) {
        flashcardsDiv.insertBefore(card, flashcardsDiv.firstChild);
    } else {
        flashcardsDiv.appendChild(card);
    }
}

// 在初始化部分添加拖放事件監聽
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    
    // 阻止默認拖放行為
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // 添加拖放效果
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    // 處理拖放
    dropZone.addEventListener('drop', handleDrop, false);

    // 添加設定控制
    const hideControlsCheckbox = document.getElementById('hideControls');
    hideControlsCheckbox.addEventListener('change', function() {
        document.body.classList.toggle('hide-controls', this.checked);
        
        // 保存設定到 localStorage
        localStorage.setItem('hideControls', this.checked);
    });

    // 載入保存的設定
    const savedHideControls = localStorage.getItem('hideControls');
    if (savedHideControls === 'true') {
        hideControlsCheckbox.checked = true;
        document.body.classList.add('hide-controls');
    }

    // 添加視圖控制
    const showImagesOnlyBtn = document.getElementById('showImagesOnly');
    const showWordsOnlyBtn = document.getElementById('showWordsOnly');
    const showCompleteBtn = document.getElementById('showComplete');
    
    // 純圖片模式
    showImagesOnlyBtn.addEventListener('click', () => {
        document.body.classList.remove('words-only', 'complete-mode');
        document.body.classList.add('images-only');
        localStorage.setItem('viewMode', 'images-only');
    });
    
    // 純單詞模式
    showWordsOnlyBtn.addEventListener('click', () => {
        document.body.classList.remove('images-only', 'complete-mode');
        document.body.classList.add('words-only');
        localStorage.setItem('viewMode', 'words-only');
    });

    // 完整模式
    showCompleteBtn.addEventListener('click', () => {
        document.body.classList.remove('images-only', 'words-only');
        document.body.classList.add('complete-mode');
        localStorage.setItem('viewMode', 'complete-mode');
    });

    // 載入保存的視圖模式
    const savedViewMode = localStorage.getItem('viewMode');
    if (savedViewMode) {
        document.body.classList.add(savedViewMode);
    } else {
        // 如果沒有保存的模式，默認使用完整模式
        document.body.classList.add('complete-mode');
        localStorage.setItem('viewMode', 'complete-mode');
    }

    // 添加排序按鈕事件監聽器
    const sortByTimeDescBtn = document.getElementById('sortByTimeDesc');
    const sortByTimeAscBtn = document.getElementById('sortByTimeAsc');
    
    // 清除所有排序按鈕的active狀態
    function clearSortButtonStates() {
        document.querySelectorAll('.sort-controls button').forEach(btn => {
            btn.classList.remove('active');
        });
    }
    
    if (sortByTimeDescBtn) {
        sortByTimeDescBtn.addEventListener('click', () => {
            console.log('點擊最新優先按鈕');
            sortFlashcardsByTime(false); // 最新優先
            
            // 更新按鈕狀態
            clearSortButtonStates();
            sortByTimeDescBtn.classList.add('active');
            
            // 保存排序狀態
            localStorage.setItem('sortMode', 'timeDesc');
            console.log('已保存排序狀態: timeDesc');
        });
    }
    
    if (sortByTimeAscBtn) {
        sortByTimeAscBtn.addEventListener('click', () => {
            console.log('點擊最舊優先按鈕');
            sortFlashcardsByTime(true); // 最舊優先
            
            // 更新按鈕狀態
            clearSortButtonStates();
            sortByTimeAscBtn.classList.add('active');
            
            // 保存排序狀態
            localStorage.setItem('sortMode', 'timeAsc');
            console.log('已保存排序狀態: timeAsc');
        });
    }
    
    // 載入保存的排序狀態（初始化時）
    const savedSortMode = localStorage.getItem('sortMode');
    console.log('初始載入的排序狀態:', savedSortMode);
    
    if (savedSortMode === 'timeDesc' && sortByTimeDescBtn) {
        sortByTimeDescBtn.classList.add('active');
    } else if (savedSortMode === 'timeAsc' && sortByTimeAscBtn) {
        sortByTimeAscBtn.classList.add('active');
    } else if (sortByTimeDescBtn) {
        // 如果沒有保存的狀態，默認設置為最新優先
        sortByTimeDescBtn.classList.add('active');
    }

    // 添加設定面板折疊功能
    const toggleButton = document.getElementById('toggleSettings');
    const settings = document.querySelector('.settings');
    
    if (toggleButton && settings) {
        toggleButton.addEventListener('click', () => {
            settings.classList.toggle('collapsed');
            
            // 保存折疊狀態
            localStorage.setItem('settingsCollapsed', settings.classList.contains('collapsed'));
        });

        // 載入保存的折疊狀態
        const savedCollapsed = localStorage.getItem('settingsCollapsed');
        if (savedCollapsed === 'true') {
            settings.classList.add('collapsed');
        }
    }

    // 添加卡片大小控制
    const cardSizeSlider = document.getElementById('cardSize');
    const sizeValueDisplay = document.getElementById('sizeValue');
    
    if (cardSizeSlider) {
        // 載入保存的卡片大小
        const savedSize = localStorage.getItem('cardSize');
        if (savedSize) {
            cardSizeSlider.value = savedSize;
            updateCardSize(savedSize);
        }

        cardSizeSlider.addEventListener('input', (e) => {
            const size = e.target.value;
            updateCardSize(size);
        });

        cardSizeSlider.addEventListener('change', (e) => {
            // 當滑軌停止時保存大小設置
            localStorage.setItem('cardSize', e.target.value);
        });
    }
});

function preventDefaults (e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight(e) {
    document.getElementById('dropZone').classList.add('dragover');
}

function unhighlight(e) {
    document.getElementById('dropZone').classList.remove('dragover');
}

// 修改處理拖放的函數
async function handleDrop(e) {
    const dt = e.dataTransfer;
    const items = dt.items;

    try {
        // 先詢問一次單詞
        const word = prompt('請輸入這張圖片的單詞：');
        if (!word) {
            showTemporaryMessage('已取消添加圖片', 'error');
            return;  // 如果用戶取消或未輸入，則退出
        }

        // 處理拖放的項目
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            // 如果是圖片URL（從其他網站拖放）
            if (item.kind === 'string' && item.type.match('^text/plain')) {
                item.getAsString(async (url) => {
                    try {
                        await saveImageToSupabase(url, word);
                        showTemporaryMessage('圖片已成功添加！');
                    } catch (error) {
                        console.error('處理拖放的URL過程中發生錯誤：', error);
                        showTemporaryMessage('添加失敗：' + error.message, 'error');
                    }
                });
            }
            // 如果是直接拖放的圖片文件
            else if (item.kind === 'file' && item.type.match('^image/')) {
                const file = item.getAsFile();
                try {
                    const imageUrl = URL.createObjectURL(file);
                    await saveImageToSupabase(imageUrl, word);
                    URL.revokeObjectURL(imageUrl);
                    showTemporaryMessage('圖片已成功添加！');
                } catch (error) {
                    console.error('處理拖放的文件過程中發生錯誤：', error);
                    showTemporaryMessage('添加失敗：' + error.message, 'error');
                }
            }
        }
    } catch (error) {
        console.error('拖放處理失敗：', error);
        showTemporaryMessage('處理圖片失敗：' + error.message, 'error');
    }
}

// 修改 shuffleFlashcards 函數，移除提示訊息
function shuffleFlashcards() {
    const flashcardsContainer = document.getElementById('flashcards');
    const flashcards = Array.from(flashcardsContainer.children);
    
    if (flashcards.length === 0) {
        console.log('沒有卡片可以隨機排序');
        return;
    }
    
    console.log('開始隨機排序，卡片數量:', flashcards.length);
    
    flashcardsContainer.style.opacity = '0';
    
    setTimeout(() => {
        // 使用 Fisher-Yates 洗牌算法
        for (let i = flashcards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            // 交換元素
            const temp = flashcards[i];
            flashcards[i] = flashcards[j];
            flashcards[j] = temp;
        }
        
        // 清空容器並重新添加洗牌後的卡片
        flashcardsContainer.innerHTML = '';
        flashcards.forEach(card => flashcardsContainer.appendChild(card));
        
        flashcardsContainer.style.opacity = '1';
        
        // 移除排序按鈕的active狀態
        document.querySelectorAll('.sort-controls button').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // 清除排序狀態
        localStorage.removeItem('sortMode');
        console.log('隨機排序完成，已清除排序狀態');
    }, 300);
}

// 添加時間排序功能
function sortFlashcardsByTime(ascending = false) {
    const flashcardsContainer = document.getElementById('flashcards');
    const flashcards = Array.from(flashcardsContainer.children);
    
    if (flashcards.length === 0) {
        console.log('沒有卡片可排序');
        return;
    }
    
    // 過濾掉錯誤卡片，只排序正常的卡片
    const normalCards = flashcards.filter(card => !card.classList.contains('error'));
    const errorCards = flashcards.filter(card => card.classList.contains('error'));
    
    console.log('排序模式:', ascending ? '最舊優先' : '最新優先');
    console.log('正常卡片數量:', normalCards.length);
    
    flashcardsContainer.style.opacity = '0';
    
    setTimeout(() => {
        // 按時間戳排序
        normalCards.sort((a, b) => {
            let timestampA = parseInt(a.dataset.timestamp) || 0;
            let timestampB = parseInt(b.dataset.timestamp) || 0;
            
            // 如果時間戳為0，嘗試從文件名中提取
            if (timestampA === 0 && a.dataset.fileName) {
                const match = a.dataset.fileName.match(/_(\d+)\.jpg$/);
                timestampA = match ? parseInt(match[1]) : Date.now();
                a.dataset.timestamp = timestampA;
            }
            
            if (timestampB === 0 && b.dataset.fileName) {
                const match = b.dataset.fileName.match(/_(\d+)\.jpg$/);
                timestampB = match ? parseInt(match[1]) : Date.now();
                b.dataset.timestamp = timestampB;
            }
            
            console.log('比較時間戳:', timestampA, 'vs', timestampB);
            
            return ascending ? timestampA - timestampB : timestampB - timestampA;
        });
        
        // 清空容器
        flashcardsContainer.innerHTML = '';
        
        // 重新添加排序後的卡片
        normalCards.forEach(card => flashcardsContainer.appendChild(card));
        errorCards.forEach(card => flashcardsContainer.appendChild(card));
        
        flashcardsContainer.style.opacity = '1';
        
        console.log('排序完成，排序後的時間戳順序:', normalCards.map(card => card.dataset.timestamp));
    }, 300);
}

// 添加更新卡片大小的函數
function updateCardSize(size) {
    document.documentElement.style.setProperty('--card-size', size + 'px');
    document.getElementById('sizeValue').textContent = size + 'px';
}

// 添加臨時提示函數
function showTemporaryMessage(message, type = 'success') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `temporary-message ${type}`;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    // 2秒後移除提示
    setTimeout(() => {
        messageDiv.classList.add('fade-out');
        setTimeout(() => messageDiv.remove(), 500);
    }, 2000);
}

// 添加診斷函數
function diagnoseSortingIssues() {
    console.log('=== 排序功能診斷 ===');
    
    const flashcardsContainer = document.getElementById('flashcards');
    const flashcards = Array.from(flashcardsContainer.children);
    
    console.log('卡片總數:', flashcards.length);
    
    flashcards.forEach((card, index) => {
        console.log(`卡片 ${index + 1}:`, {
            timestamp: card.dataset.timestamp,
            fileName: card.dataset.fileName,
            word: card.querySelector('.word-div')?.textContent
        });
    });
    
    const savedSortMode = localStorage.getItem('sortMode');
    console.log('保存的排序模式:', savedSortMode);
    
    const activeButtons = document.querySelectorAll('.sort-controls button.active');
    console.log('激活的排序按鈕:', activeButtons.length);
    
    activeButtons.forEach(btn => {
        console.log('激活按鈕:', btn.textContent, btn.id);
    });
    
    console.log('=== 診斷完成 ===');
}

// 添加全局診斷和修復函數
window.fixSortingIssues = function() {
    console.log('手動修復排序問題...');
    
    const flashcardsContainer = document.getElementById('flashcards');
    const flashcards = Array.from(flashcardsContainer.children);
    
    // 確保每個卡片都有正確的時間戳
    flashcards.forEach(card => {
        if (!card.dataset.timestamp && card.dataset.fileName) {
            const match = card.dataset.fileName.match(/_(\d+)\.jpg$/);
            if (match) {
                card.dataset.timestamp = match[1];
                console.log('修復卡片時間戳:', card.dataset.fileName, '-> ', match[1]);
            }
        }
    });
    
    // 重新載入排序狀態
    const savedSortMode = localStorage.getItem('sortMode');
    if (savedSortMode === 'timeDesc') {
        sortFlashcardsByTime(false);
    } else if (savedSortMode === 'timeAsc') {
        sortFlashcardsByTime(true);
    } else {
        // 默認設置為最新優先
        sortFlashcardsByTime(false);
        localStorage.setItem('sortMode', 'timeDesc');
    }
    
    console.log('排序問題修復完成');
    showTemporaryMessage('排序功能已重新載入！', 'success');
};

// 在開發環境中添加診斷快捷鍵
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F12' && e.ctrlKey) {
            diagnoseSortingIssues();
        }
    });
}

// 在所有環境中添加修復快捷鍵
document.addEventListener('keydown', (e) => {
    if (e.key === 'F9' && e.ctrlKey) {
        window.fixSortingIssues();
    }
});