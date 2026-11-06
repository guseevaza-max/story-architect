"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addToast, removeToast, toastTtl, type ToastItem, type ToastKind } from "@/lib/ux/toast";

type Api = { success: (text: string) => void; error: (text: string) => void; info: (text: string) => void };
const NOOP: Api = { success: () => {}, error: () => {}, info: () => {} };
const Ctx = createContext<Api>(NOOP);

/** Уведомления снизу слева. Вне провайдера вызовы ничего не делают. */
export function useToast(): Api {
  return useContext(Ctx);
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => removeToast(list, id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (kind: ToastKind, text: string) => {
      const id = nextId.current++;
      setItems((list) => addToast(list, { id, kind, text }));
      timers.current.set(id, setTimeout(() => dismiss(id), toastTtl(kind)));
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const api = useMemo<Api>(() => ({ success: (t) => push("success", t), error: (t) => push("error", t), info: (t) => push("info", t) }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="sa-toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`sa-toast sa-toast-${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
            <span>{t.text}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Закрыть уведомление" className="sa-toast-x">
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
