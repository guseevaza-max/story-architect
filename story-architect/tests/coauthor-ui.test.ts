import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  budgetView,
  buildFragmentPayload,
  chapterIdFromPath,
  costText,
  formatUsd,
  isDockHidden,
  sendErrorText,
  splitSpoilers,
} from "../src/lib/coauthor/ui";
import { COAUTHOR_LIMITS } from "../src/lib/coauthor/tiers";

describe("страница и панель", () => {
  it("глава определяется по адресу только своего проекта", () => {
    expect(chapterIdFromPath("/projects/p1/chapters/c42", "p1")).toBe("c42");
    expect(chapterIdFromPath("/projects/p1/chapters/c42/edit", "p1")).toBe("c42");
    expect(chapterIdFromPath("/projects/p1/canon", "p1")).toBeNull();
    expect(chapterIdFromPath("/projects/p2/chapters/c42", "p1")).toBeNull();
    expect(chapterIdFromPath("/projects/p1/chapters/", "p1")).toBeNull();
  });

  it("на страницах экспорта панель скрыта", () => {
    expect(isDockHidden("/projects/p1/export")).toBe(true);
    expect(isDockHidden("/projects/p1/export/pdf")).toBe(true);
    expect(isDockHidden("/projects/p1/chapters/c1")).toBe(false);
    expect(isDockHidden("/projects/p1/exporter-notes")).toBe(false);
  });
});

describe("фрагмент главы", () => {
  const detail = { chapterId: "c1", text: "Анна вошла.", start: 10, end: 21 };

  it("сохранённый текст: границы передаются", () => {
    expect(buildFragmentPayload(detail)).toEqual({ ok: true, fragment: { chapterId: "c1", text: "Анна вошла.", start: 10, end: 21 } });
  });

  it("несохранённые правки: границы не передаются, чтобы не получить ложное несовпадение", () => {
    const r = buildFragmentPayload({ ...detail, unsaved: true });
    expect(r.ok && r.fragment).toEqual({ chapterId: "c1", text: "Анна вошла." });
  });

  it("пустое выделение и слишком длинный фрагмент отклоняются понятным текстом", () => {
    const empty = buildFragmentPayload({ chapterId: "c1", text: "   " });
    expect(!empty.ok && empty.error).toMatch(/выделите/i);
    const long = buildFragmentPayload({ chapterId: "c1", text: "а".repeat(COAUTHOR_LIMITS.fragmentChars + 1) });
    expect(!long.ok && long.error).toContain(String(COAUTHOR_LIMITS.fragmentChars));
  });
});

describe("спойлеры", () => {
  it("ответ без тайн показывается целиком", () => {
    expect(splitSpoilers("Обычный ответ.\n\nВторой абзац.", false)).toEqual([{ text: "Обычный ответ.\n\nВторой абзац.", spoiler: false }]);
  });

  it("абзацы с маркером сворачиваются по отдельности, маркер убирается", () => {
    const seg = splitSpoilers("Общий вывод.\n\n[СПОЙЛЕР] Истина про город.\n\n[СПОЙЛЕР] Ещё деталь.\n\nИтог.", true);
    expect(seg).toEqual([
      { text: "Общий вывод.", spoiler: false },
      { text: "Истина про город.\n\nЕщё деталь.", spoiler: true },
      { text: "Итог.", spoiler: false },
    ]);
    expect(JSON.stringify(seg)).not.toContain("[СПОЙЛЕР]");
  });

  it("сервер пометил ответ, а маркеров нет: сворачивается весь ответ", () => {
    expect(splitSpoilers("Речь о происхождении города.", true)).toEqual([{ text: "Речь о происхождении города.", spoiler: true }]);
  });

  it("маркер в ответе сворачивается даже если флаг не выставлен", () => {
    expect(splitSpoilers("[СПОЙЛЕР] Тайна.", false)).toEqual([{ text: "Тайна.", spoiler: true }]);
  });
});

describe("бюджет и ошибки", () => {
  it("остаток, предупреждение и исчерпание лимита", () => {
    expect(budgetView(10, 50)).toMatchObject({ level: "ok", remaining: 40 });
    expect(budgetView(10, 50).text).toBe("Осталось $40.00 из $50.00 в этом месяце");
    expect(budgetView(41, 50).level).toBe("warn");
    const over = budgetView(50.5, 50);
    expect(over).toMatchObject({ level: "over", remaining: 0, percentUsed: 100 });
    expect(over.text).toContain("исчерпан");
  });

  it("форматирование денег", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0012345)).toBe("$0.0012");
    expect(formatUsd(0.0456)).toBe("$0.046");
    expect(formatUsd(12.3456)).toBe("$12.35");
    expect(formatUsd(NaN)).toBe("—");
  });

  it("сообщения об ошибках: лимит, размер, архив, сбой", () => {
    expect(sendErrorText(429, { code: "BUDGET_EXCEEDED" })).toContain("ничего не списано");
    expect(sendErrorText(413, null)).toContain("слишком большим");
    expect(sendErrorText(409, { code: "ARCHIVED" })).toContain("архиве");
    expect(sendErrorText(502, { error: "Соавтор не вернул ответ." })).toBe("Соавтор не вернул ответ.");
    expect(sendErrorText(500, null)).toBe("Не удалось отправить сообщение.");
  });

  it("цена ответа: известная, неизвестная, отсутствует", () => {
    expect(costText({ usd: 0.0012, assumedUsd: null, status: "KNOWN" })).toBe("$0.0012");
    expect(costText({ usd: null, assumedUsd: 0.1, status: "UNKNOWN" })).toBe("стоимость неизвестна");
    expect(costText(null)).toBe("");
  });
});

describe("исходники интерфейса: границы и защита", () => {
  const dock = readFileSync("src/app/projects/[id]/_components/CoauthorDock.tsx", "utf8");
  const layout = readFileSync("src/app/projects/[id]/layout.tsx", "utf8");
  const editor = readFileSync("src/app/projects/[id]/chapters/[chapterId]/DraftEditor.tsx", "utf8");

  it("панель обращается только к API Соавтора и к чтению расходов", () => {
    const urls = [...dock.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1]!.trim());
    for (const url of urls) {
      expect(url, url).toMatch(/base|ai-usage/);
    }
    expect(dock).not.toMatch(/\/api\/projects\/\$\{projectId\}\/(chapters|canon|story-bible|plot-map|proposals|lore)/);
    expect(dock).not.toMatch(/canon\/write|applyProposal/);
  });

  it("удаление беседы требует подтверждения пользователя и ?confirm=true", () => {
    expect(dock).toContain("window.confirm");
    expect(dock).toContain("?confirm=true");
  });

  it("текст ответа выводится как текст, без вставки HTML", () => {
    expect(dock).not.toContain("dangerouslySetInnerHTML");
  });

  it("панель подключена в оболочку проекта и не зависит от серверных модулей", () => {
    expect(layout).toContain("CoauthorDock");
    expect(dock).not.toMatch(/from "@\/lib\/(db|coauthor\/service|coauthor\/context)"|@prisma\/client/);
  });

  it("редактор только отправляет событие и не обращается к API Соавтора", () => {
    expect(editor).toContain("dispatchEvent(new CustomEvent(COAUTHOR_ATTACH_EVENT");
    expect(editor).not.toMatch(/api\/[^"'`]*coauthor/);
  });
});
