/** Режим письма в редакторе: вспомогательные чистые функции. */

/** Ctrl+S или Cmd+S. */
export function isSaveShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s";
}

/** «1 слово», «2 слова», «5 слов». */
export function wordsLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m100 >= 11 && m100 <= 14 ? "слов" : m10 === 1 ? "слово" : m10 >= 2 && m10 <= 4 ? "слова" : "слов";
  return `${n} ${word}`;
}
