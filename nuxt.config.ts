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

  supabase: {
    // The sign-in screen is rendered by the app itself at '/', and the workspace is
    // gated by the account-approval check, so there is no /login route to redirect to.
    // The module's `auth-redirect` plugin is a GLOBAL route middleware: left at its
    // default it 302s every non-excluded path (including '/') to '/login' as soon as
    // there is no session — harmless while the app had no router, but it made every
    // one of the new pages unreachable, starting with the sign-in screen.
    redirect: false
  },

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
        { name: 'Le mie attività', short_name: 'Attività', url: '/?focus=new' },
        { name: 'Nuova nota', short_name: 'Nota', url: '/notes?focus=new' }
      ],
      // Long-pressing the icon offers the shortcuts above; `navigate-existing`
      // reuses the window that is already open instead of stacking a second copy
      // of the app (Android may otherwise end up with several).
      launch_handler: { client_mode: 'navigate-existing' },
      // "Share → ShareToDo" from another Android app opens /share with what was
      // shared in the query string; see `middleware/share-target.global.ts`.
      share_target: {
        action: '/share',
        method: 'GET',
        params: {
          title: 'title',
          text: 'text',
          url: 'url'
        }
      },
      // Shown in Chrome's richer install sheet on Android. `form_factor: narrow`
      // is what makes them count as phone screenshots.
      screenshots: [
        {
          src: '/screenshots/attivita.png',
          sizes: '780x1688',
          type: 'image/png',
          form_factor: 'narrow',
          label: 'Attività, gruppi e avanzamento della giornata'
        },
        {
          src: '/screenshots/gruppo.png',
          sizes: '780x1688',
          type: 'image/png',
          form_factor: 'narrow',
          label: 'Un gruppo con le sue attività e le sue note'
        },
        {
          src: '/screenshots/note.png',
          sizes: '780x1688',
          type: 'image/png',
          form_factor: 'narrow',
          label: 'Le note, condivise per gruppo'
        }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
      /**
       * Both folders below match the pattern above but must not be precached:
       * - `/screenshots` are install-sheet artwork for the Android prompt (~680 KB),
       * - `/splash` are the iOS launch screens (~500 KB). iOS fetches the single
       *   image matching the device, and the image runtime cache below keeps it for
       *   the next launch, so precaching all 24 would only slow the first visit.
       */
      globIgnores: ['**/screenshots/**', '**/splash/**'],
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
