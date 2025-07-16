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
    
    // 測試Firebase連接
    storage.ref().listAll().then(() => {
        console.log('Firebase Storage 連接正常');
    }).catch(error => {
        console.error('Firebase Storage 連接失敗:', error);
    });
    
    // 在頁面載入完成後立即載入單詞卡
    window.addEventListener('load', loadFlashcards);
} catch (error) {
    console.error('Firebase 初始化失敗:', error);
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
        console.log('Firebase Storage 狀態:', storage ? '已初始化' : '未初始化');
        
        if (!storage) {
            throw new Error('Firebase Storage 未初始化');
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
        
        // 上传到 Firebase Storage
        console.log('開始上傳到 Firebase Storage:', fileName);
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
        console.log('上傳完成，取得下載連結...');
        const downloadUrl = await imageRef.getDownloadURL();
        console.log('下載連結:', downloadUrl);
        
        // 快取圖片
        await cacheImage(downloadUrl, fileName);
        
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
                await saveImageToFirebase(image.link, searchTerm);
                
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
            
            // 從文件名中提取時間戳
            const timestampMatch = fileName.match(/_(\d+)\.jpg$/);
            const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : Date.now();
            
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
                return { imageUrl, word, fileName, timestamp };
            } catch (error) {
                console.error('載入圖片失敗:', fileName, error);
                return { error: true, word, fileName, timestamp };
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
                createFlashcard(result.imageUrl, result.word, result.fileName, result.timestamp);
            }
        });
        
        // 載入完成後套用保存的排序狀態
        setTimeout(() => {
            const savedSortMode = localStorage.getItem('sortMode');
            if (savedSortMode === 'timeDesc') {
                sortFlashcardsByTime(false);
            } else if (savedSortMode === 'timeAsc') {
                sortFlashcardsByTime(true);
            }
        }, 100);
    } catch (error) {
        console.error('載入單詞卡時發生錯誤：', error);
        alert('載入單詞卡失敗：' + error.message);
    }
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

// 修改 createFlashcard 函數，添加漸進式載入效果
function createFlashcard(imageUrl, word, fileName, timestamp = Date.now()) {
    const flashcardsDiv = document.getElementById('flashcards');
    
    const card = document.createElement('div');
    card.className = 'flashcard';
    card.dataset.timestamp = timestamp; // 添加時間戳數據屬性
    card.dataset.fileName = fileName; // 添加文件名數據屬性
    
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
    
    if (sortByTimeDescBtn) {
        sortByTimeDescBtn.addEventListener('click', () => {
            sortFlashcardsByTime(false); // 最新優先
            
            // 更新按鈕狀態
            document.querySelectorAll('.sort-controls button').forEach(btn => {
                btn.classList.remove('active');
            });
            sortByTimeDescBtn.classList.add('active');
            
            // 保存排序狀態
            localStorage.setItem('sortMode', 'timeDesc');
        });
    }
    
    if (sortByTimeAscBtn) {
        sortByTimeAscBtn.addEventListener('click', () => {
            sortFlashcardsByTime(true); // 最舊優先
            
            // 更新按鈕狀態
            document.querySelectorAll('.sort-controls button').forEach(btn => {
                btn.classList.remove('active');
            });
            sortByTimeAscBtn.classList.add('active');
            
            // 保存排序狀態
            localStorage.setItem('sortMode', 'timeAsc');
        });
    }
    
    // 載入保存的排序狀態
    const savedSortMode = localStorage.getItem('sortMode');
    if (savedSortMode === 'timeDesc') {
        sortByTimeDescBtn.classList.add('active');
    } else if (savedSortMode === 'timeAsc') {
        sortByTimeAscBtn.classList.add('active');
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
        
        // 移除排序按鈕的active狀態
        document.querySelectorAll('.sort-controls button').forEach(btn => {
            btn.classList.remove('active');
        });
    }, 300);
}

// 添加時間排序功能
function sortFlashcardsByTime(ascending = false) {
    const flashcardsContainer = document.getElementById('flashcards');
    const flashcards = Array.from(flashcardsContainer.children);
    
    // 過濾掉錯誤卡片，只排序正常的卡片
    const normalCards = flashcards.filter(card => !card.classList.contains('error'));
    const errorCards = flashcards.filter(card => card.classList.contains('error'));
    
    flashcardsContainer.style.opacity = '0';
    
    setTimeout(() => {
        // 按時間戳排序
        normalCards.sort((a, b) => {
            const timestampA = parseInt(a.dataset.timestamp) || 0;
            const timestampB = parseInt(b.dataset.timestamp) || 0;
            
            return ascending ? timestampA - timestampB : timestampB - timestampA;
        });
        
        // 清空容器
        flashcardsContainer.innerHTML = '';
        
        // 重新添加排序後的卡片
        normalCards.forEach(card => flashcardsContainer.appendChild(card));
        errorCards.forEach(card => flashcardsContainer.appendChild(card));
        
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