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

### 5. 創建解釋數據表
1. 在左側導航欄點擊 "SQL Editor"
2. 點擊 "New query"
3. 複製並貼上以下 SQL 代碼：

```sql
CREATE TABLE flashcard_explanations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_name TEXT NOT NULL UNIQUE,
    word TEXT NOT NULL,
    chinese_name TEXT DEFAULT '',
    explanation TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 創建索引以提高查詢性能
CREATE INDEX idx_flashcard_explanations_file_name ON flashcard_explanations(file_name);
CREATE INDEX idx_flashcard_explanations_word ON flashcard_explanations(word);

-- 啟用行級安全 (RLS)
ALTER TABLE flashcard_explanations ENABLE ROW LEVEL SECURITY;

-- 創建允許所有操作的策略（對於簡單應用）
CREATE POLICY "Allow all operations" ON flashcard_explanations FOR ALL USING (true);
```

4. 點擊 "Run" 執行 SQL
5. 如果成功，您會看到 "Success. No rows returned" 的訊息

### 6. 更新代碼配置
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

## ✨ 新功能：完整卡片編輯
現在每個圖卡都支持完整的編輯功能，您可以：

### 📝 編輯所有字段
- **單詞名稱**：點擊單詞區域編輯
- **中文名稱**：點擊中文名區域編輯（金色字體）
- **解釋內容**：點擊解釋區域編輯

### 👁️ 字段顯示控制
在控制面板中可以選擇隱藏特定字段：
- **隱藏中文名**：勾選後中文名字段完全不顯示，不佔用空間
- **隱藏解釋**：勾選後解釋字段完全不顯示，不佔用空間
- **設置保存**：隱藏設置會自動保存，重新打開頁面時保持設定
- **即時生效**：勾選或取消勾選立即生效，無需重新載入

### 🎯 編輯操作

#### 🔄 編輯模式切換
在控制面板中有一個**編輯模式按鈕**：
- **✏️ 編輯模式**：橙色按鈕，點擊進入編輯狀態
- **🔒 鎖定模式**：綠色按鈕，點擊鎖定編輯功能
- 狀態會**自動保存**，重新打開頁面時保持設定

#### 📝 編輯現有卡片（編輯模式下）
1. **切換到編輯模式**（點擊編輯模式按鈕）
2. **點擊任意字段**直接進入編輯狀態
3. **輸入新內容**（支持多行文本）
4. **按 Enter 鍵**或**點擊其他地方**保存
5. **按 ESC 鍵**取消編輯
6. 每個字段**獨立保存**，即時同步

#### 👁️ 鎖定模式（美觀顯示）
- **無邊框背景**：字段沒有黑框和深色背景
- **隱藏空提示**：空字段不顯示"點擊添加..."提示
- **不可編輯**：點擊字段不會進入編輯狀態
- **純淨顯示**：專注於內容，界面更美觀

#### 🆕 添加新卡片（弹窗模式）
1. 搜索並保存圖片後**自動彈出編輯弹窗**
2. **一次性編輯所有内容**（單詞、中文名、解釋）
3. **點擊確定**保存所有更改
4. **點擊取消**放棄更改
5. 支持**快捷鍵**：Ctrl+Enter 快速確定，ESC 取消

### 🌐 雲端同步
所有內容會**自動同步到雲端**，在不同設備上都能看到最新數據

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

### 問題 4: "解釋功能無法使用"
**解決方法**: 
1. 確認您已在 Supabase SQL Editor 中執行了創建表的 SQL 代碼
2. 檢查瀏覽器控制台是否有錯誤訊息
3. 確認數據表 `flashcard_explanations` 已成功創建

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
