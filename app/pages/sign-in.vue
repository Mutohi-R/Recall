<script setup lang="ts">
import { nextTick, ref, watch } from "vue"
import { Mail, RotateCw } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AuthCard from "@/components/AuthCard.vue"
import FormField from "@/components/FormField.vue"
import GoogleIcon from "@/components/icons/GoogleIcon.vue"
import LinkButton from "@/components/LinkButton.vue"
import Notice from "@/components/Notice.vue"
import {
  RESEND_SECONDS,
  SIGN_IN_NOTICES,
  isRateLimited,
  isValidEmail,
  sendLinkErrorMessage,
  type SignInReason,
} from "@/lib/auth"

definePageMeta({ layout: "auth" })

type Step = "start" | "email" | "sent"

const route = useRoute()
const router = useRouter()
const { signInWithGoogle, sendEmailLink } = useAuth()
const cooldown = useCooldown()

const reasonParam = typeof route.query.reason === "string" ? route.query.reason : ""
const reason = reasonParam in SIGN_IN_NOTICES ? (reasonParam as SignInReason) : undefined
if (route.query.reason !== undefined) router.replace({ query: {} })

const notice = ref(reason ? SIGN_IN_NOTICES[reason] : "")
// An expired link means the learner was using email, so the form is ready.
const step = ref<Step>(reason === "link" ? "email" : "start")

const email = ref("")
const emailError = ref("")
const sentTo = ref("")
const sending = ref(false)
const googleBusy = ref(false)
const emailInput = ref<{ $el: HTMLElement } | null>(null)

watch(email, () => (emailError.value = ""))

function focusEmail() {
  nextTick(() => emailInput.value?.$el.focus())
}

function showEmailForm() {
  notice.value = ""
  step.value = "email"
  focusEmail()
}

async function continueWithGoogle() {
  if (googleBusy.value) return
  googleBusy.value = true
  notice.value = ""
  const { error } = await signInWithGoogle()
  // On success the browser leaves for Google, so the button stays busy.
  if (error) {
    googleBusy.value = false
    notice.value = "Google sign-in could not start. Try again, or use an email link instead."
  }
}

// Asks for a link. A refusal for asking too often also starts the wait, so the
// button does not invite another try straight away.
async function requestLink(address: string): Promise<boolean> {
  sending.value = true
  notice.value = ""
  const { error } = await sendEmailLink(address)
  sending.value = false
  if (error) {
    notice.value = sendLinkErrorMessage(error)
    if (isRateLimited(error)) cooldown.start(RESEND_SECONDS)
    return false
  }
  sentTo.value = address
  cooldown.start(RESEND_SECONDS)
  return true
}

async function submitEmail() {
  if (sending.value) return
  const address = email.value.trim()
  if (!isValidEmail(address)) {
    emailError.value = "Enter a valid email address, such as you@example.com"
    return
  }
  if (await requestLink(address)) step.value = "sent"
}

async function resend() {
  if (sending.value || cooldown.remaining.value > 0) return
  await requestLink(sentTo.value)
}

function useDifferentEmail() {
  notice.value = ""
  step.value = "email"
  focusEmail()
}
</script>

<template>
  <AuthCard
    v-if="step === 'sent'"
    title="Check your email"
    :subtitle="`A sign-in link was sent to ${sentTo}. Open it on this device to sign in. The link works once.`"
  >
    <Notice v-if="notice" variant="error" :lines="[notice]" />
    <Button
      type="button"
      variant="secondary"
      class="w-full"
      :disabled="sending || cooldown.remaining.value > 0"
      @click="resend"
    >
      <RotateCw />
      Resend link
    </Button>
    <p v-if="cooldown.remaining.value > 0" class="text-sm leading-5 text-muted-foreground">
      You can ask for another link in {{ cooldown.remaining.value }}
      {{ cooldown.remaining.value === 1 ? "second" : "seconds" }}.
    </p>
    <div>
      <LinkButton @click="useDifferentEmail">Use a different email</LinkButton>
    </div>
  </AuthCard>

  <AuthCard v-else title="Sign in to Recall" subtitle="New here? Signing in creates your account.">
    <Notice v-if="notice" variant="error" :lines="[notice]" />

    <Button type="button" variant="secondary" class="w-full" :disabled="googleBusy" @click="continueWithGoogle">
      <GoogleIcon />
      Continue with Google
    </Button>

    <p v-if="step === 'start'" class="flex gap-1.5 text-sm leading-5 text-muted-foreground">
      Prefer not to use Google?
      <LinkButton @click="showEmailForm">Email me a sign-in link</LinkButton>
    </p>

    <template v-else>
      <div class="flex items-center gap-3" role="separator">
        <span class="h-0.5 flex-1 bg-border" />
        <span class="font-mono text-xs text-muted-foreground">or</span>
        <span class="h-0.5 flex-1 bg-border" />
      </div>
      <form class="flex flex-col gap-6" novalidate @submit.prevent="submitEmail">
        <FormField v-slot="field" label="Email" :error="emailError">
          <Input
            v-bind="field"
            ref="emailInput"
            v-model="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="you@example.com"
            :disabled="sending"
          />
        </FormField>
        <Button type="submit" class="w-full" :disabled="sending">
          <Mail />
          Email me a sign-in link
        </Button>
      </form>
    </template>

    <p class="text-sm leading-5 text-muted-foreground">
      Recall records your answers, how long you take to answer and when you review. It uses them to adapt your
      schedule, and for the research this app was built for.
    </p>
  </AuthCard>
</template>