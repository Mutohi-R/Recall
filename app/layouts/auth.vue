<template>
  <div class="flex min-h-dvh flex-col bg-background">
    <header class="flex h-22 shrink-0 items-center px-4 sm:px-12">
      <span class="text-2xl/[30px] font-semibold text-foreground">Recall</span>
    </header>
    <main class="flex flex-1 items-center justify-center px-4 pb-16">
      <slot />
    </main>
  </div>
</template>