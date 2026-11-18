// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  spaLoadingTemplate: true,
  runtimeConfig: {
    supabaseUrl: process.env.NUXT_SUPABASE_URL,
    supabasePublishableKey: process.env.NUXT_SUPABASE_PUBLISHABLE_KEY,
    supabaseSecretKey: process.env.NUXT_SUPABASE_SECRET_KEY,
    public: {
      supabaseUrl: process.env.NUXT_SUPABASE_URL,
      supabasePublishableKey: process.env.NUXT_SUPABASE_PUBLISHABLE_KEY,
    }
  },
  modules: ['shadcn-nuxt'],
  shadcn: { prefix: '', componentDir: '@/components/ui'},
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
});
