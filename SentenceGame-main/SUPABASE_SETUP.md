# Supabase 設置說明

## 🚀 轉換完成！

您的單字卡應用程式已成功從 Firebase 轉換到 Supabase。以下是完成設置所需的步驟：

## 📋 必要步驟

### 1. 創建 Supabase 專案
1. 前往 [Supabase](https://supabase.com)
2. 創建新專案
3. 記錄您的專案 URL 和 anon key

### 2. 設置資料庫表
在 Supabase 的 SQL 編輯器中執行以下 SQL 語句：

```sql
-- 創建 user_cards 表（包含星級功能）
CREATE TABLE user_cards (
    id BIGSERIAL PRIMARY KEY,
    english TEXT NOT NULL,
    chinese TEXT NOT NULL,
    rating INTEGER DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    card_type TEXT DEFAULT 'word',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 如果表已存在，添加 card_type 欄位（word=單詞 / sentence=長句）
ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS card_type TEXT DEFAULT 'word';

-- 創建用戶設置表
CREATE TABLE user_settings (
    id BIGSERIAL PRIMARY KEY,
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 如果表已存在，添加 rating 欄位
-- ALTER TABLE user_cards ADD COLUMN rating INTEGER DEFAULT 0 CHECK (rating >= 0 AND rating <= 5);

-- 如果只需要添加設置表（user_cards 表已存在）
-- CREATE TABLE user_settings (
--     id BIGSERIAL PRIMARY KEY,
--     setting_key TEXT NOT NULL UNIQUE,
--     setting_value TEXT NOT NULL,
--     updated_at TIMESTAMPTZ DEFAULT NOW()
-- );
-- ALTER PUBLICATION supabase_realtime ADD TABLE user_settings;
-- ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all operations" ON user_settings FOR ALL USING (true);

-- 啟用 Realtime（如果需要即時同步功能）
ALTER PUBLICATION supabase_realtime ADD TABLE user_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE user_settings;

-- 設置 RLS（行級安全性）- 可選，用於多用戶支持
ALTER TABLE user_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- 創建允許所有操作的策略（簡單版本）
CREATE POLICY "Allow all operations" ON user_cards FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON user_settings FOR ALL USING (true);
```

### 3. 更新應用程式配置
在 `main.js` 檔案中，將以下行替換為您的實際值：

```javascript
const supabaseUrl = 'YOUR_SUPABASE_URL' // 替換為您的 Supabase URL
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY' // 替換為您的 Supabase anon key
```

## 🔧 資料庫表結構

### `user_cards` 表
| 欄位名稱 | 類型 | 說明 |
|---------|------|------|
| `id` | BIGSERIAL | 主鍵，自動遞增 |
| `english` | TEXT | 英文單字 |
| `chinese` | TEXT | 中文翻譯 |
| `card_type` | TEXT | 卡片分類（'word'=單詞 / 'sentence'=長句，預設'word'） |
| `rating` | INTEGER | 星級評分（0-5星，預設0） |
| `created_at` | TIMESTAMPTZ | 創建時間（自動生成） |

### `user_settings` 表
| 欄位名稱 | 類型 | 說明 |
|---------|------|------|
| `id` | BIGSERIAL | 主鍵，自動遞增 |
| `setting_key` | TEXT | 設置鍵名（唯一） |
| `setting_value` | TEXT | 設置值 |
| `updated_at` | TIMESTAMPTZ | 更新時間（自動生成） |

## 🔄 主要變更

### 從 Firebase 到 Supabase 的變更：
1. **SDK 更換**: 從 Firebase SDK 改為 Supabase JavaScript 客戶端
2. **數據結構**: 從 JSON 陣列改為關聯式資料庫表
3. **API 調用**: 使用 Supabase 的 PostgreSQL API
4. **即時同步**: 使用 Supabase Realtime 替代 Firebase Realtime Database

### 功能保持不變：
- ✅ 新增單字卡
- ✅ 刪除單字卡
- ✅ 即時同步
- ✅ 本地儲存備份
- ✅ 測試按鈕功能
- ✅ 所有 UI 功能

## 🧪 測試功能

應用程式包含兩個測試按鈕：
- **測試存儲**: 測試資料是否能成功保存到 Supabase
- **測試讀取**: 測試是否能從 Supabase 讀取資料

## 🔐 安全性注意事項

目前的設置使用簡單的 RLS 策略允許所有操作。在生產環境中，您可能需要：
1. 實作使用者認證
2. 設置更嚴格的 RLS 策略
3. 限制 anon key 的權限

## 🆘 故障排除

如果遇到問題：
1. 檢查瀏覽器開發者工具的 Console 標籤
2. 確認 Supabase URL 和 key 設置正確
3. 確認資料庫表已正確創建
4. 檢查網路連線

## 📝 初始資料

應用程式會自動創建以下初始單字卡（如果資料庫為空）：
- Hello / 你好
- Thank you / 謝謝
- Good morning / 早安
