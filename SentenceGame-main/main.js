// Supabase 配置和初始化
const supabaseUrl = 'https://fsqjuteaoprcrdsphqpt.supabase.co'
const supabaseKey = 'sb_publishable_DIcf1pkMLybWGtAafbLABw_FZ4GQEs8'

// 初始化 Supabase 客戶端
const { createClient } = supabase
const supabaseClient = createClient(supabaseUrl, supabaseKey)

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 應用程式啟動...');

    // 獲取新的元素
    const hideAddCardCheckbox = document.getElementById('hideAddCard');
    const hideSettingsCheckbox = document.getElementById('hideSettings');
    const addCardSection = document.querySelector('.add-card-section');
    const controlSection = document.querySelector('.control-section');

    // 設置顯示功能的事件監聽器（打勾＝顯示）
    if (hideAddCardCheckbox) {
        hideAddCardCheckbox.addEventListener('change', () => {
            const isChecked = hideAddCardCheckbox.checked;
            addCardSection.classList.toggle('hidden', !isChecked);
            saveSetting('hideAddCard', isChecked);
        });
    }

    if (hideSettingsCheckbox) {
        hideSettingsCheckbox.addEventListener('change', () => {
            const isChecked = hideSettingsCheckbox.checked;
            controlSection.classList.toggle('hidden', !isChecked);
        });
    }

    const addCardButton = document.getElementById('addCard');
    const englishInput = document.getElementById('englishWord');
    const chineseInput = document.getElementById('chineseTranslation');
    const pasteInputBtn = document.getElementById('pasteInputBtn');
    const copyTranslationBtn = document.getElementById('copyTranslationBtn');
    const cardsContainer = document.getElementById('cardsContainer');
    const loadMoreTrigger = document.getElementById('loadMoreTrigger');
    const showAllBtn = document.getElementById('showAll');
    const showEnglishBtn = document.getElementById('showEnglish');
    const showChineseBtn = document.getElementById('showChinese');
    const editModeBtn = document.getElementById('editMode');
    const darkModeBtn = document.getElementById('darkMode');
    const shuffleBtn = document.getElementById('shuffleCards');
    const translateBtn = document.getElementById('translateBtn');
    const sortByTimeBtn = document.getElementById('sortByTime');
    const sortByRatingBtn = document.getElementById('sortByRating');
    const sortByAlphabetBtn = document.getElementById('sortByAlphabet');
    const newCardRating = document.getElementById('newCardRating');
    const ratingValue = document.getElementById('ratingValue');
    const playCountInput = document.getElementById('playCountInput');
    const playIntervalInput = document.getElementById('playIntervalInput');
    const ttsEngineSelect = document.getElementById('ttsEngineSelect');
    const playAllCardsBtn = document.getElementById('playAllCards');
    const wordTypeBtn = document.getElementById('wordTypeBtn');
    const sentenceTypeBtn = document.getElementById('sentenceTypeBtn');
    const filterAllBtn = document.getElementById('filterAll');
    const filterWordBtn = document.getElementById('filterWord');
    const filterSentenceBtn = document.getElementById('filterSentence');

    /** 一鍵存入字串上限（翻譯負擔） */
    let isEditMode = false;
    let editingCardIndex = -1; // 目前正在編輯的卡片在 flashcards 中的索引；-1 表示未編輯
    let currentRating = 1;
    let currentSortMode = 'time';
    
    // 播放控制變數
    let isPlaying = false;
    let playTimeout = null;
    let currentPlayIndex = 0;
    let isLoadingCards = false;
    let hasMoreCards = true;
    let cardsOffset = 0;
    const CARDS_PAGE_SIZE = 30;

    function autoResizeTextarea(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    }

    function setFieldValue(field, value) {
        field.value = value;
        autoResizeTextarea(field);
    }

    // 設置管理
    const defaultSettings = {
        playCount: '2',
        playInterval: '1',
        displayMode: 'all',
        sortMode: 'time',
        hideAddCard: 'true',
        darkMode: 'false',
        englishTts: 'rv:US English Male',
        cardType: 'word',
        typeFilter: 'all'
    };

    // 從本地存儲加載現有單字卡
    let flashcards = JSON.parse(localStorage.getItem('flashcards')) || [];

    // 設置管理函數
    async function saveSetting(key, value) {
        try {
            console.log(`保存設置: ${key} = ${value}`);
            
            // 先保存到本地存儲
            localStorage.setItem(key, value);
            console.log(`設置 ${key} 已保存到本地存儲`);
            
            // 嘗試保存到 Supabase
            const { error } = await supabaseClient
                .from('user_settings')
                .upsert({ 
                    setting_key: key, 
                    setting_value: value.toString(),
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'setting_key'
                });
            
            if (error) {
                console.error('保存設置到 Supabase 失敗:', error);
                console.error('錯誤詳情:', error.message);
                // 如果是表不存在的錯誤，提示用戶
                if (error.message.includes('relation') && error.message.includes('does not exist')) {
                    console.warn('user_settings 表不存在，請在 Supabase 中創建該表');
                }
            } else {
                console.log(`設置 ${key} 已保存到 Supabase`);
            }
        } catch (error) {
            console.error('保存設置時出錯:', error);
            // 確保至少保存到本地
            localStorage.setItem(key, value);
        }
    }

    // 快速載入本地設置
    function loadLocalSettings() {
        console.log('⚡ 快速載入本地設置...');
        
        const localSettings = {};
        Object.keys(defaultSettings).forEach(key => {
            const localValue = localStorage.getItem(key);
            if (localValue !== null) {
                localSettings[key] = localValue;
            }
        });
        
        // 立即應用本地設置
        const finalSettings = { ...defaultSettings, ...localSettings };
        console.log('應用本地設置:', finalSettings);
        applySettings(finalSettings);
        
        return localSettings;
    }

    // 同步雲端設置（背景執行）
    async function syncCloudSettings(localSettings) {
        try {
            console.log('🌐 背景同步雲端設置...');
            
            const { data, error } = await supabaseClient
                .from('user_settings')
                .select('*');
            
            if (error) {
                console.warn('從 Supabase 讀取設置失敗:', error.message);
                return false;
            }
            
            if (data && data.length > 0) {
                const cloudSettings = {};
                data.forEach(item => {
                    cloudSettings[item.setting_key] = item.setting_value;
                });
                
                console.log('雲端設置:', cloudSettings);
                
                // 檢查是否有差異
                let hasChanges = false;
                Object.keys(cloudSettings).forEach(key => {
                    if (cloudSettings[key] !== localSettings[key]) {
                        hasChanges = true;
                    }
                });
                
                if (hasChanges) {
                    console.log('🔄 發現雲端設置差異，更新本地設置');
                    const finalSettings = { ...defaultSettings, ...localSettings, ...cloudSettings };
                    applySettings(finalSettings);
                    
                    // 同步到本地存儲
                    Object.keys(cloudSettings).forEach(key => {
                        localStorage.setItem(key, cloudSettings[key]);
                    });
                } else {
                    console.log('✅ 雲端設置與本地一致');
                }
                
                return true;
            } else {
                console.log('Supabase 中沒有設置數據');
                return false;
            }
        } catch (error) {
            console.error('同步雲端設置失敗:', error);
            return false;
        }
    }

    function applySettings(settings) {
        // 應用播放次數
        if (settings.playCount) {
            playCountInput.value = settings.playCount;
        }
        
        // 應用播放間隔
        if (settings.playInterval) {
            playIntervalInput.value = settings.playInterval;
        }

        if (settings.englishTts && ttsEngineSelect) {
            const ok = [...ttsEngineSelect.options].some((o) => o.value === settings.englishTts);
            if (ok) {
                ttsEngineSelect.value = settings.englishTts;
            }
        }

        // 應用顯示模式
        if (settings.displayMode) {
            setDisplayMode(settings.displayMode, true); // skipSave = true
        }
        
        // 應用排序模式
        if (settings.sortMode) {
            setSortMode(settings.sortMode, true); // skipSave = true
        }

        // 新增卡片類型 / type filter
        if (settings.cardType === 'word' || settings.cardType === 'sentence') {
            currentCardType = settings.cardType;
            wordTypeBtn.classList.toggle('active', settings.cardType === 'word');
            sentenceTypeBtn.classList.toggle('active', settings.cardType === 'sentence');
        }

        if (settings.typeFilter === 'word' || settings.typeFilter === 'sentence' || settings.typeFilter === 'all') {
            setCardTypeFilter(settings.typeFilter, true); // skipSave = true
        }
        
        // 應用顯示設置（打勾＝顯示）
        if (settings.hideAddCard === 'true') {
            hideAddCardCheckbox.checked = true;
            addCardSection.classList.remove('hidden');
        } else {
            hideAddCardCheckbox.checked = false;
            addCardSection.classList.add('hidden');
        }
        
        // hideSettings 為臨時 UI 狀態，不從本地/雲端回讀；每次進站預設隱藏
        hideSettingsCheckbox.checked = false;
        controlSection.classList.add('hidden');
        
        // 應用夜間模式
        const shouldBeDarkMode = settings.darkMode === 'true';
        
        if (shouldBeDarkMode !== isDarkMode) {
            // 直接設置狀態，不使用 toggle
            isDarkMode = shouldBeDarkMode;
            
            if (isDarkMode) {
                document.body.classList.add('dark-mode');
                darkModeBtn.classList.add('active');
            } else {
                document.body.classList.remove('dark-mode');
                darkModeBtn.classList.remove('active');
            }
        }
    }

    // 星級選擇功能
    function initializeStarRating() {
        const stars = newCardRating.querySelectorAll('.star');
        
        stars.forEach((star, index) => {
            star.addEventListener('mouseenter', () => {
                updateStarDisplay(index + 1, 'hover');
            });
            
            star.addEventListener('mouseleave', () => {
                updateStarDisplay(currentRating, 'active');
            });
            
            star.addEventListener('click', () => {
                currentRating = index + 1;
                updateStarDisplay(currentRating, 'active');
                ratingValue.textContent = `${currentRating}`;
            });
        });
        
        // 重置按鈕功能
        newCardRating.addEventListener('dblclick', () => {
            currentRating = 0;
            updateStarDisplay(0, 'active');
            ratingValue.textContent = '0';
        });
        
        // 初始化顯示3星
        updateStarDisplay(currentRating, 'active');
        ratingValue.textContent = `${currentRating}`;
    }

    function updateStarDisplay(rating, type) {
        const stars = newCardRating.querySelectorAll('.star');
        stars.forEach((star, index) => {
            star.classList.remove('active', 'hover');
            if (index < rating) {
                star.classList.add(type);
            }
        });
    }

    // 夜間模式狀態（將由設置管理）
    let isDarkMode = false;

    // 顯示模式控制
    let currentMode = 'all'; // 預設顯示全部
    let currentCardType = 'word'; // 'word' | 'sentence'
    let currentCardTypeFilter = 'all'; // 'all' | 'word' | 'sentence'

    function setDisplayMode(mode, skipSave = false) {
        currentMode = mode;
        
        // 更新按鈕狀態
        [showAllBtn, showEnglishBtn, showChineseBtn].forEach(btn => {
            btn.classList.remove('active');
        });

        // 設置當前活動按鈕
        switch(mode) {
            case 'all':
                showAllBtn.classList.add('active');
                break;
            case 'english':
                showEnglishBtn.classList.add('active');
                break;
            case 'chinese':
                showChineseBtn.classList.add('active');
                break;
        }

        // 直接更新現有卡片的顯示狀態，不重新渲染
        const cards = document.querySelectorAll('.flashcard');
        cards.forEach(card => {
            // 只更新沒有 showing-all 類的卡片
            if (!card.classList.contains('showing-all')) {
                card.classList.remove('mode-all', 'mode-english', 'mode-chinese');
                card.classList.add(`mode-${mode}`);
                card.classList.remove('flipped');
            }
            // 保持編輯模式狀態
            if (isEditMode) {
                card.classList.add('edit-mode');
            }
        });
        
        // 保存設置（除非明確跳過）
        if (!skipSave) {
            saveSetting('displayMode', mode);
        }
    }

    // 綁定模式切換按鈕事件
    showAllBtn.addEventListener('click', () => setDisplayMode('all'));
    showEnglishBtn.addEventListener('click', () => setDisplayMode('english'));
    showChineseBtn.addEventListener('click', () => setDisplayMode('chinese'));

    // 分類類型選擇 (word / sentence)
    function setCardType(type) {
        currentCardType = type;
        wordTypeBtn.classList.toggle('active', type === 'word');
        sentenceTypeBtn.classList.toggle('active', type === 'sentence');
        saveSetting('cardType', type);
        // 選擇分類時同步切換直接顯示該分類的卡片
        setCardTypeFilter(type);
    }
    wordTypeBtn.addEventListener('click', () => setCardType('word'));
    sentenceTypeBtn.addEventListener('click', () => setCardType('sentence'));

    // 類型篩選 (all / word / sentence)
    function setCardTypeFilter(filter, skipSave = false) {
        currentCardTypeFilter = filter;
        [filterAllBtn, filterWordBtn, filterSentenceBtn].forEach(btn => btn.classList.remove('active'));
        if (filter === 'word') filterWordBtn.classList.add('active');
        else if (filter === 'sentence') filterSentenceBtn.classList.add('active');
        else filterAllBtn.classList.add('active');
        displayCards();
        if (!skipSave) {
            saveSetting('typeFilter', filter);
        }
    }
    filterAllBtn.addEventListener('click', () => setCardTypeFilter('all'));
    filterWordBtn.addEventListener('click', () => setCardTypeFilter('word'));
    filterSentenceBtn.addEventListener('click', () => setCardTypeFilter('sentence'));

    // 添加編輯模式切換函數
    function toggleEditMode() {
        isEditMode = !isEditMode;
        editModeBtn.classList.toggle('active');
        
        document.querySelectorAll('.flashcard').forEach(card => {
            card.classList.toggle('edit-mode');
        });
    }

    // 綁定編輯模式按鈕事件
    editModeBtn.addEventListener('click', toggleEditMode);

    // 排序功能
    function sortCards(mode) {
        let sortedCards = [...flashcards];
        
        switch(mode) {
            case 'rating':
                sortedCards.sort((a, b) => (b.rating || 0) - (a.rating || 0));
                break;
            case 'alphabet':
                sortedCards.sort((a, b) => a.english.toLowerCase().localeCompare(b.english.toLowerCase()));
                break;
            case 'time':
            default:
                // 分頁載入時已經是最新在前
                break;
        }
        
        return sortedCards;
    }

    // 設置排序模式
    function setSortMode(mode, skipSave = false) {
        currentSortMode = mode;
        
        // 更新按鈕狀態
        [sortByTimeBtn, sortByRatingBtn, sortByAlphabetBtn].forEach(btn => {
            btn.classList.remove('active');
        });
        
        switch(mode) {
            case 'time':
                sortByTimeBtn.classList.add('active');
                break;
            case 'rating':
                sortByRatingBtn.classList.add('active');
                break;
            case 'alphabet':
                sortByAlphabetBtn.classList.add('active');
                break;
        }
        
        displayCards();
        
        // 保存設置（除非明確跳過）
        if (!skipSave) {
            saveSetting('sortMode', mode);
        }
    }

    // 顯示所有已存在的單字卡
    function displayCards() {
        cardsContainer.innerHTML = '';
        let sortedCards = sortCards(currentSortMode);

        // 套用類型篩選（全部 / 單詞 / 長句）
        if (currentCardTypeFilter !== 'all') {
            sortedCards = sortedCards.filter(c => c.card_type === currentCardTypeFilter);
        }

        sortedCards.forEach((card, index) => {
            // 找到原始索引用於刪除和編輯操作
            const originalIndex = flashcards.findIndex(c => 
                c.english === card.english && c.chinese === card.chinese
            );
            const cardElement = createCardElement(card, originalIndex);
            cardsContainer.appendChild(cardElement);
        });
    }

    // 創建單字卡元素
    function createCardElement(card, index) {
        const div = document.createElement('div');
        div.className = `flashcard mode-${currentMode}${isEditMode ? ' edit-mode' : ''}`;
        
        // 添加星級顯示
        const cardRating = document.createElement('div');
        cardRating.className = 'card-rating';
        const rating = card.rating || 0;
        for (let i = 1; i <= 3; i++) {
            const star = document.createElement('span');
            star.className = `star ${i <= rating ? 'filled' : 'empty'}`;
            star.innerHTML = '★';
            star.dataset.rating = i;
            
            // 點擊修改星級（無需編輯模式）
            star.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newRating = parseInt(star.dataset.rating);
                
                try {
                    // 更新資料庫
                    const { error } = await supabaseClient
                        .from('user_cards')
                        .update({ rating: newRating })
                        .eq('english', card.english)
                        .eq('chinese', card.chinese)
                        .eq('card_type', card.card_type || 'word');
                    
                    if (error) throw error;
                    
                    // 更新本地資料
                    flashcards[index].rating = newRating;
                    localStorage.setItem('flashcards', JSON.stringify(flashcards));
                    
                    // 更新顯示
                    updateCardRating(cardRating, newRating);
                    
                } catch (error) {
                    console.error('更新星級失敗:', error);
                    alert('更新星級失敗，請稍後重試');
                }
            });
            
            cardRating.appendChild(star);
        }
        
        // 添加編輯按鈕（在刪除鍵左側）
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.innerHTML = '✎';
        editBtn.title = '編輯單詞卡';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startEditCard(div, index, card);
        });

        // 添加刪除按鈕
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            // 確認刪除
            const confirmDelete = confirm(`確定要刪除單字卡「${card.english} - ${card.chinese}」嗎？`);
            if (!confirmDelete) {
                return;
            }
            
            try {
                // 从数组中删除卡片
                const cardToDelete = flashcards[index];
                flashcards.splice(index, 1);
                
                // 刪除 Supabase 中的對應記錄
                const { error } = await supabaseClient
                    .from('user_cards')
                    .delete()
                    .eq('english', cardToDelete.english)
                    .eq('chinese', cardToDelete.chinese)
                    .eq('card_type', cardToDelete.card_type || 'word');
                
                if (error) {
                    throw error;
                }
                
                console.log('删除操作已同步到 Supabase');
                
                // 更新本地存储
                localStorage.setItem('flashcards', JSON.stringify(flashcards));
                
                // 更新显示
                displayCards();
            } catch (error) {
                console.error('删除时出错:', error);
                alert('删除失败，请稍后重试');
                // 如果删除失败，重新加载数据
                loadFromSupabase();
            }
        });

        div.innerHTML = `
            <div class="english">${card.english}</div>
            <div class="chinese">${card.chinese}</div>
        `;
        
        // 分類徽章（點擊可切換 單詞/長句）
        const typeBadge = document.createElement('span');
        typeBadge.className = 'card-type-badge ' + (card.card_type === 'sentence' ? 'sentence' : 'word');
        typeBadge.textContent = card.card_type === 'sentence' ? '長句' : '單詞';
        typeBadge.title = '點擊切換分類';
        typeBadge.addEventListener('click', async (e) => {
            e.stopPropagation();
            const nextType = card.card_type === 'sentence' ? 'word' : 'sentence';
            try {
                const { error } = await supabaseClient
                    .from('user_cards')
                    .update({ card_type: nextType })
                    .eq('english', card.english)
                    .eq('chinese', card.chinese)
                    .eq('card_type', card.card_type || 'word');
                if (error) throw error;
                card.card_type = nextType;
                flashcards[index].card_type = nextType;
                localStorage.setItem('flashcards', JSON.stringify(flashcards));
                // 若啟用了類型篩選且新類型不符：平滑收合移除此卡，避免瞬間重繪造成的跳動
                if (currentCardTypeFilter !== 'all' && currentCardTypeFilter !== nextType) {
                    div.style.transition = 'max-height 0.25s ease, opacity 0.2s ease, margin 0.25s ease, padding 0.25s ease';
                    div.style.overflow = 'hidden';
                    div.style.maxHeight = div.offsetHeight + 'px';
                    void div.offsetHeight; // 強制 reflow 讓過渡生效
                    div.style.maxHeight = '0px';
                    div.style.opacity = '0';
                    div.style.margin = '0px';
                    div.style.padding = '0px';
                    setTimeout(() => {
                        div.remove();
                    }, 260);
                } else {
                    typeBadge.className = 'card-type-badge ' + (nextType === 'sentence' ? 'sentence' : 'word');
                    typeBadge.textContent = nextType === 'sentence' ? '長句' : '單詞';
                }
            } catch (error) {
                console.error('切換分類失敗:', error);
                alert('切換分類失敗，請稍後重試');
            }
        });
        div.appendChild(typeBadge);

        div.appendChild(cardRating); // 添加星級顯示
        div.appendChild(editBtn);
        div.appendChild(deleteBtn);

        // 卡片點擊事件（單擊切換顯示）
        div.addEventListener('click', () => {
            // 編輯中不觸發翻轉
            if (div.classList.contains('editing')) {
                return;
            }
            if (div.classList.contains('showing-all')) {
                div.classList.remove('showing-all');
                div.classList.remove('mode-all');
                div.classList.add(`mode-${currentMode}`);
                div.classList.remove('flipped');
            } else {
                div.classList.add('showing-all');
                div.classList.remove(`mode-${currentMode}`);
                div.classList.add('mode-all');
            }
        });

        // 卡片雙擊事件（播放語音）
        div.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            // 編輯中不觸發播放
            if (div.classList.contains('editing')) {
                return;
            }
            speakEnglishText(card.english).catch((err) => console.error(err));
        });

        return div;
    }

    // 開始編輯單詞卡：在卡片內直接編輯中文與英文
    function startEditCard(div, index, card) {
        if (index < 0 || !flashcards[index]) {
            return;
        }
        // 若有其他卡正在編輯，先還原
        if (editingCardIndex >= 0 && editingCardIndex !== index) {
            const prev = document.querySelector('.flashcard.editing');
            if (prev) {
                prev.classList.remove('editing');
            }
        }

        editingCardIndex = index;
        div.classList.add('editing');

        // 取得英文／中文容器
        const enEl = div.querySelector('.english');
        const zhEl = div.querySelector('.chinese');

        // 載入原始值（供取消還原）
        const origEnglish = enEl.textContent;
        const origChinese = zhEl.textContent;

        // 將英文、中文替換為可編輯的 textarea
        const enArea = document.createElement('textarea');
        enArea.className = 'edit-textarea edit-en';
        enArea.value = origEnglish;
        const zhArea = document.createElement('textarea');
        zhArea.className = 'edit-textarea edit-zh';
        zhArea.value = origChinese;

        // 讓 textarea 自動依內容增高，不出現捲動條
        const fitHeight = (el) => {
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        };
        enArea.style.height = 'auto';
        zhArea.style.height = 'auto';
        enArea.addEventListener('input', () => fitHeight(enArea));
        zhArea.addEventListener('input', () => fitHeight(zhArea));

        enEl.replaceWith(enArea);
        zhEl.replaceWith(zhArea);

        // 等 DOM 就緒後依內容設定高度
        requestAnimationFrame(() => {
            fitHeight(enArea);
            fitHeight(zhArea);
        });

        // 隱藏星級、分類徽章、編輯／刪除鍵
        const ratingEl = div.querySelector('.card-rating');
        const badgeEl = div.querySelector('.card-type-badge');
        if (ratingEl) ratingEl.style.display = 'none';
        if (badgeEl) badgeEl.style.display = 'none';
        const oldEdit = div.querySelector('.edit-btn');
        const oldDel = div.querySelector('.delete-btn');
        if (oldEdit) oldEdit.style.display = 'none';
        if (oldDel) oldDel.style.display = 'none';

        // 建立儲存／取消按鈕
        const actions = document.createElement('div');
        actions.className = 'edit-actions';
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'input-action-btn edit-save';
        saveBtn.textContent = '儲存';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'input-action-btn edit-cancel';
        cancelBtn.textContent = '取消';
        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        div.appendChild(actions);

        saveBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newEnglish = enArea.value.trim();
            const newChinese = zhArea.value.trim();
            if (!newEnglish || !newChinese) {
                alert('中文與英文都必須填寫');
                return;
            }
            try {
                const originalEnglish = origEnglish;
                const originalChinese = origChinese;
                const originalType = card.card_type || 'word';

                const { error } = await supabaseClient
                    .from('user_cards')
                    .update({
                        english: newEnglish,
                        chinese: newChinese,
                        rating: card.rating || 0
                    })
                    .eq('english', originalEnglish)
                    .eq('chinese', originalChinese)
                    .eq('card_type', originalType);

                if (error) throw error;

                // 更新本地資料
                card.english = newEnglish;
                card.chinese = newChinese;
                flashcards[index].english = newEnglish;
                flashcards[index].chinese = newChinese;
                localStorage.setItem('flashcards', JSON.stringify(flashcards));

                editingCardIndex = -1;
                displayCards();
                console.log('卡片已更新到 Supabase');
            } catch (error) {
                console.error('更新失敗:', error);
                alert('更新失敗: ' + error.message);
            }
        });

        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editingCardIndex = -1;
            displayCards();
        });

        enArea.focus();
    }

    // 更新卡片星級顯示
    function updateCardRating(cardRatingElement, rating) {
        const stars = cardRatingElement.querySelectorAll('.star');
        stars.forEach((star, index) => {
            star.className = `star ${index < rating ? 'filled' : 'empty'}`;
        });
    }

    async function persistFlashcard(english, chinese, options = {}) {
        const { clearForm = false, cardType = currentCardType } = options;
        const newCard = {
            english,
            chinese,
            rating: currentRating,
            card_type: cardType
        };

        const { error } = await supabaseClient
            .from('user_cards')
            .insert([newCard])
            .select();

        if (error) {
            throw error;
        }

        flashcards.unshift(newCard);
        localStorage.setItem('flashcards', JSON.stringify(flashcards));
        displayCards();

        if (clearForm) {
            setFieldValue(englishInput, '');
            setFieldValue(chineseInput, '');
            currentRating = 1;
            updateStarDisplay(1, 'active');
            ratingValue.textContent = '1';
            updateTranslateButtonState();
        }
    }

    // 添加新卡片
    addCardButton.addEventListener('click', async () => {
        const englishRaw = englishInput.value.trim();
        const chineseRaw = chineseInput.value.trim();

        if (!englishRaw && !chineseRaw) {
            return;
        }

        try {
            console.log('正在保存新卡片...');

            // 手動翻譯模式：不再自動補齊另一邊語言，缺任一欄就提示先翻譯
            if (!englishRaw || !chineseRaw) {
                alert('請填寫英文與中文，或先按「翻譯」按鈕產生翻譯後再儲存');
                return;
            }

            await persistFlashcard(englishRaw, chineseRaw, {
                clearForm: true
            });
            console.log('成功保存到 Supabase');
        } catch (error) {
            console.error('保存失敗:', error);
            console.error('錯誤詳情:', error.message);
            alert('保存失敗: ' + error.message);
        }
    });

    // 🚀 快速初始化流程
    console.log('⚡ 快速載入本地設置...');
    
    // 1. 立即載入並應用本地設置
    const localSettings = loadLocalSettings();
    
    // 2. 立即載入本地卡片數據
    flashcards = JSON.parse(localStorage.getItem('flashcards')) || [];
    if (flashcards.length > 0) {
        console.log('⚡ 快速顯示本地卡片數據');
        displayCards();
    }
    
    // 3. 初始化其他功能
    updateTranslateButtonState();
    initializeStarRating();
    
    console.log('✅ 快速初始化完成，開始背景同步...');
    
    function setupInfiniteScroll() {
        if (!loadMoreTrigger || typeof IntersectionObserver === 'undefined') {
            return;
        }

        const observer = new IntersectionObserver(async (entries) => {
            const targetEntry = entries[0];
            if (targetEntry.isIntersecting && hasMoreCards && !isLoadingCards) {
                await loadFromSupabase(false);
            }
        }, {
            root: null,
            rootMargin: '200px',
            threshold: 0
        });

        observer.observe(loadMoreTrigger);
    }

    setupInfiniteScroll();

    // 4. 背景同步雲端數據（不阻塞界面）
    Promise.all([
        syncCloudSettings(localSettings),
        loadFromSupabase(true)
    ]).then(([settingsSync, cardsSync]) => {
        console.log('🌐 背景同步完成');
        console.log('設置同步:', settingsSync ? '成功' : '失敗');
        console.log('卡片同步:', cardsSync ? '成功' : '失敗');
        
        if (cardsSync && flashcards.length === 0) {
            // 如果本地沒有數據但雲端有，顯示雲端數據
            displayCards();
        }
    }).catch(error => {
        console.error('背景同步出錯:', error);
    });

    // 切換夜間模式
    async function toggleDarkMode(skipSave = false) {
        isDarkMode = !isDarkMode;
        document.body.classList.toggle('dark-mode');
        darkModeBtn.classList.toggle('active');
        
        console.log(`夜間模式切換為: ${isDarkMode}`);
        
        // 保存設置（除非明確跳過）
        if (!skipSave) {
            // 保存為字符串以保持一致性
            console.log('正在保存夜間模式設置...');
            await saveSetting('darkMode', isDarkMode.toString());
            console.log('夜間模式設置保存完成');
        }
    }

    // 綁定夜間模式按鈕事件
    darkModeBtn.addEventListener('click', async () => {
        console.log('🌙 用戶點擊夜間模式按鈕');
        console.log('點擊前狀態:', isDarkMode);
        
        await toggleDarkMode();
        
        console.log('點擊後狀態:', isDarkMode);
        
        // 驗證設置是否正確保存
        setTimeout(() => {
            const savedValue = localStorage.getItem('darkMode');
            console.log('本地存儲中的夜間模式設置:', savedValue);
        }, 100);
    });

    // 添加洗牌函數 - Fisher-Yates 高隨機度洗牌算法
    function shuffleArray(array) {
        const newArray = [...array]; // 創建副本
        
        // 執行多次洗牌以提高隨機度
        for (let round = 0; round < 3; round++) {
            for (let i = newArray.length - 1; i > 0; i--) {
                // 使用加強的隨機數生成
                const j = Math.floor(Math.random() * (i + 1));
                [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
            }
        }
        
        return newArray;
    }

    // 強制隨機排列函數 - 確保順序一定會改變
    function forceShuffleArray(array) {
        if (array.length <= 1) return [...array];
        
        let shuffled = shuffleArray(array);
        let attempts = 0;
        const maxAttempts = 10;
        
        // 確保順序確實改變了
        while (attempts < maxAttempts) {
            const orderChanged = !array.every((item, index) => 
                item.english === shuffled[index].english
            );
            
            if (orderChanged) {
                break;
            }
            
            // 如果順序沒變，使用更激進的洗牌方法
            shuffled = shuffleArray([...array]);
            
            // 手動交換前兩個元素以確保變化
            if (shuffled.length >= 2 && attempts === maxAttempts - 1) {
                [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
            }
            
            attempts++;
        }
        
        return shuffled;
    }

    // 添加隨機排列功能
    async function shuffleCards() {
        try {
            console.log('🎲 開始高隨機度排列');
            console.log('當前排序模式:', currentSortMode);
            console.log('原始順序:', flashcards.map(c => c.english));
            
            // 使用強制隨機排列，確保順序一定改變
            const shuffledArray = forceShuffleArray(flashcards);
            console.log('隨機排列後順序:', shuffledArray.map(c => c.english));
            
            // 更新全局數據
            flashcards = shuffledArray;
            
            // 暫時切換到時間排序模式，這樣隨機排列的結果才能正確顯示
            const originalSortMode = currentSortMode;
            currentSortMode = 'time';
            
            // 更新排序按鈕狀態
            [sortByTimeBtn, sortByRatingBtn, sortByAlphabetBtn].forEach(btn => {
                btn.classList.remove('active');
            });
            sortByTimeBtn.classList.add('active');
            
            // 保存新的排序模式
            saveSetting('sortMode', 'time');
            
            // 只保存到本地存儲，不同步到 Supabase
            localStorage.setItem('flashcards', JSON.stringify(flashcards));
            
            console.log('✅ 隨機排列完成，已切換到時間排序模式');
            console.log('最終順序:', flashcards.map(c => c.english));
            
            // 重新顯示卡片
            displayCards();
            
            // 添加簡單的淡入效果
            const cards = document.querySelectorAll('.flashcard');
            cards.forEach((card, index) => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(-10px)';
                
                setTimeout(() => {
                    card.style.transition = 'all 0.3s ease';
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                    
                    // 清理過渡效果
                    setTimeout(() => {
                        card.style.transition = '';
                    }, 300);
                }, index * 20);
            });
        } catch (error) {
            console.error('隨機排列時出錯:', error);
        }
    }

    // 綁定隨機排列按鈕事件
    shuffleBtn.addEventListener('click', shuffleCards);

    // 綁定排序按鈕事件
    sortByTimeBtn.addEventListener('click', () => setSortMode('time'));
    sortByRatingBtn.addEventListener('click', () => setSortMode('rating'));
    sortByAlphabetBtn.addEventListener('click', () => setSortMode('alphabet'));

    // 翻譯功能
    // 主要翻譯服務：Google（免費 gtx 端點）
    async function translateWithGoogle(text, from, to) {
        try {
            const response = await fetch(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`,
                { cache: 'no-store' }
            );

            // 檢查回應狀態，避免 Google 限流(429/403)時誤判為內容錯誤
            if (!response.ok) {
                console.warn(`主要翻譯服務(Google)失敗 (HTTP ${response.status})`);
                return { error: 'http', status: response.status, message: `主要翻譯服務(Google)暫時不可用 (HTTP ${response.status})` };
            }

            const data = await response.json();
            if (!data || !Array.isArray(data[0]) || !data[0][0]) {
                return { error: 'bad_response', message: '主要翻譯服務(Google)回應異常' };
            }
            return data[0][0][0];
        } catch (error) {
            console.error('主要翻譯服務(Google)錯誤:', error);
            return { error: 'network', message: '主要翻譯服務(Google)網路連線失敗' };
        }
    }

    // 備用翻譯服務：MyMemory（免費、支援瀏覽器 CORS）
    async function translateWithMyMemory(text, from, to) {
        try {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
            const response = await fetch(url, { cache: 'no-store' });

            if (!response.ok) {
                console.warn(`備用翻譯服務(MyMemory)失敗 (HTTP ${response.status})`);
                return { error: 'http', status: response.status, message: `備用翻譯服務(MyMemory)暫時不可用 (HTTP ${response.status})` };
            }

            const data = await response.json();

            // MyMemory 額度用盡或錯誤時，responseStatus 會是非 200 的數字
            if (data && data.responseStatus && data.responseStatus !== 200) {
                console.warn(`備用翻譯服務(MyMemory)回應狀態 ${data.responseStatus}`);
                return { error: 'quota', message: '備用翻譯服務(MyMemory)額度已達上限或無法翻譯' };
            }

            const translated = data && data.responseData && data.responseData.translatedText;
            if (translated) {
                return translated;
            }
            return { error: 'bad_response', message: '備用翻譯服務(MyMemory)回應異常' };
        } catch (error) {
            console.error('備用翻譯服務(MyMemory)錯誤:', error);
            return { error: 'network', message: '備用翻譯服務(MyMemory)網路連線失敗' };
        }
    }

    // 翻譯總入口：主要服務失敗時自動改用備用服務
    async function translateText(text, from, to) {
        const primary = await translateWithGoogle(text, from, to);
        if (primary && typeof primary === 'string') {
            return primary;
        }

        console.warn('主要翻譯服務失敗，改用備用服務(MyMemory)...');
        const backup = await translateWithMyMemory(text, from, to);
        if (backup && typeof backup === 'string') {
            return backup;
        }

        console.error('主要與備用翻譯服務皆失敗');
        return { error: 'all_failed', message: '主要與備用翻譯服務皆暫時不可用，請稍後再試' };
    }

    // 判斷文字是否包含中文
    function isChineseText(text) {
        return /[\u3400-\u9FFF]/.test(text);
    }

    function cancelAllSpeechOutputs() {
        if (typeof responsiveVoice !== 'undefined') {
            try {
                responsiveVoice.cancel();
            } catch {
                /* */
            }
        }
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            try {
                speechSynthesis.cancel();
            } catch {
                /* */
            }
        }
    }

    function ensureSpeechVoicesLoaded() {
        return new Promise((resolve) => {
            if (!window.speechSynthesis) {
                resolve();
                return;
            }
            const grab = () => speechSynthesis.getVoices() || [];
            if (grab().length > 0) {
                resolve();
                return;
            }
            const onVoices = () => {
                speechSynthesis.removeEventListener('voiceschanged', onVoices);
                resolve();
            };
            speechSynthesis.addEventListener('voiceschanged', onVoices);
            setTimeout(() => {
                speechSynthesis.removeEventListener('voiceschanged', onVoices);
                resolve();
            }, 800);
        });
    }

    /** Web Speech：英文語音，prefer 為 auto | en-US | en-GB */
    function pickWebSpeechVoice(prefer) {
        if (!window.speechSynthesis) {
            return null;
        }
        const all = speechSynthesis.getVoices() || [];
        const english = all.filter((v) => /^en/i.test(v.lang || ''));
        if (english.length === 0) {
            return null;
        }
        const p = (prefer || 'auto').toLowerCase();
        if (p === 'en-us') {
            const x = english.find((v) => (v.lang || '').toLowerCase().startsWith('en-us'));
            if (x) {
                return x;
            }
        }
        if (p === 'en-gb') {
            const x = english.find((v) => (v.lang || '').toLowerCase().startsWith('en-gb'));
            if (x) {
                return x;
            }
        }
        const rank = (v) => {
            const n = `${v.name} ${v.voiceURI || ''}`.toLowerCase();
            let s = 0;
            if (n.includes('google')) {
                s += 6;
            }
            if (n.includes('premium') || n.includes('enhanced')) {
                s += 5;
            }
            if (n.includes('siri')) {
                s += 4;
            }
            if (/(samantha|karen|daniel|moira|aaron|flo|zira|matthew|aria)/i.test(n)) {
                s += 3;
            }
            if (n.includes('microsoft')) {
                s += 2;
            }
            return s;
        };
        return [...english].sort((a, b) => rank(b) - rank(a))[0];
    }

    async function speakEnglishTextWithWebSpeech(text, prefer, finish) {
        if (!window.speechSynthesis) {
            if (typeof responsiveVoice !== 'undefined') {
                responsiveVoice.speak(text, 'US English Male', {
                    pitch: 1,
                    rate: 0.9,
                    volume: 1,
                    onend: finish
                });
            } else {
                finish();
            }
            return;
        }
        await ensureSpeechVoicesLoaded();
        const u = new SpeechSynthesisUtterance(text);
        const v = pickWebSpeechVoice(prefer);
        if (v) {
            u.voice = v;
            u.lang = v.lang || (prefer === 'en-gb' ? 'en-GB' : 'en-US');
        } else {
            u.lang = prefer === 'en-gb' ? 'en-GB' : 'en-US';
        }
        u.rate = 0.9;
        u.pitch = 1;
        u.volume = 1;
        u.onend = finish;
        u.onerror = finish;
        speechSynthesis.speak(u);
    }

    function speakEnglishText(text, options = {}) {
        const trimmed = (text || '').trim();
        return new Promise((resolve) => {
            const finish = () => {
                try {
                    if (typeof options.onend === 'function') {
                        options.onend();
                    }
                } finally {
                    resolve();
                }
            };

            if (!trimmed) {
                finish();
                return;
            }

            cancelAllSpeechOutputs();

            const raw =
                (ttsEngineSelect && ttsEngineSelect.value) ||
                localStorage.getItem('englishTts') ||
                'rv:US English Male';

            if (raw.startsWith('rv:')) {
                const voiceName = raw.slice(3);
                if (typeof responsiveVoice !== 'undefined') {
                    responsiveVoice.speak(trimmed, voiceName, {
                        pitch: 1,
                        rate: 0.9,
                        volume: 1,
                        onend: finish
                    });
                    return;
                }
                void speakEnglishTextWithWebSpeech(trimmed, 'auto', finish);
                return;
            }

            if (raw.startsWith('ws:')) {
                const prefer = raw.slice(3);
                void speakEnglishTextWithWebSpeech(trimmed, prefer, finish);
                return;
            }

            if (typeof responsiveVoice !== 'undefined') {
                responsiveVoice.speak(trimmed, 'US English Male', {
                    pitch: 1,
                    rate: 0.9,
                    volume: 1,
                    onend: finish
                });
            } else {
                void speakEnglishTextWithWebSpeech(trimmed, 'auto', finish);
            }
        });
    }

    // 將輸入正規化為英文在前、中文在後
    async function normalizeCardInput(englishRaw, chineseRaw) {
        let english = englishRaw.trim();
        let chinese = chineseRaw.trim();

        // 兩邊都有值但填反時，自動交換
        if (english && chinese && isChineseText(english) && !isChineseText(chinese)) {
            [english, chinese] = [chinese, english];
        }

        // 只有一邊有值時，自動偵測語言並翻譯另一邊
        if (english && !chinese) {
            if (isChineseText(english)) {
                const originalChinese = english;
                const translatedEnglish = await translateText(originalChinese, 'zh-TW', 'en');
                if (translatedEnglish && typeof translatedEnglish === 'object') throw translatedEnglish;
                english = translatedEnglish ? translatedEnglish.trim() : '';
                chinese = originalChinese;
            } else {
                const translatedChinese = await translateText(english, 'en', 'zh-TW');
                if (translatedChinese && typeof translatedChinese === 'object') throw translatedChinese;
                chinese = translatedChinese ? translatedChinese.trim() : '';
            }
        } else if (!english && chinese) {
            if (isChineseText(chinese)) {
                const translatedEnglish = await translateText(chinese, 'zh-TW', 'en');
                if (translatedEnglish && typeof translatedEnglish === 'object') throw translatedEnglish;
                english = translatedEnglish ? translatedEnglish.trim() : '';
            } else {
                const originalEnglish = chinese;
                const translatedChinese = await translateText(originalEnglish, 'en', 'zh-TW');
                if (translatedChinese && typeof translatedChinese === 'object') throw translatedChinese;
                english = originalEnglish;
                chinese = translatedChinese ? translatedChinese.trim() : '';
            }
        }

        return { english, chinese };
    }

    // 處理翻譯按鈕點擊
    translateBtn.addEventListener('click', async () => {
        const sourceText = englishInput.value.trim();
        
        translateBtn.disabled = true;
        translateBtn.textContent = '翻譯中...';

        try {
            if (!sourceText) {
                setFieldValue(chineseInput, '');
            } else {
                const normalized = await normalizeCardInput(sourceText, '');
                if (isChineseText(sourceText)) {
                    setFieldValue(chineseInput, normalized.english || '');
                } else {
                    setFieldValue(chineseInput, normalized.chinese || '');
                }
            }

            if (!chineseInput.value && sourceText) {
                alert('翻譯失敗，請確認輸入內容');
            } else {
                updateTranslateButtonState();
            }
        } catch (error) {
            console.error('翻譯過程出錯:', error);
            const msg = (error && typeof error === 'object' && error.message)
                ? error.message
                : '翻譯失敗，請稍後再試';
            alert(msg);
        } finally {
            translateBtn.disabled = false;
            translateBtn.textContent = '翻譯';
        }
    });

    // 監聽輸入框變化，控制翻譯按鈕狀態
    function updateTranslateButtonState() {
        const sourceText = englishInput.value.trim();
        translateBtn.disabled = !sourceText;
    }

    englishInput.addEventListener('input', () => {
        autoResizeTextarea(englishInput);
        updateTranslateButtonState();
    });

    // 初始化翻譯按鈕狀態
    updateTranslateButtonState();

    // 一鍵貼上到輸入框
    pasteInputBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text || !text.trim()) {
                alert('剪貼簿沒有可貼上的內容');
                return;
            }

            setFieldValue(englishInput, text.trim());
        } catch (error) {
            console.error('貼上失敗:', error);
            alert('貼上失敗，請確認瀏覽器已允許剪貼簿權限');
        }
    });

    // 一鍵複製翻譯結果
    copyTranslationBtn.addEventListener('click', async () => {
        try {
            const translation = chineseInput.value.trim();
            if (!translation) {
                alert('目前沒有可複製的翻譯結果');
                return;
            }

            await navigator.clipboard.writeText(translation);
        } catch (error) {
            console.error('複製失敗:', error);
            alert('複製失敗，請稍後再試');
        }
    });

    autoResizeTextarea(englishInput);
    autoResizeTextarea(chineseInput);

    // Supabase 相关函数
    async function saveToSupabase() {
        try {
            console.log('正在保存数据到 Supabase...');
            console.log('要保存的数据:', flashcards);
            
            // 先清空現有數據
            const { error: deleteError } = await supabaseClient
                .from('user_cards')
                .delete()
                .neq('id', 0); // 删除所有记录
            
            if (deleteError) {
                console.error('清空數據時出錯:', deleteError);
            }
            
            // 插入新數據
            const { data, error } = await supabaseClient
                .from('user_cards')
                .insert(flashcards)
                .select();
            
            if (error) {
                throw error;
            }
            
            console.log('数据成功保存到 Supabase');
            return true;
        } catch (error) {
            console.error('保存到 Supabase 时出错:', error);
            console.error('错误详情:', error.message);
            return false;
        }
    }

    async function loadFromSupabase(reset = false) {
        if (isLoadingCards) {
            return true;
        }

        try {
            if (reset) {
                cardsOffset = 0;
                hasMoreCards = true;
                flashcards = [];
            }

            if (!hasMoreCards) {
                return true;
            }

            isLoadingCards = true;
            console.log(`正在从 Supabase 分頁读取数据... offset=${cardsOffset}, limit=${CARDS_PAGE_SIZE}`);

            const { data, error } = await supabaseClient
                .from('user_cards')
                .select('*')
                .order('id', { ascending: false })
                .range(cardsOffset, cardsOffset + CARDS_PAGE_SIZE - 1);
            
            if (error) {
                throw error;
            }
            
            if (data && data.length > 0) {
                const pageCards = data.map(item => ({
                    english: item.english,
                    chinese: item.chinese,
                    rating: item.rating || 0,
                    card_type: item.card_type || 'word'
                }));

                flashcards = [...flashcards, ...pageCards];
                cardsOffset += data.length;
                hasMoreCards = data.length === CARDS_PAGE_SIZE;
                console.log(`分頁讀取成功，本次 ${data.length} 筆，累計 ${flashcards.length} 筆`);
            } else {
                hasMoreCards = false;
                if (reset) {
                    console.log('資料庫目前沒有卡片');
                }
            }
            
            localStorage.setItem('flashcards', JSON.stringify(flashcards));
            displayCards();
            return true;
        } catch (error) {
            console.error('从 Supabase 加载失败，详细错误:', error);
            console.error('错误堆栈:', error.stack);
            return false;
        } finally {
            isLoadingCards = false;
        }
    }

    // 修改 setupRealtimeSync 函数
    function setupRealtimeSync() {
        console.log('设置 Supabase 实时同步监听...');
        
        // 使用 Supabase Realtime 监听 user_cards 表的变化
        const channel = supabaseClient
            .channel('user_cards_changes')
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'user_cards' 
                }, 
                async (payload) => {
                    console.log('检测到数据变化:', payload);
                    
                    // 變更後重置分頁並重新載入第一批
                    try {
                        await loadFromSupabase(true);
                    } catch (error) {
                        console.error('实时同步错误:', error);
                    }
                }
            )
            .subscribe();
    }

    // 設置即時同步功能
    function setupSettingsSync() {
        console.log('設置 Supabase 設置即時同步監聽...');
        
        const settingsChannel = supabaseClient
            .channel('settings_changes')
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'user_settings' 
                }, 
                async (payload) => {
                    console.log('檢測到設置變化:', payload);
                    
                    // 暫時禁用即時同步以避免衝突
                    // 只有在其他裝置變更設置時才需要同步
                    // 本地變更不需要重新載入
                    console.log('跳過設置同步，避免與本地變更衝突');
                }
            )
            .subscribe();
    }

    // 在 DOMContentLoaded 事件中添加实时同步
    setupRealtimeSync();
    setupSettingsSync();

    // 監聽播放設定輸入欄位變化
    playCountInput.addEventListener('change', () => {
        const count = parseInt(playCountInput.value);
        if (count >= 1 && count <= 10) {
            saveSetting('playCount', count.toString());
        } else {
            playCountInput.value = 2; // 恢復預設值
        }
    });
    
    playIntervalInput.addEventListener('change', () => {
        const interval = parseInt(playIntervalInput.value);
        if (interval >= 1 && interval <= 30) {
            saveSetting('playInterval', interval.toString());
        } else {
            playIntervalInput.value = 3; // 恢復預設值
        }
    });

    if (ttsEngineSelect) {
        ttsEngineSelect.addEventListener('change', () => {
            saveSetting('englishTts', ttsEngineSelect.value);
        });
    }

    // 持續播放功能
    async function playAllCards() {
        if (isPlaying) {
            stopPlayback();
            return;
        }
        
        const sortedCards = sortCards(currentSortMode);
        // 只播放目前「類型篩選」所選分類的卡片（全部 / 單詞 / 長句）
        const playableCards = currentCardTypeFilter === 'all'
            ? sortedCards
            : sortedCards.filter(c => c.card_type === currentCardTypeFilter);
        if (playableCards.length === 0) {
            alert('沒有可播放的單字卡');
            return;
        }
        
        isPlaying = true;
        currentPlayIndex = 0;
        playAllCardsBtn.textContent = '停止播放';
        playAllCardsBtn.classList.add('is-stopping');
        
        console.log('🎵 開始播放目前分類的單字卡');
        
        playNextCard(playableCards);
    }
    
    function playNextCard(cards) {
        if (!isPlaying || currentPlayIndex >= cards.length) {
            stopPlayback();
            return;
        }
        
        const card = cards[currentPlayIndex];
        const playCount = parseInt(playCountInput.value);
        const interval = parseInt(playIntervalInput.value) * 1000; // 轉換為毫秒
        
        console.log(`🔊 播放第 ${currentPlayIndex + 1}/${cards.length} 張卡片: ${card.english}`);
        
        // 播放當前單字指定次數
        playCardMultipleTimes(card, playCount, () => {
            if (!isPlaying) return;
            
            currentPlayIndex++;
            
            if (currentPlayIndex < cards.length) {
                // 等待間隔時間後播放下一張
                playTimeout = setTimeout(() => {
                    playNextCard(cards);
                }, interval);
            } else {
                // 播放完所有卡片
                stopPlayback();
                alert('所有單字卡播放完成！');
            }
        });
    }
    
    function playCardMultipleTimes(card, count, callback) {
        let playedCount = 0;

        async function playOnce() {
            if (!isPlaying || playedCount >= count) {
                if (callback) {
                    callback();
                }
                return;
            }

            await speakEnglishText(card.english);
            if (!isPlaying) {
                return;
            }
            playedCount++;
            if (playedCount < count) {
                setTimeout(() => {
                    playOnce().catch((err) => console.error(err));
                }, 500);
            } else if (callback) {
                callback();
            }
        }

        playOnce().catch((err) => console.error(err));
    }
    
    function stopPlayback() {
        console.log('⏹️ 停止播放');
        
        isPlaying = false;
        currentPlayIndex = 0;
        
        if (playTimeout) {
            clearTimeout(playTimeout);
            playTimeout = null;
        }
        
        cancelAllSpeechOutputs();
        
        playAllCardsBtn.disabled = false;
        playAllCardsBtn.textContent = '開始播放';
        playAllCardsBtn.classList.remove('is-stopping');
    }
    
    // 綁定播放控制按鈕事件
    playAllCardsBtn.addEventListener('click', playAllCards);
}); 