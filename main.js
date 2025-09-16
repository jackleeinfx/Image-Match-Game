// 全域懸停視窗清理函數
function clearAllGroupTooltips() {
    const allTooltips = document.querySelectorAll('.group-tooltip');
    allTooltips.forEach(tooltip => {
        if (tooltip && tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
        }
    });
    
    // 清理所有群組按鈕的tooltip引用
    const groupButtons = document.querySelectorAll('.group-button');
    groupButtons.forEach(button => {
        if (button.dataset.tooltipId) {
            delete button.dataset.tooltipId;
        }
        if (button.tooltipElement) {
            button.tooltipElement = null;
        }
    });
}

// 在頁面點擊時清理所有懸停視窗
document.addEventListener('click', function(e) {
    // 如果點擊的不是群組按鈕或懸停視窗，則清理所有懸停視窗
    if (!e.target.closest('.group-button') && !e.target.closest('.group-tooltip')) {
        clearAllGroupTooltips();
    }
});

// 在頁面滾動時也清理懸停視窗
document.addEventListener('scroll', function() {
    clearAllGroupTooltips();
});

// 定期清理機制，每5秒檢查一次是否有殘留的懸停視窗
setInterval(function() {
    const tooltips = document.querySelectorAll('.group-tooltip');
    if (tooltips.length > 0) {
        console.log('發現殘留的懸停視窗，正在清理...', tooltips.length);
        clearAllGroupTooltips();
    }
}, 5000);

// 頁面可見性變化時清理懸停視窗（例如切換瀏覽器標籤頁）
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        clearAllGroupTooltips();
    }
});

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
    
    // 初始化数据表
    initializeDatabase();
    
    // 在頁面載入完成後立即載入單詞卡
    window.addEventListener('load', () => {
        console.log('頁面載入完成，開始載入單詞卡...');
        loadFlashcards();
    });
} catch (error) {
    console.error('Supabase 初始化失敗:', error);
    alert('請先設置 Supabase 配置！請在 main.js 中填入您的 SUPABASE_URL 和 SUPABASE_ANON_KEY');
}

// 初始化数据库表
async function initializeDatabase() {
    try {
        // 检查表是否存在，如果不存在则创建
        const { data, error } = await supabaseClient
            .from('flashcard_explanations')
            .select('*')
            .limit(1);
            
        if (error && error.code === 'PGRST116') {
            console.log('表不存在，需要手动创建 flashcard_explanations 表');
            console.log('请在 Supabase 控制台的 SQL Editor 中运行以下 SQL:');
            console.log(`
CREATE TABLE flashcard_explanations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_name TEXT NOT NULL UNIQUE,
    word TEXT NOT NULL,
    chinese_name TEXT DEFAULT '',
    explanation TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX idx_flashcard_explanations_file_name ON flashcard_explanations(file_name);
CREATE INDEX idx_flashcard_explanations_word ON flashcard_explanations(word);

-- 启用行级安全 (RLS)
ALTER TABLE flashcard_explanations ENABLE ROW LEVEL SECURITY;

-- 创建允许所有操作的策略（对于简单应用）
CREATE POLICY "Allow all operations" ON flashcard_explanations FOR ALL USING (true);
            `);
        } else if (error) {
            console.error('检查数据表时发生错误:', error);
        } else {
            console.log('flashcard_explanations 表已存在');
        }
    } catch (error) {
        console.error('初始化数据库时发生错误:', error);
    }
}

// 保存或更新卡片数据到 Supabase
async function saveCardDataToSupabase(fileName, word, chineseName = '', explanation = '') {
    try {
        const { data, error } = await supabaseClient
            .from('flashcard_explanations')
            .upsert({
                file_name: fileName,
                word: word,
                chinese_name: chineseName,
                explanation: explanation,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'file_name'
            });

        if (error) {
            throw error;
        }
        
        console.log('卡片数据已保存到云端:', fileName, { word, chineseName, explanation });
        return true;
    } catch (error) {
        console.error('保存卡片数据到云端失败:', error);
        throw error;
    }
}

// 保留旧函数以兼容性（仅更新解释）
async function saveExplanationToSupabase(fileName, word, explanation) {
    return await saveCardDataToSupabase(fileName, word, '', explanation);
}

// 从 Supabase 加载完整卡片数据
async function loadCardDataFromSupabase(fileName) {
    try {
        const { data, error } = await supabaseClient
            .from('flashcard_explanations')
            .select('word, chinese_name, explanation')
            .eq('file_name', fileName)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log('卡片数据不存在:', fileName);
                return { word: '', chineseName: '', explanation: '' };
            }
            throw error;
        }

        return {
            word: data?.word || '',
            chineseName: data?.chinese_name || '',
            explanation: data?.explanation || ''
        };
    } catch (error) {
        console.error('从云端加载卡片数据失败:', error);
        return { word: '', chineseName: '', explanation: '' };
    }
}

// 保留旧函数以兼容性（仅加载解释）
async function loadExplanationFromSupabase(fileName) {
    try {
        const { data, error } = await supabaseClient
            .from('flashcard_explanations')
            .select('explanation')
            .eq('file_name', fileName)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log('解释数据不存在:', fileName);
                return '';
            }
            throw error;
        }

        return data?.explanation || '';
    } catch (error) {
        console.error('从云端加载解释失败:', error);
        return '';
    }
}

// 批量加载所有解释
async function loadAllExplanations() {
    try {
        const { data, error } = await supabaseClient
            .from('flashcard_explanations')
            .select('file_name, explanation');

        if (error) {
            console.error('批量加载解释失败:', error);
            return {};
        }

        const explanations = {};
        data?.forEach(item => {
            explanations[item.file_name] = item.explanation;
        });

        return explanations;
    } catch (error) {
        console.error('批量加载解释失败:', error);
        return {};
    }
}

// Google Custom Search API 配置
const GOOGLE_API_KEY = 'AIzaSyDr_AXqYOMKlLTzqCwKzDM9o34sP3HmPS4';
const SEARCH_ENGINE_ID = '352d6a09646db440e';

document.getElementById('searchButton').addEventListener('click', () => {
    searchImages(1); // 重置到第一頁
});

// 为搜索输入框添加 Enter 键功能
document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        searchImages(1); // 重置到第一頁
    }
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
        
        // 验证图片是否可以访问
        console.log('开始验证图片可访问性:', fileName, downloadUrl);
        await verifyImageAccessible(downloadUrl);
        console.log('图片验证完成，准备显示弹窗');
        
        // 显示卡片编辑弹窗，在用户确认后再创建卡片
        explanationModal.show(searchTerm, fileName, '', '', async (word, chineseName, explanation) => {
            try {
                // 保存卡片数据到数据库
                await saveCardDataToSupabase(fileName, word, chineseName, explanation);
                
                // 创建卡片并立即显示，避免被懒加载系统影响
                console.log('开始创建卡片:', fileName, word);
                createFlashcard(downloadUrl, word, fileName, timestamp);
                
                // 立即更新新创建卡片的显示并检查图片状态
                setTimeout(() => {
                    const card = document.querySelector(`[data-file-name="${fileName}"]`);
                    if (card) {
                        const wordDiv = card.querySelector('.word-div');
                        const chineseNameDiv = card.querySelector('.chinese-name-div');
                        const explanationDiv = card.querySelector('.explanation-div');
                        const imgElement = card.querySelector('img');
                        
                        if (wordDiv) wordDiv.textContent = word;
                        if (chineseNameDiv) chineseNameDiv.textContent = chineseName;
                        if (explanationDiv) {
                            // 将换行符转换为HTML换行标签
                            const explanationWithBreaks = explanation.replace(/\n/g, '<br>');
                            explanationDiv.innerHTML = explanationWithBreaks;
                            // 检查解释翻译按钮显示
                            updateExplanationTranslateButtonVisibility(explanationDiv);
                        }
                        
                        // 检查图片元素状态
                        console.log('卡片创建后检查:', {
                            fileName: fileName,
                            cardFound: !!card,
                            imgFound: !!imgElement,
                            imgSrc: imgElement ? imgElement.src : 'N/A',
                            imgComplete: imgElement ? imgElement.complete : 'N/A',
                            imgNaturalWidth: imgElement ? imgElement.naturalWidth : 'N/A'
                        });
                    } else {
                        console.error('创建卡片后未找到卡片元素:', fileName);
                    }
                }, 100);
                
                showTemporaryMessage('單詞卡創建成功！', 'success');
                
            } catch (error) {
                console.error('創建單詞卡失敗:', error);
                showTemporaryMessage('創建失敗: ' + error.message, 'error');
            }
        });
        
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

// 等待 GroupManager 初始化完成的函數
async function waitForGroupManager() {
    return new Promise((resolve) => {
        if (window.groupManager && window.groupManager.initialized) {
            resolve();
            return;
        }
        
        // 監聽 GroupManager 初始化完成事件
        const handleGroupManagerReady = () => {
            window.removeEventListener('groupManagerReady', handleGroupManagerReady);
            resolve();
        };
        
        window.addEventListener('groupManagerReady', handleGroupManagerReady);
        
        // 設置超時，防止無限等待
        setTimeout(() => {
            window.removeEventListener('groupManagerReady', handleGroupManagerReady);
            console.warn('GroupManager 初始化超時，繼續載入卡片');
            resolve();
        }, 5000);
    });
}

// 修改 loadFlashcards 函數，實現無限滾動
async function loadFlashcards() {
    try {
        console.log('開始載入單詞卡...');
        
        const flashcardsDiv = document.getElementById('flashcards');
        flashcardsDiv.innerHTML = '';
        
        if (!supabaseClient) {
            throw new Error('Supabase 客戶端未初始化');
        }
        
        // 等待 GroupManager 初始化完成
        await waitForGroupManager();
        console.log('GroupManager 已初始化，開始載入卡片數據');
        
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
            // 檢查所有翻譯按鈕的顯示狀態
            checkAllExplanationTranslateButtons();
            // 更新群組指示器和過濾（GroupManager 已確保初始化）
            window.groupManager.updateCardGroupIndicators();
            window.groupManager.filterCardsByGroups();
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
            
            // 創建懶加載的單詞卡（添加到底部）
            createLazyFlashcard(imageUrl, cardData.word, cardData.fileName, cardData.timestamp, true);
            
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
        
        // 應用群組過濾到新載入的卡片
        if (window.groupManager && window.groupManager.initialized) {
            window.groupManager.updateCardGroupIndicators();
            window.groupManager.filterCardsByGroups();
            console.log('已對新載入的卡片應用群組過濾');
        }
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
        img.style.opacity = '0.5'; // 初始半透明
        
        // 設置載入超時（10秒）
        const loadPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('載入超時'));
            }, 10000);
            
            img.onload = () => {
                clearTimeout(timeout);
                console.log('圖片載入成功:', word);
                img.style.opacity = '1'; // 加载成功后变为不透明
                resolve();
            };
            
            img.onerror = (e) => {
                clearTimeout(timeout);
                console.error('圖片載入錯誤:', word, e);
                // 重试加载
                setTimeout(() => {
                    img.src = imageUrl + '?retry=' + Date.now();
                }, 1000);
                reject(new Error('圖片載入失敗'));
            };
            
            // 開始載入圖片，添加时间戳避免缓存问题
            img.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
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
        // 從設定中獲取語速，如果沒有則使用默認值0.8
        const speechRate = parseFloat(localStorage.getItem('speechRate')) || 0.8;
        
        responsiveVoice.cancel(); // 如果有正在播放的語音，先停止
        responsiveVoice.speak(word, "US English Male", {
            rate: speechRate,
            pitch: 1,
            volume: 1
        });
    }
}

// 創建懶加載的單詞卡（只顯示佔位符，圖片稍後載入）
function createLazyFlashcard(imageUrl, word, fileName, timestamp = Date.now(), appendToBottom = false) {
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
    
    // 创建中文名容器
    const chineseNameContainer = document.createElement('div');
    chineseNameContainer.className = 'chinese-name-container';
    
    // 创建中文名字段
    const chineseNameDiv = document.createElement('div');
    chineseNameDiv.className = 'chinese-name-div';
    chineseNameDiv.contentEditable = false;
    chineseNameDiv.dataset.fileName = fileName;
    
    // 创建翻译按钮
    const translateButton = document.createElement('button');
    translateButton.className = 'translate-button';
    translateButton.textContent = '译';
    translateButton.title = '翻译单词到中文';
    
    // 翻译按钮点击事件
    translateButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        await translateWordToChinese(wordDiv, chineseNameDiv, translateButton, fileName);
    });
    
    // 将中文名字段和翻译按钮添加到容器
    chineseNameContainer.appendChild(chineseNameDiv);
    chineseNameContainer.appendChild(translateButton);
    
    // 创建解释容器
    const explanationContainer = document.createElement('div');
    explanationContainer.className = 'explanation-container';
    
    // 创建解释字段
    const explanationDiv = document.createElement('div');
    explanationDiv.className = 'explanation-div';
    explanationDiv.contentEditable = false;
    explanationDiv.dataset.fileName = fileName;
    
    // 创建解释翻译按钮
    const explanationTranslateButton = document.createElement('button');
    explanationTranslateButton.className = 'explanation-translate-button';
    explanationTranslateButton.textContent = '译';
    explanationTranslateButton.title = '翻译解释到中文';
    
    // 解释翻译按钮点击事件
    explanationTranslateButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        await translateExplanationToChinese(explanationDiv, explanationTranslateButton, e.target);
    });
    
    // 将解释字段和翻译按钮添加到容器
    explanationContainer.appendChild(explanationDiv);
    explanationContainer.appendChild(explanationTranslateButton);
    
    // 异步加载卡片数据
    loadCardDataForCard(wordDiv, chineseNameDiv, explanationDiv, fileName);
    
    // 添加字段的编辑功能
    setupCardEditing(wordDiv, chineseNameDiv, explanationDiv, fileName, word);
    
    const deleteButton = document.createElement('button');
    deleteButton.textContent = '×';
    deleteButton.className = 'delete-button';
    deleteButton.onclick = async (e) => {
        e.stopPropagation();
        
        const word = card.querySelector('.word-div').textContent || '此單詞卡';
        const confirmMessage = `確定要刪除「${word}」這張單詞卡嗎？此操作無法撤銷。`;
        
        deleteConfirmModal.show(confirmMessage, async () => {
            try {
                // 删除图片文件
                const { error: storageError } = await supabaseClient.storage
                    .from('images')
                    .remove([fileName]);
                
                if (storageError) {
                    throw storageError;
                }
                
                // 删除解释数据
                const { error: dbError } = await supabaseClient
                    .from('flashcard_explanations')
                    .delete()
                    .eq('file_name', fileName);
                
                if (dbError && dbError.code !== 'PGRST116') {
                    console.warn('删除解释数据时出现警告:', dbError);
                }
                
                card.remove();
                showTemporaryMessage('卡片已刪除！');
            } catch (error) {
                console.error('刪除失敗：', error);
                showTemporaryMessage('刪除失敗：' + error.message, 'error');
            }
        });
    };
    
    card.addEventListener('dblclick', (e) => {
        // 如果点击的是可编辑字段，不触发双击事件
        if (e.target.classList.contains('word-div') || 
            e.target.classList.contains('chinese-name-div') || 
            e.target.classList.contains('explanation-div')) {
            return;
        }
        
        card.classList.toggle('show-all');
        speakWord(word);
        setTimeout(() => {
            card.classList.remove('show-all');
        }, 3000);
    });
    
    card.appendChild(placeholder);
    card.appendChild(wordDiv);
    card.appendChild(chineseNameContainer);
    card.appendChild(explanationContainer);
    card.appendChild(deleteButton);
    
    // 根據參數決定插入位置
    if (appendToBottom) {
        // 添加到底部（用於無限滾動）
        flashcardsDiv.appendChild(card);
    } else {
        // 插入到最上方（用於新建卡片）
        if (flashcardsDiv.firstChild) {
            flashcardsDiv.insertBefore(card, flashcardsDiv.firstChild);
        } else {
            flashcardsDiv.appendChild(card);
        }
    }
    
    // 添加群組指示器（GroupManager 已確保初始化）
    if (window.groupManager && window.groupManager.initialized) {
        window.groupManager.updateSingleCardGroupIndicator(card, fileName);
    }
}

// 修改 createFlashcard 函數，添加漸進式載入效果（用於直接載入的圖片）
function createFlashcard(imageUrl, word, fileName, timestamp = Date.now()) {
    const flashcardsDiv = document.getElementById('flashcards');
    
    const card = document.createElement('div');
    card.className = 'flashcard';
    card.dataset.timestamp = timestamp;
    card.dataset.fileName = fileName;
    card.dataset.imageUrl = imageUrl; // 储存图片URL，用于调试和后续使用
    
    const img = document.createElement('img');
    img.alt = word;
    img.loading = 'eager'; // 改为立即加载
    img.style.width = '100%';
    img.style.display = 'block';
    img.style.opacity = '0.5'; // 初始半透明，加载完成后变为不透明
    
    // 添加加载状态处理
    img.addEventListener('load', () => {
        console.log('图片加载成功:', fileName);
        img.style.opacity = '1';
    });
    
    let retryCount = 0;
    img.addEventListener('error', () => {
        console.error('图片加载失败:', fileName, imageUrl, '重试次数:', retryCount);
        if (retryCount < 3) {
            retryCount++;
            // 重试加载，使用递增的延迟
            setTimeout(() => {
                const retryUrl = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 'retry=' + Date.now();
                console.log('重试加载图片:', fileName, '次数:', retryCount, 'URL:', retryUrl);
                img.src = retryUrl;
            }, 1000 * retryCount);
        } else {
            console.error('图片加载失败，已达到最大重试次数:', fileName);
            // 可以在这里设置一个默认图片或错误提示
        }
    });
    
    // 设置图片源，添加时间戳避免缓存问题
    const finalImageUrl = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
    console.log('createFlashcard 设置图片源:', fileName, 'URL:', finalImageUrl);
    img.src = finalImageUrl;
    
    const wordDiv = document.createElement('div');
    wordDiv.className = 'word-div';
    wordDiv.textContent = word;
    
    // 创建中文名容器
    const chineseNameContainer = document.createElement('div');
    chineseNameContainer.className = 'chinese-name-container';
    
    // 创建中文名字段
    const chineseNameDiv = document.createElement('div');
    chineseNameDiv.className = 'chinese-name-div';
    chineseNameDiv.contentEditable = false;
    chineseNameDiv.dataset.fileName = fileName;
    
    // 创建翻译按钮
    const translateButton = document.createElement('button');
    translateButton.className = 'translate-button';
    translateButton.textContent = '译';
    translateButton.title = '翻译单词到中文';
    
    // 翻译按钮点击事件
    translateButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        await translateWordToChinese(wordDiv, chineseNameDiv, translateButton, fileName);
    });
    
    // 将中文名字段和翻译按钮添加到容器
    chineseNameContainer.appendChild(chineseNameDiv);
    chineseNameContainer.appendChild(translateButton);
    
    // 创建解释容器
    const explanationContainer = document.createElement('div');
    explanationContainer.className = 'explanation-container';
    
    // 创建解释字段
    const explanationDiv = document.createElement('div');
    explanationDiv.className = 'explanation-div';
    explanationDiv.contentEditable = false;
    explanationDiv.dataset.fileName = fileName;
    
    // 创建解释翻译按钮
    const explanationTranslateButton = document.createElement('button');
    explanationTranslateButton.className = 'explanation-translate-button';
    explanationTranslateButton.textContent = '译';
    explanationTranslateButton.title = '翻译解释到中文';
    
    // 解释翻译按钮点击事件
    explanationTranslateButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        await translateExplanationToChinese(explanationDiv, explanationTranslateButton, e.target);
    });
    
    // 将解释字段和翻译按钮添加到容器
    explanationContainer.appendChild(explanationDiv);
    explanationContainer.appendChild(explanationTranslateButton);
    
    // 异步加载卡片数据
    loadCardDataForCard(wordDiv, chineseNameDiv, explanationDiv, fileName);
    
    // 添加字段的编辑功能
    setupCardEditing(wordDiv, chineseNameDiv, explanationDiv, fileName, word);
    
    const deleteButton = document.createElement('button');
    deleteButton.textContent = '×';
    deleteButton.className = 'delete-button';
    deleteButton.onclick = async (e) => {
        e.stopPropagation();
        
        const word = card.querySelector('.word-div').textContent || '此單詞卡';
        const confirmMessage = `確定要刪除「${word}」這張單詞卡嗎？此操作無法撤銷。`;
        
        deleteConfirmModal.show(confirmMessage, async () => {
            try {
                // 删除图片文件
                const { error: storageError } = await supabaseClient.storage
                    .from('images')
                    .remove([fileName]);
                
                if (storageError) {
                    throw storageError;
                }
                
                // 删除解释数据
                const { error: dbError } = await supabaseClient
                    .from('flashcard_explanations')
                    .delete()
                    .eq('file_name', fileName);
                
                if (dbError && dbError.code !== 'PGRST116') {
                    console.warn('删除解释数据时出现警告:', dbError);
                }
                
                card.remove();
                showTemporaryMessage('卡片已刪除！');
            } catch (error) {
                console.error('刪除失敗：', error);
                showTemporaryMessage('刪除失敗：' + error.message, 'error');
            }
        });
    };
    
    card.addEventListener('dblclick', (e) => {
        // 如果点击的是可编辑字段，不触发双击事件
        if (e.target.classList.contains('word-div') || 
            e.target.classList.contains('chinese-name-div') || 
            e.target.classList.contains('explanation-div')) {
            return;
        }
        
        card.classList.toggle('show-all');
        speakWord(word);
        setTimeout(() => {
            card.classList.remove('show-all');
        }, 3000);
    });
    
    card.appendChild(img);
    card.appendChild(wordDiv);
    card.appendChild(chineseNameContainer);
    card.appendChild(explanationContainer);
    card.appendChild(deleteButton);
    
    // 將新卡片插入到最上方
    if (flashcardsDiv.firstChild) {
        flashcardsDiv.insertBefore(card, flashcardsDiv.firstChild);
    } else {
        flashcardsDiv.appendChild(card);
    }
    
    // 添加群組指示器（GroupManager 已確保初始化）
    if (window.groupManager && window.groupManager.initialized) {
        window.groupManager.updateSingleCardGroupIndicator(card, fileName);
    }
}

// 在初始化部分添加拖放事件監聽
document.addEventListener('DOMContentLoaded', () => {
    // 檢查CSS是否正確載入
    const testElement = document.createElement('div');
    testElement.className = 'groups-section';
    document.body.appendChild(testElement);
    const computedStyle = window.getComputedStyle(testElement);
    console.log('Groups section CSS loaded:', computedStyle.display);
    document.body.removeChild(testElement);
    
    // 檢查關鍵DOM元素是否存在
    const addGroupBtn = document.getElementById('addGroupBtn');
    const noGroupBtn = document.getElementById('noGroupBtn');
    const groupsList = document.getElementById('groupsList');
    
    console.log('DOM elements check:', {
        addGroupBtn: !!addGroupBtn,
        noGroupBtn: !!noGroupBtn,
        groupsList: !!groupsList
    });
    
    // 初始化群組管理器，設為全局變量
    window.groupManager = new GroupManager();
    
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

    // 添加隐藏中文名控制
    const hideChineseNameCheckbox = document.getElementById('hideChineseName');
    hideChineseNameCheckbox.addEventListener('change', function() {
        document.body.classList.toggle('hide-chinese-name', this.checked);
        
        // 保存设置到 localStorage
        localStorage.setItem('hideChineseName', this.checked);
        
        // 显示提示消息
        if (this.checked) {
            showTemporaryMessage('已隱藏中文名', 'success');
        } else {
            showTemporaryMessage('已顯示中文名', 'success');
        }
    });

    // 载入保存的隐藏中文名设置
    const savedHideChineseName = localStorage.getItem('hideChineseName');
    if (savedHideChineseName === 'true') {
        hideChineseNameCheckbox.checked = true;
        document.body.classList.add('hide-chinese-name');
    }

    // 添加隐藏解释控制
    const hideExplanationCheckbox = document.getElementById('hideExplanation');
    hideExplanationCheckbox.addEventListener('change', function() {
        document.body.classList.toggle('hide-explanation', this.checked);
        
        // 保存设置到 localStorage
        localStorage.setItem('hideExplanation', this.checked);
        
        // 显示提示消息
        if (this.checked) {
            showTemporaryMessage('已隱藏解釋', 'success');
        } else {
            showTemporaryMessage('已顯示解釋', 'success');
        }
    });

    // 载入保存的隐藏解释设置
    const savedHideExplanation = localStorage.getItem('hideExplanation');
    if (savedHideExplanation === 'true') {
        hideExplanationCheckbox.checked = true;
        document.body.classList.add('hide-explanation');
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

    // 添加語速控制
    const speechRateSlider = document.getElementById('speechRate');
    const speechRateValueDisplay = document.getElementById('speechRateValue');
    
    if (speechRateSlider) {
        // 載入保存的語速設置
        loadSpeechRateFromCloud().then(savedRate => {
            if (savedRate !== null) {
                speechRateSlider.value = savedRate;
                updateSpeechRateDisplay(savedRate);
            } else {
                // 如果雲端沒有，嘗試從本地載入
                const localRate = localStorage.getItem('speechRate');
                if (localRate) {
                    speechRateSlider.value = localRate;
                    updateSpeechRateDisplay(localRate);
                }
            }
        });

        speechRateSlider.addEventListener('input', (e) => {
            const rate = e.target.value;
            updateSpeechRateDisplay(rate);
        });

        speechRateSlider.addEventListener('change', async (e) => {
            const rate = e.target.value;
            // 保存到本地
            localStorage.setItem('speechRate', rate);
            // 保存到雲端
            await saveSpeechRateToCloud(rate);
        });
    }

    // 添加编辑模式切换功能
    const toggleEditModeBtn = document.getElementById('toggleEditMode');
    
    if (toggleEditModeBtn) {
        // 载入保存的编辑模式状态
        const savedEditMode = localStorage.getItem('editMode');
        if (savedEditMode === 'true') {
            document.body.classList.add('edit-mode');
            toggleEditModeBtn.classList.add('active');
            toggleEditModeBtn.textContent = '🔒 鎖定模式';
        }

        toggleEditModeBtn.addEventListener('click', () => {
            const isEditMode = document.body.classList.contains('edit-mode');
            
            if (isEditMode) {
                // 切换到锁定模式
                document.body.classList.remove('edit-mode');
                toggleEditModeBtn.classList.remove('active');
                toggleEditModeBtn.textContent = '✏️ 編輯模式';
                localStorage.setItem('editMode', 'false');
                showTemporaryMessage('已切換到鎖定模式', 'success');
            } else {
                // 切换到编辑模式
                document.body.classList.add('edit-mode');
                toggleEditModeBtn.classList.add('active');
                toggleEditModeBtn.textContent = '🔒 鎖定模式';
                localStorage.setItem('editMode', 'true');
                showTemporaryMessage('已切換到編輯模式', 'success');
            }
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

// 添加更新語速顯示的函數
function updateSpeechRateDisplay(rate) {
    document.getElementById('speechRateValue').textContent = rate + 'x';
}

// 保存語速設置到雲端
async function saveSpeechRateToCloud(rate) {
    try {
        const { data, error } = await supabaseClient
            .from('flashcard_explanations')
            .upsert({
                file_name: '__SPEECH_RATE_SETTING__',
                word: 'speech_rate',
                chinese_name: '',
                explanation: rate.toString(),
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'file_name'
            });

        if (error) {
            console.warn('保存語速設置到雲端失敗:', error);
        } else {
            console.log('語速設置已保存到雲端:', rate);
        }
    } catch (error) {
        console.warn('保存語速設置到雲端時發生錯誤:', error);
    }
}

// 從雲端載入語速設置
async function loadSpeechRateFromCloud() {
    try {
        const { data, error } = await supabaseClient
            .from('flashcard_explanations')
            .select('explanation')
            .eq('file_name', '__SPEECH_RATE_SETTING__')
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log('雲端沒有語速設置，使用默認值');
                return null;
            }
            throw error;
        }

        const rate = parseFloat(data?.explanation);
        if (isNaN(rate) || rate < 0.3 || rate > 1) {
            console.warn('雲端語速設置無效，使用默認值');
            return null;
        }

        console.log('從雲端載入語速設置:', rate);
        return rate;
    } catch (error) {
        console.warn('從雲端載入語速設置失敗:', error);
        return null;
    }
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

// 检查解释内容并控制翻译按钮显示
function updateExplanationTranslateButtonVisibility(explanationDiv) {
    const explanationContainer = explanationDiv.parentElement;
    const translateButton = explanationContainer.querySelector('.explanation-translate-button');
    
    if (translateButton) {
        const hasContent = explanationDiv.textContent.trim().length > 0;
        if (hasContent) {
            translateButton.style.display = 'flex';
            translateButton.style.setProperty('display', 'flex', 'important');
        } else {
            translateButton.style.display = 'none';
            translateButton.style.setProperty('display', 'none', 'important');
        }
        console.log('翻譯按鈕顯示狀態更新:', hasContent ? '顯示' : '隱藏', '解釋內容:', explanationDiv.textContent.trim());
    }
}

// 檢查所有解釋翻譯按鈕的顯示狀態
function checkAllExplanationTranslateButtons() {
    const allExplanationDivs = document.querySelectorAll('.explanation-div');
    console.log('開始檢查所有翻譯按鈕，找到', allExplanationDivs.length, '個解釋字段');
    
    allExplanationDivs.forEach((explanationDiv, index) => {
        console.log(`檢查解釋字段 ${index + 1}:`, explanationDiv.textContent.trim());
        updateExplanationTranslateButtonVisibility(explanationDiv);
    });
}

// 为卡片加载完整数据
async function loadCardDataForCard(wordDiv, chineseNameDiv, explanationDiv, fileName) {
    try {
        const cardData = await loadCardDataFromSupabase(fileName);
        
        // 如果云端有数据，更新显示的单词
        if (cardData.word) {
            wordDiv.textContent = cardData.word;
        }
        
        chineseNameDiv.textContent = cardData.chineseName;
        
        // 对于解释字段，将换行符转换为HTML换行标签
        if (cardData.explanation) {
            const explanationWithBreaks = cardData.explanation.replace(/\n/g, '<br>');
            explanationDiv.innerHTML = explanationWithBreaks;
        } else {
            explanationDiv.innerHTML = '';
        }
        
        // 检查解释内容并控制翻译按钮显示
        updateExplanationTranslateButtonVisibility(explanationDiv);
        
        console.log('已加载卡片数据:', fileName, cardData);
    } catch (error) {
        console.error('加载卡片数据失败:', fileName, error);
        chineseNameDiv.textContent = '';
        explanationDiv.innerHTML = '';
        
        // 即使加载失败也要检查翻译按钮显示
        updateExplanationTranslateButtonVisibility(explanationDiv);
    }
}

// 为解释字段加载内容（保留旧函数以兼容性）
async function loadExplanationForCard(explanationDiv, fileName) {
    try {
        const explanation = await loadExplanationFromSupabase(fileName);
        explanationDiv.textContent = explanation;
        console.log('已加载解释:', fileName, explanation);
    } catch (error) {
        console.error('加载解释失败:', fileName, error);
        explanationDiv.textContent = '';
    }
}

// 设置卡片字段的编辑功能（直接编辑模式）
function setupCardEditing(wordDiv, chineseNameDiv, explanationDiv, fileName, initialWord) {
    // 设置单词字段的直接编辑
    setupInlineEditing(wordDiv, fileName, 'word', async (newValue) => {
        const cardData = await loadCardDataFromSupabase(fileName);
        await saveCardDataToSupabase(fileName, newValue, cardData.chineseName, cardData.explanation);
    });
    
    // 设置中文名字段的直接编辑
    setupInlineEditing(chineseNameDiv, fileName, 'chineseName', async (newValue) => {
        const cardData = await loadCardDataFromSupabase(fileName);
        await saveCardDataToSupabase(fileName, cardData.word, newValue, cardData.explanation);
    });
    
    // 设置解释字段的直接编辑
    setupInlineEditing(explanationDiv, fileName, 'explanation', async (newValue) => {
        const cardData = await loadCardDataFromSupabase(fileName);
        await saveCardDataToSupabase(fileName, cardData.word, cardData.chineseName, newValue);
    });
}

// 设置解释字段的编辑功能（保留旧函数以兼容性）
function setupExplanationEditing(explanationDiv, fileName, word) {
    // 点击显示弹窗编辑
    explanationDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const currentExplanation = explanationDiv.textContent === '点击添加解释...' ? '' : explanationDiv.textContent;
        
        explanationModal.show(word, fileName, '', currentExplanation, async (newWord, newChineseName, newExplanation) => {
            await saveCardDataToSupabase(fileName, newWord, newChineseName, newExplanation);
            explanationDiv.textContent = newExplanation;
            showTemporaryMessage('解释已更新', 'success');
        }, false);
    });
}

// 解释输入弹窗管理
class ExplanationModal {
    constructor() {
        this.modal = document.getElementById('explanationModal');
        this.modalTitle = document.getElementById('modalTitle');
        this.wordInput = document.getElementById('wordInput');
        this.chineseNameInput = document.getElementById('chineseNameInput');
        this.textarea = document.getElementById('explanationTextarea');
        this.confirmBtn = document.getElementById('modalConfirmBtn');
        this.cancelBtn = document.getElementById('modalCancelBtn');
        this.closeBtn = document.getElementById('modalCloseBtn');
        
        this.currentFileName = '';
        this.onConfirmCallback = null;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // 确定按钮
        this.confirmBtn.addEventListener('click', () => {
            this.handleConfirm();
        });
        
        // 取消按钮
        this.cancelBtn.addEventListener('click', () => {
            this.hide();
        });
        
        // 关闭按钮
        this.closeBtn.addEventListener('click', () => {
            this.hide();
        });
        
        // 点击遮罩关闭
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });
        
        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('show')) {
                this.hide();
            }
        });
        
        // Ctrl+Enter 快速确定
        this.textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                this.handleConfirm();
            }
        });
        
        // 為所有輸入框添加純文字貼上功能
        [this.wordInput, this.chineseNameInput, this.textarea].forEach(input => {
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                
                // 獲取剪貼簿的純文字內容
                const text = (e.clipboardData || window.clipboardData).getData('text/plain');
                
                // 獲取當前光標位置
                const start = input.selectionStart;
                const end = input.selectionEnd;
                
                // 替換選中的文字或在光標位置插入文字
                const value = input.value;
                input.value = value.slice(0, start) + text + value.slice(end);
                
                // 將光標移到插入文字的末尾
                const newPosition = start + text.length;
                input.setSelectionRange(newPosition, newPosition);
            });
        });
    }
    
    show(word, fileName, chineseName = '', explanation = '', onConfirm = null, isNewCard = true) {
        this.currentFileName = fileName;
        this.onConfirmCallback = onConfirm;
        
        // 设置标题
        if (isNewCard) {
            this.modalTitle.textContent = '創建單詞卡';
        } else {
            this.modalTitle.textContent = '編輯單詞卡';
        }
        
        this.wordInput.value = word;
        this.chineseNameInput.value = chineseName;
        this.textarea.value = explanation;
        
        this.modal.classList.add('show');
        
        // 延迟聚焦，确保动画完成
        setTimeout(() => {
            this.wordInput.focus();
            this.wordInput.select();
        }, 300);
        
        console.log('显示卡片编辑弹窗:', word, fileName, isNewCard ? '(新建)' : '(编辑)');
    }
    
    hide() {
        this.modal.classList.remove('show');
        this.wordInput.value = '';
        this.chineseNameInput.value = '';
        this.textarea.value = '';
        this.currentFileName = '';
        this.onConfirmCallback = null;
        
        console.log('隐藏卡片编辑弹窗');
    }
    
    async handleConfirm() {
        const word = this.wordInput.value.trim();
        const chineseName = this.chineseNameInput.value.trim();
        const explanation = this.textarea.value.trim();
        
        if (!word) {
            showTemporaryMessage('单词不能为空', 'error');
            this.wordInput.focus();
            return;
        }
        
        try {
            this.confirmBtn.disabled = true;
            this.confirmBtn.textContent = '保存中...';
            
            if (this.onConfirmCallback) {
                await this.onConfirmCallback(word, chineseName, explanation);
            }
            
            showTemporaryMessage('卡片已保存', 'success');
            this.hide();
            
        } catch (error) {
            console.error('保存卡片失败:', error);
            showTemporaryMessage('保存失败: ' + error.message, 'error');
        } finally {
            this.confirmBtn.disabled = false;
            this.confirmBtn.textContent = '確定';
        }
    }
}

// 删除确认弹窗类
class DeleteConfirmModal {
    constructor() {
        this.modal = document.getElementById('deleteConfirmModal');
        this.message = document.getElementById('deleteConfirmMessage');
        this.confirmBtn = document.getElementById('deleteConfirmBtn');
        this.cancelBtn = document.getElementById('deleteCancelBtn');
        this.closeBtn = document.getElementById('deleteModalCloseBtn');
        
        this.onConfirmCallback = null;
        
        // 绑定事件
        this.cancelBtn.addEventListener('click', () => this.hide());
        this.closeBtn.addEventListener('click', () => this.hide());
        this.confirmBtn.addEventListener('click', () => this.handleConfirm());
        
        // 点击背景关闭
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });
        
        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'flex') {
                this.hide();
            }
        });
    }
    
    show(message, onConfirm) {
        this.message.textContent = message || '確定要刪除這張單詞卡嗎？此操作無法撤銷。';
        this.onConfirmCallback = onConfirm;
        this.modal.style.display = 'flex';
        this.confirmBtn.focus();
    }
    
    hide() {
        this.modal.style.display = 'none';
        this.onConfirmCallback = null;
    }
    
    handleConfirm() {
        if (this.onConfirmCallback) {
            this.onConfirmCallback();
        }
        this.hide();
    }
}

// 创建全局弹窗实例
const explanationModal = new ExplanationModal();
const deleteConfirmModal = new DeleteConfirmModal();

// 群組管理相關變數
let groups = []; // 存儲所有群組
let cardGroups = {}; // 存儲每張卡片的群組分配 {fileName: groupId}

// 46種預設顏色，按組分類
const COLOR_GROUPS = [
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

// 展平的顏色陣列（向後兼容）
const GROUP_COLORS = COLOR_GROUPS.flat();

// 當前編輯的群組
let currentEditingGroup = null;

// 群組管理功能
class GroupManager {
    constructor() {
        this.showNoGroupCards = true; // 預設顯示無群組卡片
        this.initialized = false;
        
        // 確保DOM已準備好再初始化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initialize();
            });
        } else {
            this.initialize();
        }
    }

    initialize() {
        if (this.initialized) return;
        
        try {
            this.initializeEventListeners();
            this.loadGroupsFromCloud();
            this.initialized = true;
            console.log('GroupManager initialized successfully');
            
            // 發送全局事件通知GroupManager已準備好
            window.dispatchEvent(new CustomEvent('groupManagerReady'));
            
        } catch (error) {
            console.error('GroupManager initialization failed:', error);
            // 重試初始化
            setTimeout(() => {
                if (!this.initialized) {
                    this.initialize();
                }
            }, 1000);
        }
    }

    // 初始化事件監聽器
    initializeEventListeners() {
        // 新增群組按鈕
        const addGroupBtn = document.getElementById('addGroupBtn');
        if (addGroupBtn) {
            console.log('Adding event listener to addGroupBtn');
            addGroupBtn.addEventListener('click', () => {
                console.log('Add group button clicked');
                this.showGroupEditModal();
            });
        } else {
            console.error('addGroupBtn element not found');
        }

        // 無群組按鈕
        const noGroupBtn = document.getElementById('noGroupBtn');
        if (noGroupBtn) {
            noGroupBtn.addEventListener('click', () => {
                this.toggleNoGroupVisibility();
            });
        } else {
            console.error('noGroupBtn element not found');
        }

        // 群組編輯彈窗事件
        this.safeAddEventListener('groupConfirmBtn', 'click', () => {
            this.handleGroupSave();
        });

        this.safeAddEventListener('groupCancelBtn', 'click', () => {
            this.hideGroupEditModal();
        });

        this.safeAddEventListener('groupModalCloseBtn', 'click', () => {
            this.hideGroupEditModal();
        });

        // 刪除群組事件
        this.safeAddEventListener('groupDeleteBtn', 'click', () => {
            this.showDeleteGroupModal();
        });

        // 刪除群組確認彈窗事件
        this.safeAddEventListener('deleteGroupConfirmBtn', 'click', () => {
            this.handleGroupDelete();
        });
        
        this.safeAddEventListener('deleteGroupCancelBtn', 'click', () => {
            this.hideDeleteGroupModal();
        });
        
        this.safeAddEventListener('deleteGroupModalCloseBtn', 'click', () => {
            this.hideDeleteGroupModal();
        });

        // 群組選擇彈窗事件
        this.safeAddEventListener('groupSelectCancelBtn', 'click', () => {
            this.hideGroupSelectModal();
        });

        this.safeAddEventListener('groupSelectModalCloseBtn', 'click', () => {
            this.hideGroupSelectModal();
        });

        // ESC鍵關閉彈窗
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideGroupEditModal();
                this.hideGroupSelectModal();
            }
        });
    }

    // 安全添加事件監聽器的輔助方法
    safeAddEventListener(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Element with id '${elementId}' not found, skipping event listener`);
        }
    }

    // 創建新群組
    createGroup(name, color) {
        const group = {
            id: 'group_' + Date.now(),
            name: name,
            color: color,
            visible: true,
            createdAt: new Date().toISOString()
        };
        
        groups.push(group);
        this.renderGroups();
        this.saveGroupsToCloud();
        return group;
    }

    // 更新群組
    updateGroup(groupId, name, color) {
        const group = groups.find(g => g.id === groupId);
        if (group) {
            group.name = name;
            group.color = color;
            group.updatedAt = new Date().toISOString();
            this.renderGroups();
            this.updateCardGroupIndicators(); // 更新卡片群組指示器
            this.saveGroupsToCloud();
        }
    }

    // 刪除群組
    deleteGroup(groupId) {
        groups = groups.filter(g => g.id !== groupId);
        // 清除該群組的卡片分配
        Object.keys(cardGroups).forEach(fileName => {
            if (cardGroups[fileName] === groupId) {
                delete cardGroups[fileName];
            }
        });
        this.renderGroups();
        this.updateCardGroupIndicators();
        this.saveGroupsToCloud();
        this.saveCardGroupsToCloud();
    }

    // 切換群組可見性
    toggleGroupVisibility(groupId) {
        const group = groups.find(g => g.id === groupId);
        if (group) {
            group.visible = !group.visible;
            this.renderGroups();
            this.filterCardsByGroups();
            this.saveGroupsToCloud();
        }
    }

    // 切換無群組卡片可見性
    toggleNoGroupVisibility() {
        this.showNoGroupCards = !this.showNoGroupCards;
        this.updateNoGroupButton();
        this.filterCardsByGroups();
    }

    // 更新無群組按鈕狀態
    updateNoGroupButton() {
        const noGroupBtn = document.getElementById('noGroupBtn');
        if (noGroupBtn) {
            if (this.showNoGroupCards) {
                noGroupBtn.classList.remove('inactive');
            } else {
                noGroupBtn.classList.add('inactive');
            }
        }
    }

    // 渲染群組按鈕
    renderGroups() {
        const groupsList = document.getElementById('groupsList');
        if (!groupsList) {
            console.error('groupsList element not found');
            return;
        }
        
        // 保留新增群組按鈕和無群組按鈕，只移除其他群組按鈕
        const existingGroupButtons = groupsList.querySelectorAll('.group-button');
        existingGroupButtons.forEach(btn => btn.remove());
        
        // 確保無群組按鈕狀態正確
        this.updateNoGroupButton();

        groups.forEach(group => {
            const groupButton = document.createElement('button');
            groupButton.className = `group-button ${!group.visible ? 'inactive' : ''}`;
            groupButton.style.backgroundColor = group.color;
            
            // 截斷群組名稱，只顯示前5個字
            const truncatedName = group.name.length > 5 ? group.name.substring(0, 5) : group.name;
            groupButton.textContent = truncatedName;
            groupButton.dataset.groupId = group.id;
            
            // 如果名稱被截斷，添加懸浮視窗功能
            if (group.name.length > 5) {
                groupButton.dataset.fullName = group.name;
                groupButton.dataset.groupColor = group.color;
                
                // 滑鼠懸浮事件
                groupButton.addEventListener('mouseenter', function(e) {
                    // 先清除任何現有的懸浮視窗
                    this.clearTooltip();
                    
                    // 創建懸浮視窗
                    const tooltip = document.createElement('div');
                    tooltip.className = 'group-tooltip';
                    tooltip.textContent = this.dataset.fullName;
                    tooltip.style.backgroundColor = this.dataset.groupColor;
                    
                    // 設置箭頭顏色與背景色一致
                    tooltip.style.setProperty('--tooltip-bg-color', this.dataset.groupColor);
                    
                    // 設置懸浮視窗位置
                    const rect = this.getBoundingClientRect();
                    tooltip.style.left = rect.left + 'px';
                    tooltip.style.top = (rect.bottom + 5) + 'px';
                    
                    // 添加到頁面
                    document.body.appendChild(tooltip);
                    this.dataset.tooltipId = 'tooltip-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                    tooltip.id = this.dataset.tooltipId;
                    
                    // 儲存tooltip引用以便清理
                    this.tooltipElement = tooltip;
                });
                
                groupButton.addEventListener('mouseleave', function() {
                    // 使用延遲清理，確保在GitHub Pages環境中正常工作
                    setTimeout(() => {
                        this.clearTooltip();
                    }, 50);
                });
                
                // 添加額外的清理機制：當滑鼠離開父容器時也清理
                groupButton.addEventListener('mouseleave', function(e) {
                    // 檢查滑鼠是否真的離開了按鈕區域
                    const rect = this.getBoundingClientRect();
                    const mouseX = e.clientX;
                    const mouseY = e.clientY;
                    
                    if (mouseX < rect.left || mouseX > rect.right || 
                        mouseY < rect.top || mouseY > rect.bottom) {
                        // 滑鼠確實離開了按鈕，清理tooltip
                        setTimeout(() => {
                            clearAllGroupTooltips();
                        }, 100);
                    }
                });
                
                // 添加清理方法
                groupButton.clearTooltip = function() {
                    // 方法1: 通過ID清理
                    if (this.dataset.tooltipId) {
                        const tooltip = document.getElementById(this.dataset.tooltipId);
                        if (tooltip && tooltip.parentNode) {
                            tooltip.parentNode.removeChild(tooltip);
                        }
                        delete this.dataset.tooltipId;
                    }
                    
                    // 方法2: 通過引用清理
                    if (this.tooltipElement && this.tooltipElement.parentNode) {
                        this.tooltipElement.parentNode.removeChild(this.tooltipElement);
                        this.tooltipElement = null;
                    }
                    
                    // 方法3: 清理所有可能的懸浮視窗
                    const allTooltips = document.querySelectorAll('.group-tooltip');
                    allTooltips.forEach(tooltip => {
                        if (tooltip.parentNode) {
                            tooltip.parentNode.removeChild(tooltip);
                        }
                    });
                };
            }

            // 添加編輯圖標
            const editIcon = document.createElement('div');
            editIcon.className = 'edit-icon';
            editIcon.textContent = '✏';
            groupButton.appendChild(editIcon);

            // 群組按鈕點擊事件（切換可見性）
            groupButton.addEventListener('click', (e) => {
                if (!e.target.classList.contains('edit-icon')) {
                    // 立即清理所有懸停視窗
                    clearAllGroupTooltips();
                    
                    // 阻止事件冒泡，避免干擾其他事件處理
                    e.stopPropagation();
                    e.preventDefault();
                    
                    // 使用短暫延遲確保DOM更新完成，並在GitHub Pages環境中正常工作
                    setTimeout(() => {
                        this.toggleGroupVisibility(group.id);
                    }, 100);
                }
            });

            // 編輯圖標點擊事件
            editIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showGroupEditModal(group);
            });

            groupsList.appendChild(groupButton);
        });
    }

    // 顯示群組編輯彈窗
    showGroupEditModal(group = null) {
        currentEditingGroup = group;
        const modal = document.getElementById('groupEditModal');
        const title = document.getElementById('groupModalTitle');
        const nameInput = document.getElementById('groupNameInput');
        const deleteBtn = document.getElementById('groupDeleteBtn');

        if (!modal || !title || !nameInput || !deleteBtn) {
            console.error('Group edit modal elements not found');
            return;
        }

        if (group) {
            title.textContent = '編輯群組';
            nameInput.value = group.name;
            deleteBtn.style.display = 'block'; // 編輯時顯示刪除按鈕
        } else {
            title.textContent = '新增群組';
            nameInput.value = '';
            deleteBtn.style.display = 'none'; // 新增時隱藏刪除按鈕
        }

        this.renderColorPicker(group ? group.color : GROUP_COLORS[0]);
        modal.classList.add('show');
        nameInput.focus();
    }

    // 隱藏群組編輯彈窗
    hideGroupEditModal() {
        const modal = document.getElementById('groupEditModal');
        if (modal) {
            modal.classList.remove('show');
        }
        currentEditingGroup = null;
    }

    // 顯示刪除群組確認彈窗
    showDeleteGroupModal() {
        if (!currentEditingGroup) return;
        
        const modal = document.getElementById('deleteGroupModal');
        const groupNameSpan = document.getElementById('deleteGroupName');
        
        if (!modal || !groupNameSpan) {
            console.error('Delete group modal elements not found');
            return;
        }
        
        groupNameSpan.textContent = currentEditingGroup.name;
        modal.classList.add('show');
    }

    // 隱藏刪除群組確認彈窗
    hideDeleteGroupModal() {
        const modal = document.getElementById('deleteGroupModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    // 渲染顏色選擇器
    renderColorPicker(selectedColor) {
        const colorPicker = document.getElementById('colorPicker');
        if (!colorPicker) {
            console.error('colorPicker element not found');
            return;
        }
        colorPicker.innerHTML = '';

        COLOR_GROUPS.forEach((colorGroup, groupIndex) => {
            // 創建顏色組容器
            const groupContainer = document.createElement('div');
            groupContainer.className = 'color-group';
            
            colorGroup.forEach(color => {
                const colorOption = document.createElement('div');
                colorOption.className = `color-option ${color === selectedColor ? 'selected' : ''}`;
                colorOption.style.backgroundColor = color;
                colorOption.dataset.color = color;

                colorOption.addEventListener('click', () => {
                    document.querySelectorAll('.color-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    colorOption.classList.add('selected');
                });

                groupContainer.appendChild(colorOption);
            });
            
            colorPicker.appendChild(groupContainer);
        });
    }

    // 處理群組保存
    handleGroupSave() {
        const name = document.getElementById('groupNameInput').value.trim();
        const selectedColor = document.querySelector('.color-option.selected')?.dataset.color;

        if (!name) {
            showTemporaryMessage('請輸入群組名稱', 'error');
            return;
        }

        if (currentEditingGroup) {
            this.updateGroup(currentEditingGroup.id, name, selectedColor);
            showTemporaryMessage('群組已更新', 'success');
        } else {
            this.createGroup(name, selectedColor);
            showTemporaryMessage('群組已創建', 'success');
        }

        this.hideGroupEditModal();
    }

    // 處理群組刪除
    async handleGroupDelete() {
        if (!currentEditingGroup) return;
        
        try {
            const groupId = currentEditingGroup.id;
            const groupName = currentEditingGroup.name;
            
            // 從群組列表中移除
            groups = groups.filter(g => g.id !== groupId);
            
            // 清除所有分配到此群組的卡片
            const cardsToUpdate = [];
            for (const [fileName, assignedGroupId] of Object.entries(cardGroups)) {
                if (assignedGroupId === groupId) {
                    delete cardGroups[fileName];
                    cardsToUpdate.push(fileName);
                }
            }
            
            // 保存到雲端
            await this.saveGroupsToCloud();
            await this.saveCardGroupsToCloud();
            
            // 更新UI
            this.renderGroups();
            this.updateCardGroupIndicators();
            this.filterCardsByGroups();
            
            // 隱藏所有彈窗
            this.hideDeleteGroupModal();
            this.hideGroupEditModal();
            
            showTemporaryMessage(`群組 "${groupName}" 已刪除`, 'success');
            console.log(`群組 "${groupName}" 已刪除，${cardsToUpdate.length} 張卡片已取消群組分配`);
            
        } catch (error) {
            console.error('刪除群組失敗:', error);
            showTemporaryMessage('刪除群組失敗，請稍後重試', 'error');
        }
    }

    // 根據群組過濾卡片
    filterCardsByGroups() {
        const flashcards = document.querySelectorAll('.flashcard');
        
        flashcards.forEach(card => {
            const fileName = card.dataset.fileName;
            const cardGroupId = cardGroups[fileName];
            
            if (!cardGroupId) {
                // 沒有群組的卡片根據無群組按鈕狀態顯示
                card.style.display = this.showNoGroupCards ? 'flex' : 'none';
            } else {
                const group = groups.find(g => g.id === cardGroupId);
                if (group && group.visible) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            }
        });
    }

    // 更新卡片群組指示器
    updateCardGroupIndicators() {
        const flashcards = document.querySelectorAll('.flashcard');
        
        flashcards.forEach(card => {
            const fileName = card.dataset.fileName;
            this.updateSingleCardGroupIndicator(card, fileName);
        });
    }

    // 更新單個卡片的群組指示器
    updateSingleCardGroupIndicator(card, fileName) {
        const cardGroupId = cardGroups[fileName];
        
        // 移除現有的群組指示器
        const existingIndicator = card.querySelector('.group-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // 創建可點擊的群組指示器
        const indicator = document.createElement('div');
        indicator.className = 'group-indicator clickable';
        indicator.title = '點擊設定群組';
        
        // 添加點擊事件
        indicator.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showGroupSelectModal(fileName);
        });
        
        if (cardGroupId) {
            const group = groups.find(g => g.id === cardGroupId);
            if (group) {
                indicator.style.backgroundColor = group.color;
                
                // 截斷群組名稱，只顯示前5個字
                const truncatedName = group.name.length > 5 ? group.name.substring(0, 5) : group.name;
                indicator.textContent = truncatedName;
                indicator.classList.remove('no-group');
                
                // 如果名稱被截斷，添加懸浮展開功能
                if (group.name.length > 5) {
                    indicator.dataset.fullName = group.name;
                    indicator.dataset.truncatedName = truncatedName;
                    
                    // 滑鼠懸浮事件
                    indicator.addEventListener('mouseenter', function() {
                        this.textContent = this.dataset.fullName;
                    });
                    
                    indicator.addEventListener('mouseleave', function() {
                        this.textContent = this.dataset.truncatedName;
                    });
                }
            } else {
                // 群組不存在時顯示灰色圓圈
                indicator.classList.add('no-group');
                indicator.style.backgroundColor = '#666666';
                indicator.textContent = '';
            }
        } else {
            // 沒有群組時顯示灰色圓圈
            indicator.classList.add('no-group');
            indicator.style.backgroundColor = '#666666';
            indicator.textContent = '';
        }
        
        card.appendChild(indicator);
    }

    // 顯示群組選擇彈窗
    showGroupSelectModal(fileName) {
        const modal = document.getElementById('groupSelectModal');
        const groupsList = document.getElementById('groupSelectList');

        if (!modal || !groupsList) {
            console.error('Group select modal elements not found');
            return;
        }
        
        groupsList.innerHTML = '';
        
        // 添加"無群組"選項
        const noGroupItem = document.createElement('div');
        noGroupItem.className = `group-select-item ${!cardGroups[fileName] ? 'selected' : ''}`;
        noGroupItem.innerHTML = `
            <div class="group-color" style="background-color: #666;"></div>
            <div class="group-name">無群組</div>
        `;
        noGroupItem.addEventListener('click', () => {
            this.assignCardToGroup(fileName, null);
            this.hideGroupSelectModal();
        });
        groupsList.appendChild(noGroupItem);

        // 添加群組選項
        groups.forEach(group => {
            const groupItem = document.createElement('div');
            groupItem.className = `group-select-item ${cardGroups[fileName] === group.id ? 'selected' : ''}`;
            groupItem.innerHTML = `
                <div class="group-color" style="background-color: ${group.color};"></div>
                <div class="group-name">${group.name}</div>
            `;
            groupItem.addEventListener('click', () => {
                this.assignCardToGroup(fileName, group.id);
                this.hideGroupSelectModal();
            });
            groupsList.appendChild(groupItem);
        });

        modal.classList.add('show');
    }

    // 隱藏群組選擇彈窗
    hideGroupSelectModal() {
        const modal = document.getElementById('groupSelectModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    // 分配卡片到群組
    assignCardToGroup(fileName, groupId) {
        if (groupId) {
            cardGroups[fileName] = groupId;
        } else {
            delete cardGroups[fileName];
        }
        
        this.updateCardGroupIndicators();
        this.saveCardGroupsToCloud();
        showTemporaryMessage('群組分配已更新', 'success');
    }

    // 保存群組到雲端
    async saveGroupsToCloud() {
        try {
            await saveCardDataToSupabase('__GROUPS_DATA__', 'groups', '', JSON.stringify(groups));
            console.log('群組數據已保存到雲端');
        } catch (error) {
            console.error('保存群組數據失敗:', error);
        }
    }

    // 保存卡片群組分配到雲端
    async saveCardGroupsToCloud() {
        try {
            await saveCardDataToSupabase('__CARD_GROUPS_DATA__', 'card_groups', '', JSON.stringify(cardGroups));
            console.log('卡片群組分配已保存到雲端');
        } catch (error) {
            console.error('保存卡片群組分配失敗:', error);
        }
    }

    // 從雲端載入群組
    async loadGroupsFromCloud() {
        try {
            const groupsData = await loadCardDataFromSupabase('__GROUPS_DATA__');
            if (groupsData.explanation) {
                groups = JSON.parse(groupsData.explanation);
                this.renderGroups();
            }

            const cardGroupsData = await loadCardDataFromSupabase('__CARD_GROUPS_DATA__');
            if (cardGroupsData.explanation) {
                cardGroups = JSON.parse(cardGroupsData.explanation);
            }

            console.log('群組數據已從雲端載入');
        } catch (error) {
            console.error('從雲端載入群組數據失敗:', error);
        }
    }
}

// 創建群組管理器實例
let groupManager;

// 翻译解释到中文并显示悬浮窗
async function translateExplanationToChinese(explanationDiv, translateButton, buttonElement) {
    const explanation = explanationDiv.textContent.trim();
    if (!explanation) {
        showTemporaryMessage('解釋內容為空！', 'error');
        return;
    }
    
    // 显示加载状态
    translateButton.classList.add('loading');
    translateButton.textContent = '';
    translateButton.disabled = true;
    
    try {
        console.log('开始翻译解释:', explanation);
        
        // 使用免费的翻译API (MyMemory Translated)
        const response = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(explanation)}&langpair=en|zh-CN`
        );
        
        if (!response.ok) {
            throw new Error('翻译服务请求失败');
        }
        
        const data = await response.json();
        console.log('翻译响应:', data);
        
        if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
            const translation = data.responseData.translatedText;
            
            // 显示悬浮窗
            showTranslationTooltip(buttonElement, translation);
            
        } else {
            throw new Error('翻译服务返回无效结果');
        }
        
    } catch (error) {
        console.error('翻译失败:', error);
        showTemporaryMessage('翻譯失敗：' + error.message, 'error');
    } finally {
        // 恢复按钮状态
        translateButton.classList.remove('loading');
        translateButton.textContent = '译';
        translateButton.disabled = false;
    }
}

// 显示翻译悬浮窗
function showTranslationTooltip(buttonElement, translation) {
    // 移除现有的悬浮窗
    const existingTooltip = document.querySelector('.translation-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    // 创建悬浮窗
    const tooltip = document.createElement('div');
    tooltip.className = 'translation-tooltip';
    tooltip.textContent = translation;
    
    // 添加到页面
    document.body.appendChild(tooltip);
    
    // 计算位置（显示在按钮旁边）
    const buttonRect = buttonElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // 获取单词卡元素
    const flashcard = buttonElement.closest('.flashcard');
    const cardRect = flashcard.getBoundingClientRect();
    
    let left, top;
    
    // 优先显示在卡片右侧
    if (window.innerWidth - cardRect.right > tooltipRect.width + 20) {
        left = cardRect.right + 10;
        top = buttonRect.top + window.scrollY;
    } 
    // 如果右侧空间不够，显示在左侧
    else if (cardRect.left > tooltipRect.width + 20) {
        left = cardRect.left - tooltipRect.width - 10;
        top = buttonRect.top + window.scrollY;
    }
    // 如果左右都不够，显示在卡片上方
    else {
        left = cardRect.left + (cardRect.width - tooltipRect.width) / 2;
        top = cardRect.top + window.scrollY - tooltipRect.height - 10;
    }
    
    // 确保不超出视窗边界
    left = Math.max(10, Math.min(left, window.innerWidth - tooltipRect.width - 10));
    top = Math.max(10, top);
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    
    // 添加点击其他地方关闭的功能
    const closeTooltip = (e) => {
        if (!tooltip.contains(e.target)) {
            tooltip.remove();
            document.removeEventListener('click', closeTooltip);
        }
    };
    
    // 延迟添加点击监听器，避免立即触发
    setTimeout(() => {
        document.addEventListener('click', closeTooltip);
    }, 100);
    
    console.log('悬浮窗已显示:', translation);
}

// 翻译单词到中文
async function translateWordToChinese(wordDiv, chineseNameDiv, translateButton, fileName) {
    const word = wordDiv.textContent.trim();
    if (!word) {
        showTemporaryMessage('請先輸入單詞！', 'error');
        return;
    }
    
    // 显示加载状态
    translateButton.classList.add('loading');
    translateButton.textContent = '';
    translateButton.disabled = true;
    
    try {
        console.log('开始翻译单词:', word);
        
        // 使用免费的翻译API (MyMemory Translated)
        const response = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh-CN`
        );
        
        if (!response.ok) {
            throw new Error('翻译服务请求失败');
        }
        
        const data = await response.json();
        console.log('翻译响应:', data);
        
        if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
            const translation = data.responseData.translatedText;
            
            // 更新中文名字段
            chineseNameDiv.textContent = translation;
            
            // 保存到数据库
            try {
                const currentWord = wordDiv.textContent;
                const currentExplanation = chineseNameDiv.parentElement.parentElement.querySelector('.explanation-div').textContent || '';
                await saveCardDataToSupabase(fileName, currentWord, translation, currentExplanation);
                console.log('翻译结果已保存到数据库');
            } catch (saveError) {
                console.warn('保存翻译结果失败:', saveError);
            }
            
            showTemporaryMessage(`翻譯成功：${translation}`, 'success');
        } else {
            throw new Error('翻译服务返回无效结果');
        }
        
    } catch (error) {
        console.error('翻译失败:', error);
        showTemporaryMessage('翻譯失敗：' + error.message, 'error');
    } finally {
        // 恢复按钮状态
        translateButton.classList.remove('loading');
        translateButton.textContent = '译';
        translateButton.disabled = false;
    }
}

// 验证图片是否可以访问
async function verifyImageAccessible(imageUrl, maxRetries = 8) {
    console.log('验证图片可访问性:', imageUrl);
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            // 添加时间戳避免缓存问题
            const testUrl = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 'test=' + Date.now();
            const response = await fetch(testUrl, { method: 'HEAD' });
            if (response.ok) {
                console.log('图片验证成功，尝试次数:', i + 1);
                // 额外等待一下确保CDN完全同步
                if (i > 0) {
                    console.log('等待CDN同步...');
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                return true;
            }
            console.log(`图片验证失败，HTTP状态: ${response.status}, 尝试 ${i + 1}/${maxRetries}`);
        } catch (error) {
            console.log(`图片验证失败，尝试 ${i + 1}/${maxRetries}:`, error.message);
        }
        
        // 等待一段时间后重试，使用更长的等待时间
        if (i < maxRetries - 1) {
            const waitTime = Math.min(2000 * (i + 1), 8000); // 最多等待8秒
            console.log(`等待 ${waitTime}ms 后重试...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    
    console.warn('图片验证失败，但继续创建卡片');
    return false;
}

// 设置字段的直接编辑功能
function setupInlineEditing(element, fileName, fieldType, onSave) {
    let isEditing = false;
    let originalContent = '';
    
    // 获取占位符文本
    const getPlaceholder = () => {
        switch(fieldType) {
            case 'word': return '点击编辑单词...';
            case 'chineseName': return '点击添加中文名...';
            case 'explanation': return '点击添加解释...';
            default: return '点击编辑...';
        }
    };
    
    // 点击进入编辑模式
    element.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // 只在编辑模式下允许编辑
        if (!document.body.classList.contains('edit-mode')) {
            return;
        }
        
        if (!isEditing) {
            startEditing();
        }
    });
    
    // 键盘事件处理
    element.addEventListener('keydown', async (e) => {
        if (isEditing) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                await saveEditing();
            } else if (e.key === 'Escape') {
                cancelEditing();
            }
        }
    });
    
    // 貼上事件處理 - 只保留純文字
    element.addEventListener('paste', (e) => {
        if (isEditing) {
            e.preventDefault();
            
            // 獲取剪貼簿的純文字內容
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            
            // 插入純文字到當前光標位置
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
                
                // 將光標移到插入文字的末尾
                range.setStartAfter(range.endContainer);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    });
    
    // 失去焦点时保存
    element.addEventListener('blur', async () => {
        if (isEditing) {
            await saveEditing();
        }
    });
    
    function startEditing() {
        isEditing = true;
        
        // 对于解释字段，保存HTML内容以保持格式
        if (fieldType === 'explanation') {
            originalContent = element.innerHTML;
        } else {
            originalContent = element.textContent;
        }
        
        // 如果是占位符文本，清空
        const displayText = element.textContent;
        if (displayText === getPlaceholder()) {
            originalContent = '';
            if (fieldType === 'explanation') {
                element.innerHTML = '';
            } else {
                element.textContent = '';
            }
        }
        
        element.contentEditable = true;
        element.classList.add('editing');
        element.focus();
        
        // 选中所有文本
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        console.log('开始编辑字段:', fieldType, fileName);
    }
    
    async function saveEditing() {
        if (!isEditing) return;
        
        let newContent;
        
        // 对于解释字段，保存HTML格式以保持换行
        if (fieldType === 'explanation') {
            newContent = element.innerHTML.trim();
            // 清理不必要的HTML标签，只保留换行
            newContent = newContent.replace(/<div>/g, '<br>').replace(/<\/div>/g, '').replace(/<br\s*\/?>/g, '\n');
        } else {
            newContent = element.textContent.trim();
        }
        
        // 单词字段不能为空
        if (fieldType === 'word' && !newContent) {
            showTemporaryMessage('单词不能为空', 'error');
            element.focus();
            return;
        }
        
        try {
            // 保存到云端
            await onSave(newContent);
            
            // 更新UI状态
            element.contentEditable = false;
            element.classList.remove('editing');
            isEditing = false;
            
            // 如果是解释字段，检查翻译按钮显示
            if (fieldType === 'explanation') {
                updateExplanationTranslateButtonVisibility(element);
            }
            
            // 显示保存成功提示
            showTemporaryMessage(`${getFieldDisplayName(fieldType)}已保存`, 'success');
            
            console.log('字段保存成功:', fieldType, fileName, newContent);
            
        } catch (error) {
            console.error('保存字段失败:', error);
            
            // 恢复原内容
            if (fieldType === 'explanation') {
                element.innerHTML = originalContent;
            } else {
                element.textContent = originalContent;
            }
            element.contentEditable = false;
            element.classList.remove('editing');
            isEditing = false;
            
            showTemporaryMessage('保存失败: ' + error.message, 'error');
        }
    }
    
    function cancelEditing() {
        if (!isEditing) return;
        
        // 根据字段类型恢复内容
        if (fieldType === 'explanation') {
            element.innerHTML = originalContent;
        } else {
            element.textContent = originalContent;
        }
        element.contentEditable = false;
        element.classList.remove('editing');
        isEditing = false;
        
        console.log('取消编辑字段:', fieldType, fileName);
    }
    
    // 获取字段显示名称
    function getFieldDisplayName(type) {
        switch(type) {
            case 'word': return '单词';
            case 'chineseName': return '中文名';
            case 'explanation': return '解释';
            default: return '字段';
        }
    }
}