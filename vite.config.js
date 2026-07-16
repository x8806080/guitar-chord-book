import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base 說明：
//  - 本機開發 / 自訂網域 / <user>.github.io 根網域 → '/'
//  - 專案型 GitHub Pages（https://<user>.github.io/<repo>/）→ '/<repo>/'
// CI 會用 `vite build --base=/${repo}/` 自動注入，本機則吃 .env 的 VITE_BASE，
// 兩者都沒有時退回 '/'，所以你「不需要」為了部署手動改這支檔案。
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: mode !== 'production',
  },
}));
