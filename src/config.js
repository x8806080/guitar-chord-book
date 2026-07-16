/**
 * config.js — 專案層級的預設值
 *
 * ⚠️ 這個檔案會被打包進前端 JS，全世界看得到。
 *    只能放「不是機密」的東西。
 *
 *    owner / repo 不是機密：
 *      - owner 從你的 Pages 網址就看得出來
 *      - repo 是 Private，沒有 token 誰都進不去（GitHub 對無權限的 private repo
 *        一律回 404，連存在與否都不洩漏）
 *
 *    ❌ token 絕對不可以放這裡。放了會被 GitHub secret scanning 自動撤銷，
 *       而且任何人打開 F12 就看得到。token 只能由使用者在每台裝置手動輸入。
 *
 * 👉 如果你 fork 這個專案，改這裡就好。
 */
export const SYNC_DEFAULTS = {
  owner: 'x8806080',
  repo: 'chordbook-data',
  path: 'songs.json',
  branch: 'main',
};
