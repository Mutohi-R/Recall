export function useFontsReady() {
  const ready = ref(false);
  onMounted(async () => {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {
      // draw with whatever fonts are there
    }
    ready.value = true;
  });
  return ready;
}
