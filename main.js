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

// 修改儲存函數，改善圖片載入問題
async function saveImageToFirebase(imageUrl, searchTerm) {
    try {
        console.log('開始儲存圖片:', imageUrl);
        
        // 生成檔案名稱
        const fileName = `${searchTerm}_${Date.now()}.jpg`;
        
        // 获取图片数据
        let blob;
        if (imageUrl.startsWith('blob:')) {
            // 如果是本地文件
            const response = await fetch(imageUrl);
            blob = await response.blob();
        } else {
            // 如果是网络图片，使用 img 元素加载
            blob = await new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';  // 添加跨域支持
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
                    // 如果跨域加载失败，尝试直接获取图片
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

        // 上传到 Firebase Storage
        const imageRef = storage.ref(`images/${fileName}`);
        const uploadTask = imageRef.put(blob, {
            contentType: 'image/jpeg'
        });
        
        // 监控上传进度
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
        
        alert('圖片已成功儲存！');
        
    } catch (error) {
        console.error('儲存過程中發生錯誤：', error);
        // 不要在这里显示错误提示，因为可能是中间过程的错误，而最终保存是成功的
        throw error;  // 将错误往上抛，让调用者处理
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
        saveButton.addEventListener('click', () => saveImageToFirebase(image.link, searchTerm));
        
        imgContainer.appendChild(img);
        imgContainer.appendChild(saveButton);
        imgDiv.appendChild(imgContainer);
        resultsDiv.appendChild(imgDiv);
    });
}

async function loadFlashcards() {
    try {
        console.log('開始載入單詞卡...');
        
        const flashcardsDiv = document.getElementById('flashcards');
        flashcardsDiv.innerHTML = '';
        
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
            const imageUrl = await imageRef.getDownloadURL();
            const fileName = imageRef.name;
            const word = fileName.split('_')[0];
            
            console.log('載入圖片:', fileName);
            createFlashcard(imageUrl, word, fileName);
        }
    } catch (error) {
        console.error('載入單詞卡時發生錯誤：', error);
        alert('載入單詞卡失敗：' + error.message);
    }
}

// 在文件頂部添加語音合成相關的變量
let speechSynthesis = window.speechSynthesis;
let speechVoice = null;

// 在 DOMContentLoaded 事件中初始化語音設置
document.addEventListener('DOMContentLoaded', () => {
    // ... 原有的代碼 ...

    // 初始化語音設置
    initSpeech();

    // 添加隨機排序按鈕事件
    const shuffleButton = document.getElementById('shuffleCards');
    shuffleButton.addEventListener('click', shuffleFlashcards);

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
});

// 修改語音初始化函數
function initSpeech() {
    // 檢查瀏覽器是否支援語音合成
    if (!window.speechSynthesis) {
        console.warn('此瀏覽器不支援語音合成');
        return;
    }

    // 在 iOS 上需要在用戶交互時初始化語音
    function initVoices() {
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0) {
            // 優先選擇英語語音
            speechVoice = voices.find(voice => 
                voice.lang.includes('en')
            ) || voices[0];
            console.log('已選擇語音：', speechVoice.name);
        } else {
            console.warn('沒有可用的語音');
        }
    }

    // 如果語音列表已經可用，直接初始化
    if (speechSynthesis.getVoices().length > 0) {
        initVoices();
    }

    // 監聽語音列表變化
    speechSynthesis.addEventListener('voiceschanged', initVoices);
}

// 修改語音播放函數
function speakWord(word) {
    // 檢查是否支援語音功能
    if (!window.speechSynthesis || !word) {
        console.warn('語音功能不可用或沒有文字');
        return;
    }

    // 在 iOS 上需要先暫停再重新開始
    speechSynthesis.cancel();

    // 創建新的語音實例
    const utterance = new SpeechSynthesisUtterance(word);
    
    // 如果有可用的語音，使用它
    if (speechVoice) {
        utterance.voice = speechVoice;
    }

    // 設置語音參數
    utterance.rate = 0.8;  // 語速
    utterance.pitch = 1;   // 音調
    utterance.volume = 1;  // 音量
    utterance.lang = 'en-US';  // 確保使用英語

    // 添加錯誤處理
    utterance.onerror = (event) => {
        console.error('語音播放錯誤：', event);
    };

    // 在 iOS 上需要在用戶交互時播放
    try {
        speechSynthesis.speak(utterance);
        
        // iOS 的特殊處理
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
            setTimeout(() => {
                // 確保語音開始播放
                if (speechSynthesis.paused) {
                    speechSynthesis.resume();
                }
            }, 100);
        }
    } catch (error) {
        console.error('語音播放失敗：', error);
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
    deleteButton.textContent = '刪除';
    deleteButton.className = 'delete-button';
    deleteButton.onclick = async (e) => {
        e.stopPropagation();
        try {
            const imageRef = storage.ref(`images/${fileName}`);
            await imageRef.delete();
            card.remove();
            alert('刪除成功！');
        } catch (error) {
            console.error('刪除失敗：', error);
            alert('刪除失敗：' + error.message);
        }
    };
    
    // 修改雙擊事件，添加語音播放
    card.addEventListener('dblclick', () => {
        card.classList.toggle('show-all');
        
        // 在 iOS 上，使用 touch 事件可能更可靠
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
            // 確保在用戶交互時播放
            document.body.addEventListener('touchend', () => {
                speakWord(word);
            }, { once: true });
        } else {
            speakWord(word);
        }

        setTimeout(() => {
            card.classList.remove('show-all');
        }, 3000);
    });
    
    card.appendChild(img);
    card.appendChild(wordDiv);
    card.appendChild(deleteButton);
    flashcardsDiv.appendChild(card);
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
        if (!word) return;  // 如果用戶取消或未輸入，則退出

        // 處理拖放的項目
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            // 如果是圖片URL（從其他網站拖放）
            if (item.kind === 'string' && item.type.match('^text/plain')) {
                item.getAsString(async (url) => {
                    try {
                        await saveImageToFirebase(url, word);
                    } catch (error) {
                        console.error('處理拖放的URL過程中發生錯誤：', error);
                        // 不顯示錯誤提示，因為可能是中間過程的錯誤
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
                } catch (error) {
                    console.error('處理拖放的文件過程中發生錯誤：', error);
                    // 不顯示錯誤提示，因為可能是中間過程的錯誤
                }
            }
        }
    } catch (error) {
        console.error('拖放處理失敗：', error);
        // 只在整個過程完全失敗時才顯示錯誤
        alert('處理圖片失敗：' + error.message);
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