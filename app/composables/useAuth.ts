import type { Session } from '@supabase/supabase-js';

// What the pages need from authentication: who is signed in, the token to send
// to the API, and the ways to sign in and out.
export function useAuth() {
  const { $supabase } = useNuxtApp();
  const session = useState<Session | null>('auth-session', () => null);
  const signingOut = useState('auth-signing-out', () => false);

  const user = computed(() => session.value?.user ?? null);
  const accessToken = computed(() => session.value?.access_token ?? null);

  // Where Google and the email link send the learner back to.
  const callbackUrl = () => `${window.location.origin}/auth/callback`;

  // Leaves this page for Google. When the learner comes back, the library
  // finishes the sign-in and the callback page takes over.
  async function signInWithGoogle() {
    const { error } = await $supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    });
    return { error };
  }

  // Asks Supabase to email a one-time link. The first sign-in creates the
  // account, as the sign-in page says.
  async function sendEmailLink(email: string) {
    const { error } = await $supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true },
    });
    return { error };
  }

  async function signOut() {
    signingOut.value = true;
    try {
      await $supabase.auth.signOut();
      await navigateTo('/sign-in');
    } finally {
      signingOut.value = false;
    }
  }

  return {
    session,
    user,
    accessToken,
    signInWithGoogle,
    sendEmailLink,
    signOut,
  };
}
