/**
 * Пометки редактора внутри текста черновика.
 *
 * Автор выделяет фрагмент и добавляет к нему комментарий, вопрос или просьбу
 * переписать. Пометка хранится прямо в тексте, поэтому «едет» вместе с ним
 * при правках и не требует отдельной таблицы:
 *
 *   [[КОММЕНТАРИЙ: «фрагмент» — комментарий]]
 *
 * Пометки — рабочий материал черновика. Утверждённая глава обязана быть без
 * пометок (проверяется при утверждении), а «Доработать по заметкам» учитывает
 * их и возвращает чистый текст.
 */

export const MARK_KINDS = ["КОММЕНТАРИЙ", "ВОПРОС", "ПЕРЕПИСАТЬ"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export type EditorMark = {
  kind: MarkKind;
  fragment: string;
  comment: string;
  start: number;
  end: number;
};

const MARK_PATTERN =
  /\[\[(КОММЕНТАРИЙ|ВОПРОС|ПЕРЕПИСАТЬ):\s*«([\s\S]*?)»\s*—\s*([^\]]*?)\s*\]\]/g;

export function formatMark(kind: MarkKind, fragment: string, comment: string): string {
  // Служебные символы формата не должны ломать разбор.
  const safeFragment = fragment.replace(/»/g, "”").replace(/\]\]/g, "] ]");
  const safeComment = comment.replace(/\s+/g, " ").trim().replace(/\]/g, ")");
  return `[[${kind}: «${safeFragment}» — ${safeComment}]]`;
}

export function parseEditorMarks(text: string): EditorMark[] {
  const marks: EditorMark[] = [];
  for (const match of text.matchAll(MARK_PATTERN)) {
    const start = match.index ?? 0;
    marks.push({
      kind: match[1] as MarkKind,
      fragment: match[2] ?? "",
      comment: match[3] ?? "",
      start,
      end: start + match[0].length,
    });
  }
  return marks;
}

export function hasEditorMarks(text: string): boolean {
  return parseEditorMarks(text).length > 0;
}

/** Убирает пометки, оставляя исходные фрагменты текста. */
export function stripEditorMarks(text: string): string {
  return text.replace(MARK_PATTERN, (_all, _kind, fragment: string) => fragment);
}

/** Убирает одну пометку по позиции, фрагмент остаётся в тексте. */
export function removeMark(text: string, mark: EditorMark): string {
  return text.slice(0, mark.start) + mark.fragment + text.slice(mark.end);
}
