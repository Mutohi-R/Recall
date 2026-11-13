// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  runtimeConfig: {
    supabaseUrl: process.env.NUXT_SUPABASE_URL,
    supabasePublishableKey: process.env.NUXT_SUPABASE_PUBLISHABLE_KEY,
    supabaseSecretKey: process.env.NUXT_SUPABASE_SECRET_KEY,
  },
});
