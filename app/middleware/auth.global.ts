import type { Session } from '@supabase/supabase-js';

// Keeps signed-out visitors on the sign-in page, and signed-in learners off it.
// The callback page is open to everyone because it is where a sign-in finishes.
const OPEN_PAGES = ['/sign-in', '/auth/callback'];

export default defineNuxtRouteMiddleware((to) => {
  const session = useState<Session | null>('auth-session');
  const isOpen = OPEN_PAGES.includes(to.path);

  if (!session.value && !isOpen) return navigateTo('/sign-in');
  if (session.value && to.path === '/sign-in') return navigateTo('/');
});
