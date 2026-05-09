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
      },
      workbox: {
        // SPA: route navigations to index.html when offline so /scores, /league etc. don't 404
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/auth\//,
          /^\/sync$/,
          /^\/courses(\/|$)/,
          /^\/leaderboard\//,
          /^\/users(\/|$)/,
        ],
        // Don't precache full course/leaderboard payloads — runtimeCaching handles them on demand
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            // Read-only API endpoints: NetworkFirst with cache fallback for offline
            urlPattern: ({ request, url, sameOrigin }) => {
              if (!sameOrigin || request.method !== 'GET') return false;
              return (
                url.pathname === '/courses' ||
                url.pathname.startsWith('/leaderboard/') ||
                /^\/api\/user\/\d+\/(activity|full-sync)$/.test(url.pathname) ||
                /^\/api\/league\//.test(url.pathname)
              );
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'golf-api-cache-v1',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Static images / icons fetched at runtime
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'golf-image-cache-v1',
              expiration: { maxEntries: 100, maxAgeSeconds: 90 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
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
