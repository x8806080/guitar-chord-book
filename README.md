# Chord Book — 吉他譜編輯與轉調

純靜態 SPA，可完整部署在 GitHub Pages。ChordPro 編輯器 + 即時排版 + 十二平均律轉調引擎，資料存在瀏覽器 LocalStorage。

## 本機開發

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 單元測試（轉調 / 解析 / 同步合併 / 設定）
npm run test:smoke # 用 jsdom 真的把 UI 掛起來按按鈕
npm run test:all   # 以上全跑（推 code 前跑這個）
npm run build      # 產出 dist/
```

> `vite build` 成功不代表網頁打得開（抓不到 TDZ、undefined component 等執行期錯誤）。
> 推之前請跑 `npm run test:all`，並用 `npm run dev` 肉眼看一次畫面。

## 部署（GitHub Pages）

1. 推上 GitHub（分支 `main`）
2. Repo → **Settings → Pages → Source** 選 **GitHub Actions**
3. Actions 會自動跑 `.github/workflows/deploy.yml`，網址為 `https://<帳號>.github.io/<repo>/`

`base` 由 CI 用 `VITE_BASE=/${repo}/` 自動注入，不需手改 `vite.config.js`。
若使用自訂網域或 `<帳號>.github.io` 根 repo，把 workflow 內 `VITE_BASE` 改成 `/`。

## ChordPro 語法

| 語法 | 說明 |
|---|---|
| `[C]歌詞` | 和弦壓在歌詞正上方 |
| `{title: }` `{artist: }` `{key: }` `{capo: }` | 標頭資訊 |
| `{comment: }` | 段落提示（Intro/Solo…） |
| `{soc}` … `{eoc}` | 副歌（左側銅色標線） |
| `{sot}` … `{eot}` | TAB 六線譜（等寬字、可橫向捲動） |
| `# ...` | 註解，不會渲染 |

## 快捷鍵

`+` 升半音｜`-` 降半音｜`0` 回原調｜編輯器內選取文字按 `[` 直接包成和弦

## 資料與備份

- 儲存：`localStorage` key `gcb.songs.v1`
- 匯出：側欄「匯出備份」→ `chordbook-backup-YYYY-MM-DD.json`
- 匯入：預設 merge（同 id 覆蓋、新 id 新增）

## 多裝置同步（GitHub）

歌譜存成 JSON 放在你自己的 **Private** repo，透過 GitHub Contents API 同步。

1. 建一個 **Private** repo（例：`chordbook-data`），建立時勾 Add a README
2. 改 `src/config.js` 的 `SYNC_DEFAULTS`（owner / repo / path / branch）
3. 產 **Fine-grained PAT**：Repository access 只選該 repo；Permissions → Contents → **Read and write**
4. 網站右上雲朵 → 貼上 token → 儲存。每台裝置各貼一次

### 為什麼 owner/repo 可以進 config.js，token 不行

| 項目 | 能否進程式碼 | 原因 |
|---|---|---|
| owner | ✅ | Pages 網址本來就看得到 |
| repo | ✅ | Private repo 沒 token 進不去，GitHub 一律回 404 |
| **token** | ❌ **絕對不行** | 會被 secret scanning 自動撤銷，且 F12 就看得到 |

`npm test` 內含防手滑檢查：`config.js` 出現疑似 token 字串會直接讓測試失敗。

### 合併策略

逐首 last-write-wins（比對 `updatedAt`），不是整包覆蓋 —— 兩台各改不同的歌都會保留。
刪除採墓碑（`deletedAt`），避免同步後歌曲復活；墓碑 30 天後清除。

## 未來接雲端

`src/lib/storage.js` 是唯一的資料存取層。改接 Firebase / Supabase 時只換這支檔案的實作，
維持 `listSongs / saveSong / deleteSong / exportJSON / importJSON` 介面，元件完全不用動。
