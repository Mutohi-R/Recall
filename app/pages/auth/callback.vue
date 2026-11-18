<script setup lang="ts">
import AuthCard from "@/components/AuthCard.vue"
import { Progress } from "@/components/ui/progress"
import { reasonFromCallback } from "@/lib/auth"

// Where Google and the email link send the learner back to (Figma: Signing you
// in). The auth plugin has already finished the sign-in before this page opens,
// so the session is known here: signed in goes to the deck list, otherwise back
// to the sign-in page with the reason.
definePageMeta({ layout: "auth" })

const { session } = useAuth()
const route = useRoute()

// An error from Google or Supabase can come back after ? or after #.
const fromHash = new URLSearchParams(route.hash.replace(/^#/, ""))
const error = (route.query.error as string | undefined) ?? fromHash.get("error") ?? undefined
const errorCode = (route.query.error_code as string | undefined) ?? fromHash.get("error_code") ?? undefined

if (session.value) {
  await navigateTo("/", { replace: true })
} else {
  // No error in the address means the link was used already, expired, or was
  // opened in a different browser from the one that asked for it.
  const reason = reasonFromCallback(error, errorCode) ?? "link"
  await navigateTo({ path: "/sign-in", query: { reason } }, { replace: true })
}
</script>

<template>
  <AuthCard title="Signing you in" subtitle="This takes a moment.">
    <Progress />
  </AuthCard>
</template>