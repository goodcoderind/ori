import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  cacheDir: path.resolve(__dirname, '.vite-cache'),
  // NOTE: Do NOT add build.rollupOptions.input here.
  // CRXJS reads content_scripts and background from manifest.json and handles
  // them as Vite entry points automatically. Adding a manual input bypasses
  // the React plugin transform and breaks JSX parsing in those files.
})
