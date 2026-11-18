export function useCooldown() {
  const remaining = ref(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  function stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  function start(seconds: number) {
    stop();
    const endsAt = Date.now() + seconds * 1000;
    remaining.value = seconds;
    timer = setInterval(() => {
      remaining.value = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (remaining.value === 0) stop();
    }, 250);
  }

  onScopeDispose(stop);

  return { remaining, start };
}
