# 植富 3000 (WealthTree 3000)

> 為長期投資者打造的**反焦慮**記帳與目標管理 App。
> 用「植物生長」的視覺回饋取代冷冰冰的帳面損益，把注意力從「市場波動」轉移到「紀律執行」。

這是一個以 **Expo (React Native)** 打造的**可運行原型**，同時支援 **iOS / Android / Web**。
核心目標：在 30 年後（64 歲）培育出象徵 3,000 萬資產的「千年神木」。

完整產品規格見 [`SPEC.md`](./SPEC.md)。

---

## 快速開始

```bash
npm install

# 手機（掃 QR code，需安裝 Expo Go）
npm start

npm run ios       # iOS 模擬器（需 macOS）
npm run android   # Android 模擬器
npm run web       # 瀏覽器預覽
```

> 環境：Node 22、Expo SDK 56、React 19、React Native 0.85。
> 原型資料**只存在裝置本機**（AsyncStorage），開發方伺服器不留存任何明碼財務數據。

---

## 四大模組（對應規格）

| 分頁 | 模組 | 內容 |
|------|------|------|
| 🌳 溫室總覽 | Dashboard | 30 年生長進度條、生命週期階段、財富樹主視覺、天氣（季節）系統、年輪與陪伴動物 |
| 💧 水源分配 | 預算與現金流 | 每月淨流 5 萬分配、投資 / 房貸**防呆鎖定**（需密碼）、極簡記帳、桌面小工具預覽（只顯示剩餘餘額） |
| 🎁 時光溫室 | 投資與資產追蹤 | **盲盒模式**（不顯示日 / 週損益）、月度解鎖生長報告（股債比例、實際市值）、第 15 年再平衡提醒 |
| 🌪️ 暴風雨 | 壓力測試與心理建設 | 時光快轉（複利投影動畫）、歷史風暴模擬（2008 / 2020，狂搖落葉後復原更高大） |

## 植物系統：財務行為 → 樹的生長

| 財務行為 | 視覺對應 | 程式位置 |
|----------|----------|----------|
| 總資產（投資＋房屋淨值） | 樹苗 → 小樹 → 大樹 → 巨木 → 千年神木 | `growthFactor`, `currentStage` |
| 每月投資 2 萬（陽光水分） | 樹冠長新葉、散發光芒 | `monthlyInvest` |
| 房貸還款 2 萬（樹根系統） | 根系在土壤中扎得更深 | `rootDepth`, `makeRoots` |
| 生活費控管（葉片狀態） | 預算內翠綠；超支轉黃掉落 | `leafHealth`, `makeFallingLeaves` |
| 連續 12 個月紀律（年輪） | 樹幹增加一圈年輪 + 解鎖陪伴動物 | `rings`, `unlockedCompanions` |
| 大盤長期趨勢（天氣） | 春夏繁盛 / 秋冬落葉 | `seasonFromTrend`, `seasonInfo` |

## 專案結構

```
App.tsx                       # 根元件：分頁外殼 + Provider
src/
  theme.ts                    # 大地色系 + 多層次綠的設計 token
  store/
    finance.ts                # 領域邏輯（純函式）：資產、生長階段、投影、風暴情境
    AppContext.tsx            # 全域狀態 + AsyncStorage 本機持久化
  components/
    WealthTree.tsx            # 核心視覺：以 SVG 把財務狀態畫成一棵樹
    TabBar.tsx                # 自製底部分頁列（零導航依賴）
    ui.tsx                    # 共用元件：卡片、進度條、按鈕、藥丸標籤
  screens/
    DashboardScreen.tsx       # 溫室總覽
    BudgetScreen.tsx          # 水源分配器
    GreenhouseScreen.tsx      # 時光溫室
    StormScreen.tsx           # 暴風雨模擬器
```

## 原型已實作 vs 待補

**已實作**：四大模組畫面、財富樹 SVG（生長 / 根系 / 季節 / 葉片健康 / 年輪 / 陪伴動物 / 風暴傾斜）、
本機持久化、防呆密碼鎖、盲盒模式、月度結算與複利成長、複利快轉與歷史風暴動畫。

**待補（正式版）**：本機端加密與 iCloud / Google Drive 備份、真實大盤指數 / 匯率串接（每月短暫連網）、
低干擾系統推播（超支警示、靜默扣款通知）、原生桌面 Widget。

## 驗證狀態

- ✅ `npx tsc --noEmit` 型別檢查通過
- ✅ `npx expo export --platform web` 完整打包成功（318 modules，無錯誤）
- ✅ 本機靜態伺服器可正常提供頁面與 JS bundle

> 註：本開發環境的網路政策未開放瀏覽器二進位下載，故未附自動截圖；
> 請以 `npm run web` 或 `npm run ios/android` 在本機實際預覽互動。
