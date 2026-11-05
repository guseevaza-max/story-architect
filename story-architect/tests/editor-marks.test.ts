import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatMark,
  hasEditorMarks,
  parseEditorMarks,
  removeMark,
  stripEditorMarks,
} from "../src/lib/chapters/editorMarks";

describe("пометки редактора", () => {
  const text =
    "Салим вошёл в дом. " +
    formatMark("КОММЕНТАРИЙ", "Лейла молча кивнула.", "Добавить, что она устала") +
    " Мира спала. " +
    formatMark("ПЕРЕПИСАТЬ", "Он вздохнул.", "");

  it("формат и разбор взаимно обратимы", () => {
    const marks = parseEditorMarks(text);
    expect(marks).toHaveLength(2);
    expect(marks[0]).toMatchObject({
      kind: "КОММЕНТАРИЙ",
      fragment: "Лейла молча кивнула.",
      comment: "Добавить, что она устала",
    });
    expect(marks[1]).toMatchObject({ kind: "ПЕРЕПИСАТЬ", fragment: "Он вздохнул.", comment: "" });
    expect(text.slice(marks[0]!.start, marks[0]!.end)).toBe(
      formatMark("КОММЕНТАРИЙ", "Лейла молча кивнула.", "Добавить, что она устала")
    );
  });

  it("фрагмент может быть из нескольких абзацев", () => {
    const multi = formatMark("ВОПРОС", "Первый абзац.\n\nВторой абзац.", "Нужно ли это?");
    expect(parseEditorMarks(multi)[0]?.fragment).toBe("Первый абзац.\n\nВторой абзац.");
  });

  it("служебные символы в комментарии не ломают разбор", () => {
    const mark = formatMark("КОММЕНТАРИЙ", "Текст", "см. [сцену 2] и «так»]]");
    const parsed = parseEditorMarks("до " + mark + " после");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.fragment).toBe("Текст");
  });

  it("stripEditorMarks возвращает чистый текст с исходными фрагментами", () => {
    expect(stripEditorMarks(text)).toBe(
      "Салим вошёл в дом. Лейла молча кивнула. Мира спала. Он вздохнул."
    );
  });

  it("removeMark убирает одну пометку, оставляя фрагмент", () => {
    const first = parseEditorMarks(text)[0]!;
    const after = removeMark(text, first);
    expect(parseEditorMarks(after)).toHaveLength(1);
    expect(after).toContain("Лейла молча кивнула. Мира спала.");
  });

  it("обычные скобки и слова не принимаются за пометки", () => {
    expect(hasEditorMarks("Он сказал [[тихо]] и «ВОПРОС» задал.")).toBe(false);
    expect(hasEditorMarks(text)).toBe(true);
  });
});

// --- утверждение главы с пометками ---

const h = vi.hoisted(() => ({ chapter: null as any, updated: [] as any[] }));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    chapter = {
      findFirst: async () => h.chapter,
      update: async (args: any) => {
        h.updated.push(args);
        return { ...h.chapter, ...args.data };
      },
    };
  },
}));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));

describe("PATCH главы: утверждение", () => {
  const patch = async (body: unknown) => {
    const { PATCH } = await import(
      "../src/app/api/projects/[id]/chapters/[chapterId]/route"
    );
    return PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: "p1", chapterId: "c1" }) }
    );
  };

  beforeEach(() => {
    h.updated = [];
    h.chapter = { id: "c1", status: "DRAFT", draftText: "Чистый текст.", finalText: null };
  });

  it("глава без пометок утверждается", async () => {
    expect((await patch({ status: "APPROVED" })).status).toBe(200);
    expect(h.updated[0].data.status).toBe("APPROVED");
  });

  it("глава с пометками не утверждается", async () => {
    h.chapter.draftText =
      "Текст. " + formatMark("ВОПРОС", "Фрагмент.", "Зачем это?");
    const res = await patch({ status: "APPROVED" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("пометки редактора");
    expect(h.updated).toHaveLength(0);
  });
});
