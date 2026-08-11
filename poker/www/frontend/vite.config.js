import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Goの静的配信ディレクトリ(../public)にビルド成果物を出力する。
    // images/やhtml/など既存の静的ファイルは outDir がプロジェクト外のため既定で消されない。
    outDir: '../public',
    emptyOutDir: false,
  },
  server: {
    proxy: {
      // 開発中(vite dev)はGoのWebSocketサーバー(8080番)にプロキシする
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})
