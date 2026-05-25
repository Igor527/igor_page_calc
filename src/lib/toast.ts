export type ToastKind = 'info' | 'success' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
}

type ToastListener = (items: ToastItem[]) => void;

const DEFAULT_DURATION_MS: Record<ToastKind, number> = {
  info: 5000,
  success: 5000,
  error: 8000,
};

let items: ToastItem[] = [];
const listeners = new Set<ToastListener>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((fn) => fn([...items]));
}

function removeToast(id: string) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  const next = items.filter((x) => x.id !== id);
  if (next.length !== items.length) {
    items = next;
    emit();
  }
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  listener([...items]);
  return () => listeners.delete(listener);
}

export function dismissToast(id: string) {
  removeToast(id);
}

export function showToast(message: string, kind: ToastKind = 'info', durationMs?: number) {
  const trimmed = message.trim();
  if (!trimmed) return;
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item: ToastItem = { id, message: trimmed, kind };
  items = [...items, item];
  emit();
  const ms = durationMs ?? DEFAULT_DURATION_MS[kind];
  timers.set(
    id,
    setTimeout(() => removeToast(id), ms)
  );
}

export function toastInfo(message: string) {
  showToast(message, 'info');
}

export function toastSuccess(message: string) {
  showToast(message, 'success');
}

export function toastError(message: string) {
  showToast(message, 'error');
}
