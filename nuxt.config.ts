// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  telemetry: false,

  fonts: {
    providers: {
      google: false,
      bunny: false,
      fontshare: false,
      fontsource: false
    }
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'it'
      },
      meta: [
        // viewport-fit=cover so the PWA can paint under the iOS home indicator.
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#047857' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'ShareToDo' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'format-detection', content: 'telephone=no' }
      ],
      link: [
        // With SSR there is no index.html for the build plugin to inject into, so
        // the manifest link has to be declared here by hand — without it no browser
        // (desktop Chrome/Edge included) ever sees the manifest and `installable`
        // never becomes true.
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico', sizes: 'any' },
        // iOS ignores the web manifest icons for the home screen.
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' }
      ]
    }
  },

  colorMode: {
    preference: 'system',
    fallback: 'light',
    classSuffix: ''
  },

  modules: ['@nuxtjs/supabase', '@nuxt/ui', '@vite-pwa/nuxt'],

  pwa: {
    registerType: 'autoUpdate',
    registerWebManifestInRouteRules: true,
    devOptions: {
      enabled: false,
      suppressWarnings: true
    },
    // `installPrompt` relaxes the module's own dismiss flag, so the app can drive
    // its own "Installa app" button instead of the built-in banner.
    client: {
      installPrompt: 'nuxt-todo:install-dismissed'
    },
    manifest: {
      id: '/',
      name: 'ShareToDo — Attività e condivisione',
      short_name: 'ShareToDo',
      description: 'Gestisci attività, sottogruppi e liste condivise, anche da mobile.',
      lang: 'it',
      dir: 'ltr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      orientation: 'any',
      background_color: '#f8fafc',
      theme_color: '#047857',
      categories: ['productivity', 'utilities'],
      prefer_related_applications: false,
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ],
      shortcuts: [
        { name: 'Le mie attività', short_name: 'Attività', url: '/?focus=new' }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api/],
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          // Authenticated Supabase traffic must never be served from cache.
          urlPattern: ({ url }) => url.hostname.endsWith('supabase.co'),
          handler: 'NetworkOnly'
        },
        {
          // SSR shells: fresh when online, cached shell when offline.
          urlPattern: ({ request }) => request.mode === 'navigate',
          handler: 'NetworkFirst',
          options: {
            cacheName: 'pages',
            networkTimeoutSeconds: 5,
            expiration: {
              maxEntries: 20,
              maxAgeSeconds: 60 * 60 * 24
            }
          }
        },
        {
          urlPattern: ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'assets',
            expiration: {
              maxEntries: 80,
              maxAgeSeconds: 60 * 60 * 24 * 30
            }
          }
        },
        {
          urlPattern: ({ request }) => request.destination === 'image',
          handler: 'CacheFirst',
          options: {
            cacheName: 'images',
            expiration: {
              maxEntries: 60,
              maxAgeSeconds: 60 * 60 * 24 * 30
            }
          }
        }
      ]
    },
    includeAssets: ['favicon.ico', 'favicon.svg', 'robots.txt', 'icons/*.png']
  }
})
