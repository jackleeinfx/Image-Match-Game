// Firebase 配置
const firebaseConfig = {
    apiKey: "AIzaSyDQZovmdN3y7AGJh9rkVZopch0ZvQG68qw",
    authDomain: "testjack-5fd0c.firebaseapp.com",
    projectId: "testjack-5fd0c",
    storageBucket: "testjack-5fd0c.appspot.com",
    messagingSenderId: "976883349752",
    appId: "1:976883349752:web:5eee959e782b4e95df630d"
};

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);
const storage = firebase.storage();

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
        displaySearchResults(data.items, searchTerm);
    } catch (error) {
        console.error('搜尋圖片時發生錯誤：', error);
    }
}

function displaySearchResults(images, searchTerm) {
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = '';

    images.forEach(image => {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'image-item';
        
        const img = document.createElement('img');
        img.src = image.link;
        img.alt = searchTerm;
        
        img.addEventListener('click', () => saveImageToFirebase(image.link, searchTerm));
        
        imgDiv.appendChild(img);
        resultsDiv.appendChild(imgDiv);
    });
}

async function saveImageToFirebase(imageUrl, searchTerm) {
    try {
        // 下載圖片
        const response = await fetch(imageUrl);
        const blob = await response.blob();

        // 生成檔案名稱
        const fileName = `${searchTerm}_${Date.now()}.jpg`;
        
        // 上傳到 Firebase Storage
        const storageRef = storage.ref(`images/${fileName}`);
        await storageRef.put(blob);

        // 取得下載網址
        const downloadUrl = await storageRef.getDownloadURL();
        
        // 創建單詞卡
        createFlashcard(downloadUrl, searchTerm);
        
        alert('圖片已成功儲存！');
    } catch (error) {
        console.error('儲存圖片時發生錯誤：', error);
    }
}

function createFlashcard(imageUrl, word) {
    const flashcardsDiv = document.getElementById('flashcards');
    
    const card = document.createElement('div');
    card.className = 'flashcard';
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = word;
    
    const wordDiv = document.createElement('div');
    wordDiv.textContent = word;
    
    card.appendChild(img);
    card.appendChild(wordDiv);
    flashcardsDiv.appendChild(card);
} 