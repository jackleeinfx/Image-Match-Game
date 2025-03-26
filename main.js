// Firebase 配置檢查
if (!firebase) {
    console.error('Firebase SDK 未載入');
}

// IndexedDB 配置
const DB_NAME = 'imageGameDB';
const DB_VERSION = 1;
const STORE_NAME = 'imageCache';
let db;
let storage;

// 初始化 IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'fileName' });
            }
        };
    });
}

// 初始化 Firebase
async function initFirebase() {
    try {
        firebase.initializeApp(firebaseConfig);
        storage = firebase.storage();
        console.log('Firebase 初始化成功');
        return true;
    } catch (error) {
        console.error('Firebase 初始化失敗:', error);
        return false;
    }
}

// 圖片壓縮函數
async function compressImage(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // 計算新的尺寸，保持寬高比
            const maxSize = 800; // 最大尺寸
            if (width > height && width > maxSize) {
                height = Math.round((height * maxSize) / width);
                width = maxSize;
            } else if (height > maxSize) {
                width = Math.round((width * maxSize) / height);
                height = maxSize;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // 使用較高的質量來保持圖片清晰度
            canvas.toBlob(resolve, 'image/jpeg', 0.85);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
    });
}

// 快取圖片
async function cacheImage(fileName, blob) {
    if (!db) {
        console.error('IndexedDB 未初始化');
        return;
    }
    try {
        const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
        await store.put({ fileName, blob, timestamp: Date.now() });
    } catch (error) {
        console.error('快取圖片失敗:', error);
    }
}

// 從快取獲取圖片
async function getCachedImage(fileName) {
    if (!db) {
        console.error('IndexedDB 未初始化');
        return null;
    }
    try {
        const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
        const result = await store.get(fileName);
        return result?.blob;
    } catch (error) {
        console.error('獲取快取圖片失敗:', error);
        return null;
    }
}

// 檢查快取是否過期（7天）
function isCacheExpired(timestamp) {
    const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7天
    return Date.now() - timestamp > CACHE_DURATION;
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

// Google Custom Search API 配置
const GOOGLE_API_KEY = 'AIzaSyDr_AXqYOMKlLTzqCwKzDM9o34sP3HmPS4';
const SEARCH_ENGINE_ID = '352d6a09646db440e';

document.getElementById('searchButton').addEventListener('click', searchImages);

async function searchImages() {
    const searchTerm = document.getElementById('searchInput').value;
    if (!searchTerm) return;

    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&searchType=image&q=${encodeURIComponent(searchTerm)}`;

    try {
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
        
        console.log('搜尋結果：', data);
        displaySearchResults(data.items, searchTerm);
    } catch (error) {
        console.error('搜尋圖片時發生錯誤', error);
        alert('搜尋過程中發生錯誤，請檢查控制台');
    }
}

// 修改 saveImageToFirebase 函數
async function saveImageToFirebase(imageUrl, searchTerm) {
    try {
        console.log('開始儲存圖片:', imageUrl);
        
        // 生成檔案名稱
        const fileName = `${searchTerm}_${Date.now()}.jpg`;
        
        // 获取图片数据
        let blob;
        if (imageUrl.startsWith('blob:')) {
            const response = await fetch(imageUrl);
            blob = await response.blob();
        } else {
            // 如果是网络图片，使用 img 元素加载
            blob = await new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob(resolve, 'image/jpeg', 0.95);
                };
                img.onerror = () => {
                    console.log('图片加载失败，尝试直接获取...');
                    fetch(imageUrl)
                        .then(response => response.blob())
                        .then(resolve)
                        .catch(reject);
                };
                img.src = imageUrl;
            });
        }

        if (!blob || blob.size === 0) {
            throw new Error('圖片數據無效');
        }

        // 壓縮圖片
        const compressedBlob = await compressImage(blob);
        
        // 快取壓縮後的圖片
        await cacheImage(fileName, compressedBlob);

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
                alert('上傳失敗：' + error.message);
            }
        );
        
        await uploadTask;
        const downloadUrl = await imageRef.getDownloadURL();
        
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
    resultsDiv.innerHTML = '';

    images.forEach(image => {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'image-item';
        
        const imgContainer = document.createElement('div');
        imgContainer.className = 'image-container';
        
        const img = document.createElement('img');
        img.src = image.link;
        img.alt = searchTerm;
        
        const saveButton = document.createElement('button');
        saveButton.className = 'save-button';
        saveButton.textContent = '儲存圖片';
        
        // 修改儲存按鈕的事件處理
        saveButton.addEventListener('click', async () => {
            try {
                await saveImageToFirebase(image.link, searchTerm);
            } catch (error) {
                console.error('儲存圖片時發生錯誤：', error);
            }
        });
        
        imgContainer.appendChild(img);
        imgContainer.appendChild(saveButton);
        imgDiv.appendChild(imgContainer);
        resultsDiv.appendChild(imgDiv);
    });
}

// 修改 loadFlashcards 函數
async function loadFlashcards() {
    try {
        console.log('開始載入單詞卡...');
        
        const flashcardsDiv = document.getElementById('flashcards');
        flashcardsDiv.innerHTML = '';
        
        if (!storage) {
            throw new Error('Firebase Storage 未初始化');
        }
        
        // 獲取 Storage 中 images 資料夾的引用
        const imagesRef = storage.ref('images');
        
        // 列出所有圖片
        const imagesList = await imagesRef.listAll();
        console.log('找到 ' + imagesList.items.length + ' 張圖片');
        
        if (imagesList.items.length === 0) {
            console.log('還沒有儲存任何圖片');
            flashcardsDiv.innerHTML = '<p>還沒有儲存任何單詞卡</p>';
            return;
        }

        // 顯示所有圖片
        for (const imageRef of imagesList.items) {
            try {
                const fileName = imageRef.name;
                const word = fileName.split('_')[0];
                
                // 嘗試從快取獲取圖片
                let imageUrl;
                const cachedImage = await getCachedImage(fileName);
                
                if (cachedImage) {
                    imageUrl = URL.createObjectURL(cachedImage);
                } else {
                    // 如果快取中沒有，則從 Firebase 下載
                    imageUrl = await imageRef.getDownloadURL();
                    // 下載後快取
                    const response = await fetch(imageUrl);
                    const blob = await response.blob();
                    await cacheImage(fileName, blob);
                }
                
                console.log('載入圖片:', fileName);
                createFlashcard(imageUrl, word, fileName);
            } catch (error) {
                console.error('載入單張圖片失敗:', error);
                continue; // 繼續處理下一張圖片
            }
        }
    } catch (error) {
        console.error('載入單詞卡時發生錯誤：', error);
        const flashcardsDiv = document.getElementById('flashcards');
        flashcardsDiv.innerHTML = '<p>載入單詞卡失敗，請檢查網路連接並重新整理頁面</p>';
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
        topShuffleButton.addEventListener('click', () => {
            shuffleFlashcards();
            showTemporaryMessage('單詞卡已隨機排序！');
        });
    }

    // 添加隨機排序按鈕事件
    const shuffleButton = document.getElementById('shuffleCards');
    if (shuffleButton) {
        shuffleButton.addEventListener('click', () => {
            shuffleFlashcards();
            showTemporaryMessage('單詞卡已隨機排序！');
        });
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

// 修改 createFlashcard 函數，添加語音功能
function createFlashcard(imageUrl, word, fileName) {
    const flashcardsDiv = document.getElementById('flashcards');
    
    const card = document.createElement('div');
    card.className = 'flashcard';
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = word;
    
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

// 添加隨機排序函數
function shuffleFlashcards() {
    const flashcardsContainer = document.getElementById('flashcards');
    const flashcards = Array.from(flashcardsContainer.children);
    
    // 添加淡出效果
    flashcardsContainer.style.opacity = '0';
    
    setTimeout(() => {
        // Fisher-Yates 洗牌算法
        for (let i = flashcards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            flashcardsContainer.appendChild(flashcards[j]);
        }
        
        // 恢復顯示
        flashcardsContainer.style.opacity = '1';
    }, 300); // 等待淡出動畫完成
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

// 在 DOMContentLoaded 事件中初始化
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 先初始化 IndexedDB
        await initDB();
        console.log('IndexedDB 初始化成功');
        
        // 再初始化 Firebase
        const firebaseInitialized = await initFirebase();
        if (firebaseInitialized) {
            // 載入單詞卡
            await loadFlashcards();
        } else {
            throw new Error('Firebase 初始化失敗');
        }
    } catch (error) {
        console.error('初始化失敗:', error);
        const flashcardsDiv = document.getElementById('flashcards');
        flashcardsDiv.innerHTML = '<p>系統初始化失敗，請重新整理頁面</p>';
    }
    
    // 添加其他事件監聽器
    document.getElementById('searchButton').addEventListener('click', searchImages);
}); 