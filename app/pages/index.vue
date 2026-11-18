<script setup lang="ts">
const { user, signOut } = useAuth()
</script>

<template>
  <div class="p-8">
    <p>Signed in as {{ user?.email }}</p>
    <button class="underline" @click="signOut()">Sign out</button>
  </div>
</template>