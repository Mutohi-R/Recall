const SHOW_FOR_MS = 5000;

export type ToastTone = 'got' | 'missed';

let timer: ReturnType<typeof setTimeout> | undefined;

export function useToast() {
  const message = useState<string>('toast-message', () => '');
  const tone = useState<ToastTone | undefined>('toast-tone', () => undefined);

  function dismiss() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    message.value = '';
    tone.value = undefined;
  }

  function show(text: string, withTone?: ToastTone) {
    if (timer) clearTimeout(timer);
    message.value = text;
    tone.value = withTone;
    timer = setTimeout(dismiss, SHOW_FOR_MS);
  }

  return { message, tone, show, dismiss };
}
