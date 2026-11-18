<script setup lang="ts">
import { LogOut } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const { signOut } = useAuth()
const route = useRoute()

const wide = computed(() => route.meta.wide === true)
const onProgress = computed(() => route.path.startsWith("/progress"))
const tabs = computed(() => [
  { label: "Decks", to: "/", active: !onProgress.value },
  { label: "Progress", to: "/progress", active: onProgress.value },
])
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-background">
    <header class="flex h-22 shrink-0 items-center justify-between gap-4 px-4 sm:px-12">
      <div class="flex min-w-0 items-center gap-4 sm:gap-8">
        <NuxtLink
          to="/"
          class="rounded-sm text-2xl/[30px] font-semibold text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          Recall
        </NuxtLink>
        <nav aria-label="Main" class="flex gap-2">
          <NuxtLink
            v-for="tab in tabs"
            :key="tab.to"
            :to="tab.to"
            :aria-current="tab.active ? 'page' : undefined"
            :class="
              cn(
                'inline-flex h-10 items-center rounded-md border-2 px-4 font-mono text-sm outline-none',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                tab.active
                  ? 'border-ink bg-card font-bold text-foreground'
                  : 'border-transparent font-medium text-muted-foreground hover:text-foreground',
              )
            "
          >
            {{ tab.label }}
          </NuxtLink>
        </nav>
      </div>
      <Button type="button" variant="secondary" aria-label="Sign out" @click="signOut()">
        <LogOut />
        <span class="hidden sm:inline">Sign out</span>
      </Button>
    </header>
    <main :class="cn('mx-auto w-full flex-1 px-4 pb-6 pt-6 sm:px-0', wide ? 'max-w-[1200px]' : 'max-w-[960px]')">
      <slot />
    </main>
    <Toaster />
  </div>
</template>
