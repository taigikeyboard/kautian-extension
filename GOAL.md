# Sutian+ — 教育部臺灣台語辭典增強搜尋

## 目標

為 https://sutian.moe.edu.tw/ 的搜尋框加上增強搜尋 browser extension
（模式參考 `vendor/ebird-extension`）。

## Part 1：增強搜尋（進行中）

需求：

1. Fuzzy search（容錯拼寫、無聲調比對）
2. Regex search（`/pattern/` 語法）
3. 羅馬字大小寫不拘
4. 多輸入系統：白話字（POJ）、教育部台羅（TL）、漢字、方音符號（TPS）、注音相似音

進度：

- [x] 設計計劃：`IMPLEMENTATION_PLAN.md`（原訂交 codex review，已改為直接實作）
- [x] Stage 1：資料管線（`scripts/build-data.mjs` → `data/kautian.min.json`）
- [x] Stage 2：查詢解讀 + 搜尋引擎（`src/search/`，純函式 + node:test，19/19 綠）
- [x] Stage 3：Extension shell + UI（`src/content/`、manifest、esbuild）
- [ ] Stage 4：整合驗證與打包（zip 已產出；授權已確認 CC BY-ND 3.0 TW ✅，README 已加姓名標示與非官方聲明；待真站手動驗證、icons、商店頁姓名標示）
- [x] 效能優化：`PERF_EVALUATION.md` 方案 C+（資料 -40%、冷啟動 -55%、無 Map lazy 索引）
- [x] 詞條直連（格式 v3）：從 kautian.ods join 詞目 id，點擊直連 `/su/<id>/`；選單僅含詞目詞（含又唸作/俗唸作/合音唸作/異用字，依 id 去重）；移除 tag badge；資料再降至 3.08MB

## Part 2：羅馬字 hover popup（Part 1 上架後才開始）

教育部網站沒有提供白話字跟方音符號——滑鼠移到教育部羅馬字上時，
以 popup 顯示對應的白話字（POJ）與方音符號（TPS）。
接口備註見 `IMPLEMENTATION_PLAN.md` §14。

## 資源

- `kautian.csv` / `kautian.ods`：詞庫 raw data（57,379 筆，TL/POJ/漢字/TPS 四表示法齊全）
- `vendor/taigi-converter`（submodule）：台語羅馬字/方音符號轉換（runtime 僅 deep import `src/phonetics.js`）
- `vendor/ebird-extension`（submodule）：架構參考（增強而非取代原站搜尋框）
