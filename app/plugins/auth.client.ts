import { createClient, type Session } from '@supabase/supabase-js';

export default defineNuxtPlugin({
  name: 'auth',
  async setup() {
    const { supabaseUrl, supabasePublishableKey } = useRuntimeConfig().public;
    if (!supabaseUrl || !supabasePublishableKey) {
      throw new Error(
        'Supabase is not configured. Set NUXT_SUPABASE_URL and NUXT_SUPABASE_PUBLISHABLE_KEY in .env.',
      );
    }

    const supabase = createClient(supabaseUrl, supabasePublishableKey, {
      auth: { flowType: 'pkce' },
    });

    const session = useState<Session | null>('auth-session', () => null);
    const signingOut = useState('auth-signing-out', () => false);

    const { data } = await supabase.auth.getSession();
    session.value = data.session;

    // Keep the session up to date as the library refreshes or ends it. Nothing
    // else is called on the client inside this function, which the library
    // does not allow.
    supabase.auth.onAuthStateChange((_event, next) => {
      session.value = next;
    });

    // A session that ends without the learner pressing "Sign out" (it expired,
    // or was ended in another tab) sends them to the sign-in page with a reason.
    const router = useRouter();
    watch(session, (now, before) => {
      if (before && !now && !signingOut.value) {
        router.replace({ path: '/sign-in', query: { reason: 'expired' } });
      }
    });

    return { provide: { supabase } };
  },
});
