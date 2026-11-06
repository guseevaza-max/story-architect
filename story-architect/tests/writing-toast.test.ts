import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addToast, removeToast, toastTtl, type ToastItem } from "../src/lib/ux/toast";
import { isSaveShortcut, wordsLabel } from "../src/lib/ux/writing";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const C = "src/app/projects/[id]/chapters/[chapterId]/";
const t = (id: number, text = "x", kind: ToastItem["kind"] = "success"): ToastItem => ({ id, kind, text });

describe("уведомления: список и время", () => {
  it("не больше трёх, старые вытесняются", () => {
    let l: ToastItem[] = [];
    for (let i = 1; i <= 5; i++) l = addToast(l, t(i, `т${i}`));
    expect(l.map((x) => x.id)).toEqual([3, 4, 5]);
  });
  it("одинаковый текст подряд заменяет предыдущий, а не множится", () => {
    const l = addToast(addToast([], t(1, "Сохранено")), t(2, "Сохранено"));
    expect(l).toEqual([t(2, "Сохранено")]);
    expect(addToast(l, t(3, "Сохранено", "error"))).toHaveLength(2);
  });
  it("закрытие и время показа: ошибки дольше", () => {
    expect(removeToast([t(1), t(2)], 1)).toEqual([t(2)]);
    expect(toastTtl("error")).toBeGreaterThan(toastTtl("success"));
  });
});

describe("режим письма: помощники", () => {
  it("Ctrl+S и Cmd+S", () => {
    expect(isSaveShortcut({ key: "s", ctrlKey: true, metaKey: false })).toBe(true);
    expect(isSaveShortcut({ key: "S", ctrlKey: false, metaKey: true })).toBe(true);
    expect(isSaveShortcut({ key: "s", ctrlKey: false, metaKey: false })).toBe(false);
  });
  it("склонение «слово»", () => {
    expect([0, 1, 2, 4, 5, 11, 12, 21, 22, 25, 111].map(wordsLabel)).toEqual(["0 слов", "1 слово", "2 слова", "4 слова", "5 слов", "11 слов", "12 слов", "21 слово", "22 слова", "25 слов", "111 слов"]);
  });
});

describe("режим письма и уведомления в интерфейсе", () => {
  const editor = read(C + "DraftEditor.tsx");
  it("редактор: режим письма на весь экран с Esc и Ctrl+S, тот же текст и то же сохранение", () => {
    expect(editor).toContain("Режим письма");
    expect(editor).toContain('e.key === "Escape"');
    expect(editor).toContain("isSaveShortcut(event)");
    expect(editor).toContain("onClick={handleSave}");
    expect((editor.match(/<textarea/g) ?? []).length).toBe(2); // основной редактор и поле комментария к пометке
    expect(editor).toContain("document.body.style.overflow");
  });
  it("прежние строки статуса и защита несохранённого остались", () => {
    expect(editor).toContain("✓ Сохранено");
    expect(editor).toContain("beforeunload");
    expect(editor).toContain("const dirty = !saved && text !== initialText");
  });
  it("уведомления: провайдер в корне, вызовы в редакторе и кнопках утверждения", () => {
    expect(read("src/app/layout.tsx")).toContain("<ToastProvider>");
    expect(editor).toContain("toast.error(error)");
    expect(editor).toContain('toast.success("Черновик сохранён")');
    expect(read(C + "ApproveChapterButton.tsx")).toContain('toast.success("Глава утверждена")');
    expect(read(C + "CanonChapterButton.tsx")).toContain('toast.success("Глава переведена в Canon")');
  });
  it("компонент уведомлений: доступность, закрытие, безопасная работа вне провайдера", () => {
    const toast = read("src/components/Toast.tsx");
    expect(toast).toContain('role={t.kind === "error" ? "alert" : "status"}');
    expect(toast).toContain('aria-label="Закрыть уведомление"');
    expect(toast).toContain("createContext<Api>(NOOP)");
    expect(toast).not.toMatch(/fetch\(/);
  });
  it("режим письма не затрагивает API: адреса запросов редактора прежние", () => {
    const urls = [...editor.matchAll(/fetch\(\s*`([^`]+)`/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(/^\/api\/projects\/\$\{projectId\}\/chapters\/\$\{chapterId\}/);
  });
});
