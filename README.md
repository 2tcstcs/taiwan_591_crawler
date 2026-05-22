# 591 售屋觀測站 - 爬蟲與篩選儀表板

這是一個 100% 無伺服器（Serverless）架構的台灣中古屋（591 售屋網）數據爬取與篩選分析儀表板。

本專案利用 GitHub Actions 作為定時任務（Cron Job）自動運行 Python 爬蟲，抓取最新房屋數據並提交至 repository 中，再透過 GitHub Pages 自動部署靜態網頁，為使用者提供精美、流暢的房屋篩選介面。

## 🌟 特色

1. **輕量高效爬蟲**：透過 Session 模擬與 Nuxt.js 狀態評估機制（使用 Node.js 執行 `eval` 轉換），無需啟動重型無頭瀏覽器即可秒級解析最新房源。
2. **自動化託管**：每日定時自動運行爬蟲，更新資料庫並同步重部署網頁，無任何伺服器與維護費用。
3. **精美篩選前端**：精心調校的 HSL 暗黑/明亮主題、玻璃摩登質感樣式、流暢的微動畫，支援：
   - 縣市（台北、新北、桃園、台中）與動態行政區二級連動篩選。
   - 總價與建坪區間篩選（含快捷標籤）。
   - 格局房數、房屋類型篩選與多維度資料排序。
   - 關鍵字即時模糊搜尋（標題、地址、社區名稱）。
   - 觀測儀表板統計指標（平均總價、平均單價、最低總價門檻）。

---

## 📁 檔案結構

```text
taiwan_591_crawler/
├── .github/
│   └── workflows/
│       └── crawl.yml    # GitHub Actions 自動化工作流
├── crawler.py           # 爬蟲主程式 (Python 3)
├── nuxt_parser.js       # Nuxt.js 數據解析器 (Node.js)
├── index.html           # 前端儀表板介面
├── index.css            # 精美版面設計與動畫
├── app.js               # 前端互動、篩選與統計邏輯
├── data.json            # 爬取出的房屋資料庫 (自動生成)
└── README.md            # 專案說明文件
```

---

## 💻 本地運行指南

若您想在本地執行爬蟲並瀏覽前端網頁，請按照以下步驟操作：

### 1. 準備環境
確保您的電腦上已安裝：
- **Python 3.x**
- **Node.js** (用於解析 Nuxt 網頁狀態)

### 2. 安裝 Python 套件
在專案根目錄下，開啟終端機並安裝 `requests` 套件：
```bash
pip install requests
```

### 3. 執行爬蟲
執行以下指令開始爬取 591 中古屋資料，這將會在專案目錄下生成/更新 `data.json` 檔案：
```bash
python crawler.py
```

### 4. 開啟前端網頁
為避免瀏覽器 CORS 限制，建議透過本地靜態伺服器開啟網頁：
* **使用 Python（最快）**:
  ```bash
  python -m http.server 8000
  ```
  接著在瀏覽器打開 [http://localhost:8000](http://localhost:8000)。
  
* **使用 Node.js (`npx`)**:
  ```bash
  npx serve .
  ```
  接著根據控制台提示，在瀏覽器打開網頁。

---

## 🚀 部署至 GitHub (Actions & Pages)

要將此系統部署上線，使其每天自動更新房屋數據，請按照以下步驟設定：

### 1. 上傳程式碼至 GitHub
1. 在 GitHub 上建立一個新的、空的 Repository（例如命名為 `taiwan-591-crawler`）。
2. 在您的本地終端機中，切換到 `taiwan_591_crawler` 目錄，初始化 Git 並推送至 GitHub：
   ```bash
   git init
   git add .
   git commit -m "Initialize project"
   git branch -M main
   git remote add origin https://github.com/您的帳號/taiwan-591-crawler.git
   git push -u origin main
   ```

### 2. 設定 GitHub Pages
1. 進入您在 GitHub 上的 Repository 頁面。
2. 點擊頂部的 **Settings** 標籤頁。
3. 在左側選單中找到並點擊 **Pages**。
4. 在 **Build and deployment** 底下的 **Source** 選項中，將原本的 `Deploy from a branch` 改選為 **`GitHub Actions`**。

### 3. 測試自動部署
1. 點擊 Repository 頂部的 **Actions** 標籤頁。
2. 在左側工作流列表中，點擊 **`Crawl 591 Sale Listings`**。
3. 點擊右側的 **`Run workflow`** 按鈕，然後點擊綠色的 **`Run workflow`** 送出。
4. 工作流將會開始執行，它會：
   - 下載程式碼。
   - 執行 `python crawler.py` 抓取最新數據。
   - 自動將更新的 `data.json` commit 並 push 回 Repository。
   - 自動上傳檔案並部署到 GitHub Pages。
5. 執行完成後，您可以在 Actions 頁面看到部署成功的網址（格式通常為：`https://您的帳號.github.io/taiwan-591-crawler/`）。

現在，本系統將會在**每天台北時間早上 10:00** 自動運行爬蟲並發布最新房屋資料至您的網頁！

---

## ⚠️ 聲明與免責條款
- 本專案純屬個人技術學習、研究與學術交流用途。
- 本專案無任何商業利益或營利意圖，亦不提供任何商業分析服務。
- 專案中所爬取之所有房屋資訊、圖片、文字標題等，版權與財產權皆歸屬於**數字科技股份有限公司及 591 房屋交易網**所有。請勿將抓取到的資料用於商業營利、二次散佈或任何違反智慧財產權與法律規範之用途。
