# 部署手冊 — 裝到自己手機用

目標:把「植富 3000」裝到**你自己的 iPhone 與 Android 手機**長期使用(你是唯一使用者)。
打包用 [EAS Build](https://docs.expo.dev/build/introduction/)(Expo 的雲端打包服務,**不需要 Mac**)。

> 以下指令請在**你自己的電腦**執行(雲端開發環境因網路政策無法打包)。
> 本專案已備好 `eas.json`,profile 都設定好了,你照著跑即可。

---

## 0. 一次性準備

```bash
npm i -g eas-cli          # 安裝 EAS 工具
eas login                 # 登入(到 https://expo.dev 免費註冊)
eas init                  # 把專案與你的 Expo 帳號連結(會寫入 projectId)
```

`eas init` 會自動在 `app.json` 補上 `extra.eas.projectId` 與 `owner`,提交一次即可。

---

## 🤖 Android(最省事,零額外費用)

```bash
eas build -p android --profile preview
```

- 雲端打包約 10–20 分鐘,完成後終端機 / 網頁會給一個**下載連結**。
- 用 Android 手機開啟連結 → 下載 `.apk` → 點開安裝。
- 第一次安裝會要你允許「安裝未知來源的應用程式」,開啟即可。
- 之後要更新:重跑同一行指令,再下載新 APK 覆蓋安裝(資料會保留)。

> `preview` profile 已設 `"buildType": "apk"`,所以產出的是可直接安裝的 APK,而非商店用的 AAB。

---

## 🍎 iPhone / iOS(需 Apple Developer 帳號 $99/年)

Apple 規定:要把 App 裝到實機,一定要有付費的開發者帳號。沒有 Mac 也沒關係,EAS 在雲端幫你編譯與簽章。

### 做法 A:TestFlight(推薦,最穩定)

```bash
eas build -p ios --profile production
eas submit -p ios            # 上傳到 App Store Connect
```

- 上傳後到 [App Store Connect](https://appstoreconnect.apple.com/) → TestFlight,把自己加為測試者。
- 手機裝 **TestFlight** App,即可安裝「植富 3000」。
- 之後更新只要重新 build + submit,TestFlight 會通知你更新。

### 做法 B:Ad-hoc 直裝(不經 TestFlight)

```bash
eas device:create            # 註冊你的 iPhone(掃 QR 安裝描述檔)
eas build -p ios --profile preview
```

- `preview` profile 走 internal distribution,打包完給安裝連結,用已註冊的 iPhone 開啟即可裝。
- 限制:只能裝在事先註冊過的裝置;每次新增裝置要重新 build。

> 首次 iOS 打包時,EAS 會問憑證(certificate / provisioning profile)——直接讓 **EAS 自動管理(建議)** 即可,它會用你的 Apple 帳號自動產生。

---

## 🔄 之後改程式怎麼更新?

兩種:

1. **重新打包**(改了原生相關設定、升級 SDK 時必須):重跑上面的 `eas build`。
2. **OTA 熱更新**(只改了 JS / 畫面 / 邏輯,最快):
   ```bash
   eas update --channel preview     # 或 production
   ```
   已安裝的 App 下次開啟就會自動抓到新版,不必重裝。

---

## ⚠️ 正式長期使用前建議補完

這是可運行原型。長期當主力財務 App 前,規格裡這幾項值得先做:

- **本機加密**(`expo-secure-store` 存金鑰 + 加密 AsyncStorage 內容)
- **雲端備份**(iCloud / Google Drive,換手機才不會遺失 30 年資料)
- **低干擾推播**(`expo-notifications`:超支警示、靜默扣款通知)
- 真實大盤指數 / 匯率串接

需要的話我可以接著幫你實作其中任一項。

---

## 常見問題

| 問題 | 解法 |
|------|------|
| `eas: command not found` | 先 `npm i -g eas-cli`,或改用 `npx eas-cli ...` |
| Android 裝不了「未知來源」 | 設定 → 應用程式 → 允許此來源安裝 |
| iOS build 卡在憑證 | 選擇讓 EAS 自動管理憑證;確認 Apple Developer 帳號已付費生效 |
| 想先免費看畫面 | `npm run web` 或部署網頁版(見 `README.md`) |
