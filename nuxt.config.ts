// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  spaLoadingTemplate: true,
  runtimeConfig: {
    supabaseUrl: '',
    supabasePublishableKey: '',
    supabaseSecretKey: '',
    public: {
      supabaseUrl: '',
      supabasePublishableKey: '',
    }
  },
  modules: ['shadcn-nuxt'],
  shadcn: { prefix: '', componentDir: '@/components/ui'},
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
});
