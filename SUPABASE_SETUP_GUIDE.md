# Supabase 設置指南

## 🚀 快速開始

### 1. 創建 Supabase 帳戶
1. 前往 [https://supabase.com](https://supabase.com)
2. 點擊 "Start your project" 或 "Sign up"
3. 使用 GitHub、Google 或 Email 註冊

### 2. 創建新項目
1. 登入後，點擊 "New project"
2. 選擇組織（如果是第一次使用，會自動創建）
3. 填寫項目資訊：
   - **Name**: 例如 "image-flashcard-app"
   - **Database Password**: 設置一個強密碼（請記住！）
   - **Region**: 選擇離您最近的地區（建議選 "Southeast Asia (Singapore)"）
4. 點擊 "Create new project"
5. 等待 1-2 分鐘讓項目初始化完成

### 3. 獲取 API 配置
項目創建完成後：
1. 在左側導航欄點擊 "Settings" > "API"
2. 複製以下兩個重要資訊：
   - **Project URL**: 類似 `https://your-project-id.supabase.co`
   - **anon/public key**: 一個很長的字串，以 `eyJ` 開頭

### 4. 設置 Storage Bucket
1. 在左側導航欄點擊 "Storage"
2. 點擊 "Create a new bucket"
3. 填寫：
   - **Name**: `images`
   - **Public bucket**: ✅ 勾選（這樣圖片可以公開訪問）
4. 點擊 "Create bucket"

### 5. 更新代碼配置
在 `main.js` 文件中找到以下兩行：

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // 請替換為您的 Supabase URL
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // 請替換為您的 Supabase anon key
```

將它們替換為您在步驟 3 中獲取的實際值：

```javascript
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...您的完整anon key...';
```

## ✅ 測試連接
1. 保存 `main.js` 文件
2. 在瀏覽器中打開 `index.html`
3. 打開開發者工具（F12）查看控制台
4. 如果看到 "Supabase 初始化成功" 和 "Supabase Storage 連接正常"，表示設置成功！

## 🔧 故障排除

### 問題 1: "請先設置 Supabase 配置！"
**解決方法**: 確保您已正確替換 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`

### 問題 2: "Supabase Storage 連接失敗"
**解決方法**: 
1. 確認您已創建名為 `images` 的 bucket
2. 確認 bucket 設置為 public
3. 檢查 API key 是否正確

### 問題 3: "無法創建儲存空間"
**解決方法**: 
1. 回到 Supabase 控制台
2. 手動創建 `images` bucket 並設置為 public

## 💰 費用說明
- **免費額度**: 每月 500MB 儲存空間，1GB 傳輸量
- **付費計劃**: 如果超出免費額度，可以升級到 $25/月的 Pro 計劃
- **監控用量**: 在 Supabase 控制台的 "Settings" > "Usage" 中查看使用情況

## 🔄 從 Firebase 遷移數據
如果您之前有 Firebase 中的圖片數據，需要手動下載並重新上傳到 Supabase。

## 📞 需要幫助？
如果遇到任何問題，請：
1. 檢查瀏覽器控制台的錯誤訊息
2. 確認所有步驟都已正確完成
3. 參考 [Supabase 官方文檔](https://supabase.com/docs)
