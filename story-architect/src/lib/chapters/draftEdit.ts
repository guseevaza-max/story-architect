/**
 * Правка черновика после перевода главы в Canon.
 *
 * Memory Update читает finalText — текст, зафиксированный при переводе в Canon.
 * Если автор правит draftText уже после Canon, finalText устарел: новые детали
 * (например, имя дочери героя) не попадут в предложения. Поэтому изменённый
 * текст возвращает главу в «Утверждена»: автор заново утверждает и переводит её
 * в Canon, finalText обновляется, и Memory Update видит свежий текст.
 */
export function revertsToApproved(
  chapter: { status: string; draftText: string | null; finalText: string | null },
  newDraftText: string
): boolean {
  if (chapter.status !== "CANON") return false;
  const canonText = (chapter.finalText ?? chapter.draftText ?? "").trim();
  return newDraftText.trim() !== canonText;
}
