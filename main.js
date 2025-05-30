// Firebase 配置檢查
if (!firebase) {
    console.error('Firebase SDK 未載入');
}

// Firebase 配置
const firebaseConfig = {
    apiKey: "AIzaSyDQZovmdN3y7AGJh9rkVZopch0ZvQG68qw",
    authDomain: "testjack-5fd0c.firebaseapp.com",
    projectId: "testjack-5fd0c",
    storageBucket: "testjack-5fd0c.appspot.com",
    messagingSenderId: "976883349752",
    appId: "1:976883349752:web:5eee959e782b4e95df630d"
};

// 修改 Firebase 初始化部分
let storage;
let db;

try {
    firebase.initializeApp(firebaseConfig);
    storage = firebase.storage();
    db = firebase.firestore();
    
    console.log('Firebase 初始化成功');
    // 在頁面載入完成後立即載入單詞卡
    window.addEventListener('load', loadFlashcards);
} catch (error) {
    console.error('Firebase 初始化失敗:', error);
}

// Google Custom Search API 配置
const GOOGLE_API_KEY = 'AIzaSyDr_AXqYOMKlLTzqCwKzDM9o34sP3HmPS4';
const SEARCH_ENGINE_ID = '352d6a09646db440e';

// 創建防抖函數，避免頻繁觸發搜尋
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// 創建防抖搜尋函數
const debouncedSearch = debounce((page) => {
    searchImages(page);
}, 300); // 300毫秒的防抖時間

// 添加分頁相關變量
let currentPage = 1;
let currentSearchTerm = '';
let totalPages = 1;

// 在searchImages函數前添加備用的圖片代理服務列表
const proxyServices = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://cors-anywhere.herokuapp.com/',
    'https://crossorigin.me/',
    'https://images1-focus-opensocial.googleusercontent.com/gadgets/proxy?container=focus&refresh=2592000&url=',
    'https://yacdn.org/proxy/',
    'https://thingproxy.freeboard.io/fetch/'
];

// 添加搜尋結果緩存
const searchCache = {
    // 格式: 'searchTerm_page': { data: {...}, timestamp: Date.now() }
};

// 緩存過期時間（毫秒）
const CACHE_EXPIRY = 1000 * 60 * 60; // 1小時

// 初始化所有事件監聽器
document.addEventListener('DOMContentLoaded', initializeEventListeners);

// 集中管理所有事件監聽器的初始化
function initializeEventListeners() {
    // 為搜尋按鈕添加點擊事件
    document.getElementById('searchButton').addEventListener('click', (e) => {
        e.preventDefault(); // 防止可能的表單提交
        debouncedSearch(1); // 使用防抖函數
    });
    
    // 為搜尋輸入框添加回車鍵搜尋功能
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // 防止表單提交
            debouncedSearch(1);
        }
    });
    
    // 修改換頁按鈕事件處理，也使用防抖
    document.getElementById('prevPage').addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage > 1 && currentSearchTerm) {
            const newPage = Math.max(1, currentPage - 1);
            if (!isNaN(newPage)) {
                debouncedSearch(newPage);
            }
        }
    });

    document.getElementById('nextPage').addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage < totalPages && currentSearchTerm) {
            const newPage = Math.min(totalPages, currentPage + 1);
            if (!isNaN(newPage)) {
                debouncedSearch(newPage);
            }
        }
    });
    
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

    // 添加設定面板折疊功能
    const toggleButton = document.getElementById('toggleSettings');
    const settings = document.querySelector('.settings');
    
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

    // 添加卡片大小控制
    const cardSizeSlider = document.getElementById('cardSize');
    const sizeValueDisplay = document.getElementById('sizeValue');
    
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
    
    // 添加拖放事件監聽
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
}

// 修改 loadFlashcards 函數，添加預載入和並行載入功能
async function loadFlashcards() {
    try {
        console.log('開始載入單詞卡...');
        
        const flashcardsDiv = document.getElementById('flashcards');
        flashcardsDiv.innerHTML = '';
        
        const imagesRef = storage.ref('images');
        const imagesList = await imagesRef.listAll();
        console.log('找到 ' + imagesList.items.length + ' 張圖片');
        
        if (imagesList.items.length === 0) {
            console.log('還沒有儲存任何圖片');
            flashcardsDiv.innerHTML = '<p>還沒有儲存任何單詞卡</p>';
            return;
        }

        // 檢查快取是否可用
        const cacheAvailable = 'caches' in window;
        
        // 使用 Promise.all 並行處理圖片載入
        const loadPromises = imagesList.items.map(async (imageRef) => {
            const fileName = imageRef.name;
            const word = fileName.split('_')[0];
            
            try {
                let imageUrl;
                
                if (cacheAvailable) {
                    const cache = await caches.open('image-cache');
                    const cachedResponse = await cache.match(fileName);
                    
                    if (cachedResponse) {
                        console.log('從快取載入圖片:', fileName);
                        imageUrl = URL.createObjectURL(await cachedResponse.blob());
                    } else {
                        console.log('從 Firebase 下載並快取圖片:', fileName);
                        imageUrl = await imageRef.getDownloadURL();
                        await cacheImage(imageUrl, fileName);
                    }
                } else {
                    console.log('從 Firebase 下載圖片:', fileName);
                    imageUrl = await imageRef.getDownloadURL();
                }
                
                // 預載入圖片
                await preloadImage(imageUrl);
                return { imageUrl, word, fileName };
            } catch (error) {
                console.error('載入圖片失敗:', fileName, error);
                return { error: true, word, fileName };
            }
        });

        // 等待所有圖片載入完成
        const results = await Promise.all(loadPromises);
        
        // 創建單詞卡
        results.forEach(result => {
            if (result.error) {
                const errorCard = document.createElement('div');
                errorCard.className = 'flashcard error';
                errorCard.innerHTML = `<p>載入失敗: ${result.word}</p>`;
                flashcardsDiv.appendChild(errorCard);
            } else {
                createFlashcard(result.imageUrl, result.word, result.fileName);
            }
        });
    } catch (error) {
        console.error('載入單詞卡時發生錯誤：', error);
        alert('載入單詞卡失敗：' + error.message);
    }
}

// 修改圖片壓縮函數，增加更多壓縮選項
async function compressImage(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // 計算新的尺寸，保持寬高比
            const maxDimension = 800; // 降低最大尺寸到 800px
            if (width > height && width > maxDimension) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
            } else if (height > maxDimension) {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // 使用雙線性插值算法來提高圖片品質
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            // 降低 JPEG 品質以減少檔案大小
            canvas.toBlob(resolve, 'image/jpeg', 0.7);
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

// 修改 saveImageToFirebase 函數
async function saveImageToFirebase(imageUrl, searchTerm) {
    try {
        console.log('開始儲存圖片:', imageUrl);
        
        const fileName = `${searchTerm}_${Date.now()}.jpg`;
        
        // 移除可能的現有代理前綴
        let cleanImageUrl = imageUrl;
        proxyServices.forEach(proxy => {
            if (cleanImageUrl.includes(proxy)) {
                cleanImageUrl = decodeURIComponent(cleanImageUrl.split(proxy)[1]);
            }
        });
        
        // 获取图片数据
        let blob;
        try {
            // 先嘗試直接獲取圖片
            let response = await fetch(cleanImageUrl, {
                mode: 'no-cors',
                cache: 'no-cache'
            });
            
            if (!response.ok) {
                // 如果直接獲取失敗，嘗試使用代理
                console.log('直接獲取圖片失敗，嘗試使用代理');
                response = await fetchWithProxies(cleanImageUrl);
            }
            
            if (!response.ok) {
                throw new Error('無法獲取圖片數據');
            }
            
            blob = await response.blob();
        } catch (error) {
            console.log('使用fetch獲取失敗，嘗試使用圖片元素獲取:', error);
            
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
                    // 嘗試使用所有代理
                    fetchWithProxies(cleanImageUrl).then(response => {
                        if (response.ok) {
                            return response.blob();
                        } else {
                            throw new Error('使用代理獲取圖片失敗');
                        }
                    }).then(imgBlob => {
                        img.src = URL.createObjectURL(imgBlob);
                    }).catch(() => {
                        reject(new Error('圖片載入失敗'));
                    });
                };
                
                // 添加時間戳避免快取問題
                img.src = cleanImageUrl + (cleanImageUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
            });
        }

        if (!blob || blob.size === 0) {
            throw new Error('圖片數據無效');
        }

        // 壓縮圖片
        const compressedBlob = await compressImage(blob);
        
        // 上传到 Firebase Storage
        const imageRef = storage.ref(`images/${fileName}`);
        const uploadTask = imageRef.put(compressedBlob, {
            contentType: 'image/jpeg'
        });
        
        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('上傳進度: ' + progress + '%');
            },
            (error) => {
                console.error('上傳失敗:', error);
                throw error;
            }
        );
        
        await uploadTask;
        const downloadUrl = await imageRef.getDownloadURL();
        
        // 快取圖片
        await cacheImage(downloadUrl, fileName);
        
        // 创建单词卡
        createFlashcard(downloadUrl, searchTerm, fileName);
        
        showTemporaryMessage('圖片已成功儲存！');
        
    } catch (error) {
        console.error('儲存過程中發生錯誤：', error);
        showTemporaryMessage('儲存失敗：' + error.message, 'error');
        throw error;
    }
}

function displaySearchResults(images, searchTerm) {
    const resultsDiv = document.getElementById('searchResults');
    
    // 淡出效果
    resultsDiv.style.opacity = '0';
    
    setTimeout(() => {
        resultsDiv.innerHTML = '';
        
        if (images.length === 0) {
            resultsDiv.innerHTML = '<div class="error-message">沒有找到相關圖片</div>';
            resultsDiv.style.opacity = '1';
            return;
        }
        
        // 添加搜尋結果計數
        const resultCount = document.createElement('div');
        resultCount.className = 'result-count';
        resultCount.textContent = `找到 ${images.length} 張圖片`;
        resultsDiv.appendChild(resultCount);

        images.forEach(image => {
            const imgDiv = document.createElement('div');
            imgDiv.className = 'image-item';
            
            const imgContainer = document.createElement('div');
            imgContainer.className = 'image-container';
            
            // 添加載入指示器
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'loading-indicator';
            loadingIndicator.innerHTML = '<div class="loading-spinner"></div><span>載入中...</span>';
            imgContainer.appendChild(loadingIndicator);
            
            const img = document.createElement('img');
            img.alt = searchTerm;
            img.style.display = 'none'; // 初始隱藏圖片
            img.crossOrigin = 'anonymous'; // 添加跨域屬性
            
            // 圖片載入完成時的處理
            img.onload = () => {
                loadingIndicator.remove();
                img.style.display = 'block';
                
                // 添加淡入效果
                img.animate([
                    { opacity: 0 },
                    { opacity: 1 }
                ], {
                    duration: 300,
                    easing: 'ease-in-out'
                });
            };
            
            // 圖片載入失敗時的處理
            img.onerror = () => {
                console.error('圖片載入失敗:', image.link);
                
                // 嘗試使用代理服務加載圖片
                const tryLoadWithProxy = async () => {
                    for (let i = 0; i < proxyServices.length; i++) {
                        try {
                            console.log(`嘗試使用代理 ${i + 1} 載入圖片:`, proxyServices[i]);
                            const proxyUrl = proxyServices[i] + encodeURIComponent(image.link);
                            
                            // 使用新圖片元素測試加載
                            const testImg = new Image();
                            testImg.crossOrigin = 'anonymous';
                            
                            await new Promise((resolve, reject) => {
                                testImg.onload = resolve;
                                testImg.onerror = reject;
                                testImg.src = proxyUrl;
                            });
                            
                            // 如果成功加載，則更新原圖片
                            img.src = proxyUrl;
                            return;
                        } catch (error) {
                            console.warn(`代理 ${i + 1} 載入失敗:`, error);
                        }
                    }
                    
                    // 如果所有代理都失敗，嘗試使用縮略圖
                    if (image.image && image.image.thumbnailLink) {
                        console.log('嘗試使用縮略圖:', image.image.thumbnailLink);
                        img.src = image.image.thumbnailLink;
                    } else {
                        loadingIndicator.innerHTML = '<span class="error-icon">!</span><span>圖片無法載入</span>';
                        loadingIndicator.className = 'loading-indicator error';
                    }
                };
                
                tryLoadWithProxy();
            };
            
            // 設置圖片源，添加時間戳避免快取問題
            img.src = image.link + (image.link.includes('?') ? '&' : '?') + 't=' + Date.now();
            
            const saveButton = document.createElement('button');
            saveButton.className = 'save-button';
            saveButton.textContent = '儲存圖片';
            
            // 修改儲存按鈕的事件處理
            saveButton.addEventListener('click', async () => {
                try {
                    saveButton.disabled = true;
                    saveButton.textContent = '儲存中...';
                    
                    // 創建一個canvas來繪製圖片，避免跨域問題
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // 等待圖片加載完成
                    await new Promise((resolve, reject) => {
                        const tempImg = new Image();
                        tempImg.crossOrigin = 'anonymous';
                        
                        // 設置載入超時
                        const timeoutId = setTimeout(() => {
                            reject(new Error('圖片載入超時'));
                        }, 10000);
                        
                        tempImg.onload = () => {
                            clearTimeout(timeoutId);
                            
                            // 檢查圖片是否有效
                            if (tempImg.width === 0 || tempImg.height === 0) {
                                reject(new Error('載入的圖片無效'));
                                return;
                            }
                            
                            // 設置合理的canvas尺寸
                            const maxDimension = 1200;
                            let width = tempImg.width;
                            let height = tempImg.height;
                            
                            if (width > height && width > maxDimension) {
                                height = Math.round((height * maxDimension) / width);
                                width = maxDimension;
                            } else if (height > maxDimension) {
                                width = Math.round((width * maxDimension) / height);
                                height = maxDimension;
                            }
                            
                            canvas.width = width;
                            canvas.height = height;
                            
                            // 使用高品質繪製
                            ctx.imageSmoothingEnabled = true;
                            ctx.imageSmoothingQuality = 'high';
                            
                            try {
                                ctx.drawImage(tempImg, 0, 0, width, height);
                                resolve();
                            } catch (e) {
                                reject(new Error('繪製圖片失敗: ' + e.message));
                            }
                        };
                        
                        tempImg.onerror = () => {
                            clearTimeout(timeoutId);
                            
                            // 如果原始圖片加載失敗，嘗試使用代理
                            const tryLoadWithProxy = async () => {
                                for (let i = 0; i < proxyServices.length; i++) {
                                    try {
                                        console.log(`嘗試通過代理 ${i + 1} 保存圖片`);
                                        const proxyUrl = proxyServices[i] + encodeURIComponent(img.src);
                                        tempImg.src = proxyUrl;
                                        // 等待一點時間讓新的src加載
                                        await new Promise(r => setTimeout(r, 1000));
                                        if (tempImg.complete && tempImg.naturalWidth > 0) {
                                            return;
                                        }
                                    } catch (e) {
                                        console.warn(`代理 ${i + 1} 載入失敗:`, e);
                                    }
                                }
                                
                                // 如果代理都失敗，嘗試縮略圖
                                if (image.image && image.image.thumbnailLink) {
                                    console.log('原始圖片載入失敗，嘗試使用縮略圖');
                                    tempImg.src = image.image.thumbnailLink;
                                } else {
                                    reject(new Error('無法載入圖片'));
                                }
                            };
                            
                            tryLoadWithProxy();
                        };
                        
                        // 嘗試載入當前顯示的圖片
                        tempImg.src = img.src;
                    });
                    
                    // 從canvas獲取圖片數據
                    const blob = await new Promise((resolve, reject) => {
                        try {
                            canvas.toBlob(blob => {
                                if (!blob || blob.size === 0) {
                                    reject(new Error('生成的圖片數據無效'));
                                } else {
                                    resolve(blob);
                                }
                            }, 'image/jpeg', 0.92); // 提高品質
                        } catch (error) {
                            reject(new Error('轉換圖片格式失敗: ' + error.message));
                        }
                    });
                    
                    // 檢查blob大小，過小可能表示圖片無效
                    if (blob.size < 1024) { // 小於1KB
                        throw new Error('圖片數據過小，可能無效');
                    }
                    
                    // 直接使用blob儲存到Firebase
                    const fileName = `${searchTerm}_${Date.now()}.jpg`;
                    const imageRef = storage.ref(`images/${fileName}`);
                    
                    // 顯示上傳進度
                    const uploadTask = imageRef.put(blob, { contentType: 'image/jpeg' });
                    uploadTask.on('state_changed', 
                        (snapshot) => {
                            const progress = Math.round(
                                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
                            );
                            saveButton.textContent = `上傳中 ${progress}%`;
                        },
                        (error) => {
                            throw new Error('上傳失敗: ' + error.message);
                        }
                    );
                    
                    await uploadTask;
                    const downloadUrl = await imageRef.getDownloadURL();
                    
                    // 快取圖片
                    try {
                        await cacheImage(downloadUrl, fileName);
                    } catch (cacheError) {
                        console.warn('快取圖片失敗，但不影響儲存:', cacheError);
                    }
                    
                    // 創建單詞卡
                    createFlashcard(downloadUrl, searchTerm, fileName);
                    
                    saveButton.textContent = '已儲存';
                    showTemporaryMessage('圖片已成功儲存！');
                    
                    setTimeout(() => {
                        saveButton.disabled = false;
                        saveButton.textContent = '儲存圖片';
                    }, 2000);
                } catch (error) {
                    console.error('儲存圖片時發生錯誤：', error);
                    saveButton.textContent = '儲存失敗';
                    setTimeout(() => {
                        saveButton.disabled = false;
                        saveButton.textContent = '儲存圖片';
                    }, 2000);
                    showTemporaryMessage('儲存失敗：' + error.message, 'error');
                }
            });
            
            imgContainer.appendChild(img);
            imgContainer.appendChild(saveButton);
            imgDiv.appendChild(imgContainer);
            resultsDiv.appendChild(imgDiv);
        });
        
        // 淡入效果
        resultsDiv.style.opacity = '1';
    }, 300); // 延遲300毫秒以顯示過渡動畫
}

// 修改 createFlashcard 函數，添加漸進式載入效果
function createFlashcard(imageUrl, word, fileName) {
    const flashcardsDiv = document.getElementById('flashcards');
    
    const card = document.createElement('div');
    card.className = 'flashcard';
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = word;
    img.loading = 'lazy'; // 使用延遲載入
    
    const wordDiv = document.createElement('div');
    wordDiv.className = 'word-div';
    wordDiv.textContent = word;
    
    const deleteButton = document.createElement('button');
    deleteButton.textContent = '×';
    deleteButton.className = 'delete-button';
    deleteButton.onclick = async (e) => {
        e.stopPropagation();
        try {
            const imageRef = storage.ref(`images/${fileName}`);
            await imageRef.delete();
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

// 修改 speakWord函數
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

// 修改 shuffleFlashcards 函數，移除提示訊息
function shuffleFlashcards() {
    const flashcardsContainer = document.getElementById('flashcards');
    const flashcards = Array.from(flashcardsContainer.children);
    
    flashcardsContainer.style.opacity = '0';
    
    setTimeout(() => {
        for (let i = flashcards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            flashcardsContainer.appendChild(flashcards[j]);
        }
        
        flashcardsContainer.style.opacity = '1';
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

// 在文件頂部添加語音合成相關的變量
// let speechSynthesis = window.speechSynthesis;
// let speechVoice = null;

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

    // 添加設定面板折疊功能
    const toggleButton = document.getElementById('toggleSettings');
    const settings = document.querySelector('.settings');
    
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

    // 添加卡片大小控制
    const cardSizeSlider = document.getElementById('cardSize');
    const sizeValueDisplay = document.getElementById('sizeValue');
    
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
                        await saveImageToFirebase(url, word);
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
                    await saveImageToFirebase(imageUrl, word);
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

    // 顯示載入中狀態 - 使用更小、更友好的指示器
    const resultsDiv = document.getElementById('searchResults');
    
    // 保存原始高度以避免畫面跳動
    const originalHeight = resultsDiv.clientHeight > 60 ? resultsDiv.clientHeight : 60;
    
    // 創建載入指示器
    resultsDiv.innerHTML = `
        <div class="loading-indicator" style="min-height: ${originalHeight}px;">
            <div class="loading-spinner"></div>
            <span>搜尋中...</span>
        </div>
    `;
    
    // 滾動到搜尋結果區域，但不要占用整個畫面
    if (window.scrollY > resultsDiv.offsetTop) {
        window.scrollTo({
            top: resultsDiv.offsetTop - 100,
            behavior: 'smooth'
        });
    }

    // 檢查緩存
    const cacheKey = `${searchTerm}_${page}`;
    const cachedResult = searchCache[cacheKey];
    const now = Date.now();

    if (cachedResult && (now - cachedResult.timestamp < CACHE_EXPIRY)) {
        console.log('從緩存載入搜尋結果:', cacheKey);
        
        // 使用緩存的數據
        const data = cachedResult.data;
        
        // 更新分頁信息
        if (data.searchInformation) {
            const totalResults = parseInt(data.searchInformation.totalResults) || 0;
            totalPages = Math.max(1, Math.ceil(Math.min(totalResults, 100) / 10));
            updatePageButtons();
        }
        
        // 顯示結果 - 添加短暫延遲，讓用戶感知到搜尋過程
        setTimeout(() => {
            if (data.items && data.items.length > 0) {
                displaySearchResults(data.items, searchTerm);
            } else {
                resultsDiv.innerHTML = `<div class="error-message">沒有找到相關圖片</div>`;
            }
        }, 300);
        
        return;
    }

    // 添加更多搜尋參數以獲取更高質量的圖片
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&searchType=image&q=${encodeURIComponent(searchTerm)}&start=${startIndex}&imgSize=large&imgType=photo&safe=active&fields=items(title,link,image/thumbnailLink),searchInformation/totalResults`;

    try {
        console.log('開始搜尋:', url);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`API響應錯誤: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // 將結果存入緩存
        searchCache[cacheKey] = {
            data: data,
            timestamp: Date.now()
        };
        
        if (data.error) {
            console.error('Google API 錯誤：', data.error);
            resultsDiv.innerHTML = `<div class="error-message">搜尋錯誤：${data.error.message}</div>`;
            return;
        }
        
        if (!data.items || data.items.length === 0) {
            resultsDiv.innerHTML = `<div class="error-message">沒有找到相關圖片</div>`;
            return;
        }

        // 計算總頁數，確保不會出現 NaN
        const totalResults = parseInt(data.searchInformation?.totalResults) || 0;
        totalPages = Math.max(1, Math.ceil(Math.min(totalResults, 100) / 10)); // Google API 限制最多100個結果
        
        // 更新換頁按鈕狀態
        updatePageButtons();
        
        console.log('搜尋結果：', data);
        
        // 預處理圖片數據，確保每個項目都有縮略圖並過濾無效的項目
        const processedItems = data.items
            .filter(item => item && item.link)
            .map(item => {
                // 創建新對象，避免修改原始數據
                const processedItem = { ...item };
                
                // 確保縮略圖存在
                if (!processedItem.image || !processedItem.image.thumbnailLink) {
                    processedItem.image = processedItem.image || {};
                    processedItem.image.thumbnailLink = processedItem.link;
                }
                
                // 檢查URL是否有效
                try {
                    new URL(processedItem.link);
                    new URL(processedItem.image.thumbnailLink);
                } catch (e) {
                    console.warn('發現無效URL:', processedItem.link, e);
                    // 如果URL無效，可能需要修復或添加前綴
                    if (!processedItem.link.startsWith('http')) {
                        processedItem.link = 'https://' + processedItem.link;
                    }
                    if (!processedItem.image.thumbnailLink.startsWith('http')) {
                        processedItem.image.thumbnailLink = 'https://' + processedItem.image.thumbnailLink;
                    }
                }
                
                return processedItem;
            });
        
        if (processedItems.length === 0) {
            resultsDiv.innerHTML = `<div class="error-message">處理圖片數據後沒有有效結果</div>`;
            return;
        }
        
        displaySearchResults(processedItems, searchTerm);
    } catch (error) {
        console.error('搜尋圖片時發生錯誤', error);
        resultsDiv.innerHTML = `<div class="error-message">搜尋失敗：${error.message}</div>`;
    }
}

// 添加更新換頁按鈕狀態的函數
function updatePageButtons() {
    const prevButton = document.getElementById('prevPage');
    const nextButton = document.getElementById('nextPage');
    
    prevButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
}

// 添加圖片快取相關函數
async function cacheImage(url, fileName) {
    try {
        const cache = await caches.open('image-cache');
        const response = await fetch(url);
        await cache.put(fileName, response);
        console.log('圖片已快取:', fileName);
    } catch (error) {
        console.error('快取圖片失敗:', error);
    }
}

// 使用多個代理服務嘗試獲取圖片
async function fetchWithProxies(url, attempt = 0) {
    // 如果已嘗試所有代理服務，則直接返回原始URL
    if (attempt >= proxyServices.length) {
        console.log('所有代理服務均失敗，使用原始URL');
        try {
            // 最後一次嘗試，用原始URL但不啟用CORS模式
            return fetch(url, { 
                mode: 'no-cors',
                cache: 'no-cache',
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            });
        } catch (finalError) {
            console.error('使用原始URL請求失敗:', finalError);
            throw new Error('無法獲取圖片');
        }
    }
    
    try {
        const proxyUrl = proxyServices[attempt] + encodeURIComponent(url);
        console.log(`嘗試使用代理 ${attempt + 1}/${proxyServices.length}: ${proxyServices[attempt]}`);
        
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Access-Control-Allow-Origin': '*'
            },
            referrerPolicy: 'no-referrer',
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            throw new Error(`代理服務 ${attempt + 1} 失敗`);
        }
        
        return response;
    } catch (error) {
        console.warn(`代理 ${attempt + 1} 失敗:`, error);
        // 嘗試下一個代理服務
        return fetchWithProxies(url, attempt + 1);
    }
} 