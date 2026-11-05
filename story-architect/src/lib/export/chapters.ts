/** Выбор глав и текста для экспорта (печать / PDF). Каноном не является и ничего не меняет. */

export type ExportChapter = {
  number: number;
  title: string | null;
  status: string;
  draftText: string | null;
  finalText: string | null;
};

export type ExportQuery = { from: number | null; to: number | null };

const toNumber = (value: string | string[] | undefined): number | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{1,4}$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
};

export function parseExportQuery(params: Record<string, string | string[] | undefined>): ExportQuery {
  return { from: toNumber(params.from), to: toNumber(params.to) };
}

/** Для утверждённой главы — финальный текст, иначе черновик. */
export function exportText(chapter: Pick<ExportChapter, "draftText" | "finalText">): string {
  return (chapter.finalText ?? chapter.draftText ?? "").trim();
}

/** Главы с текстом в диапазоне, по возрастанию номера. */
export function selectChapters(chapters: ExportChapter[], query: ExportQuery): ExportChapter[] {
  return chapters
    .filter((c) => exportText(c).length > 0)
    .filter((c) => (query.from === null || c.number >= query.from) && (query.to === null || c.number <= query.to))
    .sort((a, b) => a.number - b.number);
}

/** Абзацы по пустым строкам; одиночные переносы внутри абзаца сохраняются. */
export function toParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}
