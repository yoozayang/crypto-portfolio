# crypto-portfolio
## 資料寫入（財務紀錄）

- 交易、出入金／轉帳、策略結算一律經 `records.js` 的 `commitChange(before, after)` 寫入 Supabase：
  只送出這次表單實際新增／修改／刪除的紀錄，Supabase 確認後才更新本機快取、才重新整理頁面。
- 修改與刪除是條件式寫入（雲端內容需等於表單載入時的內容，且以 `updated_at` 做 compare-and-swap），
  其他分頁或裝置先改過的紀錄不會被覆寫，會顯示衝突訊息。
- 寫入失敗或被中斷的變更記在 localStorage `cryptoPortfolioPendingWrites`，頁面上方會列出，可「重試寫入」、下載或捨棄。
- `saveState()` 只存本機設定（價格、投資計畫、Snapshot），不會寫財務紀錄。

## 修改 JS / CSS 後

```
node tools/stamp-build.mjs   # 同步更新 records.js BUILD、version.json、index.html 的 ?v=
npm test                     # 單元與模組結構測試
npm run test:e2e             # Chrome 端對端測試（Supabase 以假資料取代，不寫入正式資料）
```

模組之間一律用 `./records.js` 這種不帶 `?v=` 的路徑匯入，版本只由 index.html 的 import map 控制，
避免同一模組因 URL 不同而載入多份、各自持有不同狀態。頁面送出前會比對 `version.json`，舊版頁面不能寫入。
