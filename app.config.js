// 動態 Expo 設定。
// 平時等同 app.json；只有在設定 EXPO_WEB_BASE_URL 時（GitHub Pages 子路徑部署）
// 才為 web 注入 baseUrl，原生（iOS/Android）建置完全不受影響。
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_WEB_BASE_URL;
  if (baseUrl) {
    config.experiments = { ...(config.experiments || {}), baseUrl };
  }
  return config;
};
