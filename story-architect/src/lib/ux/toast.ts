/** Короткие уведомления: чистая логика списка и времени показа. */
export type ToastKind = "success" | "error" | "info";
export type ToastItem = { id: number; kind: ToastKind; text: string };

/** Добавляет уведомление; одинаковый текст подряд не дублируется, всего не больше max. */
export function addToast(list: ToastItem[], toast: ToastItem, max = 3): ToastItem[] {
  const last = list[list.length - 1];
  if (last && last.kind === toast.kind && last.text === toast.text) return [...list.slice(0, -1), toast];
  return [...list, toast].slice(-max);
}

export function removeToast(list: ToastItem[], id: number): ToastItem[] {
  return list.filter((t) => t.id !== id);
}

/** Сколько миллисекунд показывать: ошибки дольше, чтобы успеть прочитать. */
export function toastTtl(kind: ToastKind): number {
  return kind === "error" ? 8000 : 3500;
}
