import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Golf App',
        short_name: 'GolfApp',
        description: 'Offline-first Golf Scoring and League App',
        theme_color: '#E3DAC9',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
      '/sync': 'http://localhost:3000',
      '/users': 'http://localhost:3000',
      '/leaderboard': 'http://localhost:3000'
    }
  }
})
