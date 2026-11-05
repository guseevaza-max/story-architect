/**
 * Признак «ответ затрагивает тайны». Определяется детерминированно, а не
 * только словом модели, но модель тоже просят помечать такие места маркером.
 * Сравнение идёт по основам слов (первые 5 букв), чтобы узнавать тайну в
 * другом падеже. Ложное срабатывание лишь сворачивает абзац в интерфейсе.
 */
export const SPOILER_MARKER = "[СПОЙЛЕР]";

export type SpoilerSecret = { name: string; objectiveTruth: string | null };

const STEM = 5;
const norm = (t: string) => t.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const stems = (t: string) => norm(t).split(" ").filter(Boolean).map((w) => w.slice(0, STEM));

function containsSeq(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((w, j) => hay[i + j] === w)) return true;
  }
  return false;
}

export function detectSpoiler(reply: string, secrets: SpoilerSecret[]): boolean {
  if (reply.includes("[СПОЙЛЕР")) return true;
  const hay = stems(reply);
  if (hay.length === 0) return false;
  for (const s of secrets) {
    const name = stems(s.name);
    if (name.join("").length >= STEM && containsSeq(hay, name)) return true;
    const truth = stems(s.objectiveTruth ?? "");
    // четыре слова истины подряд в ответе: пересказ тайны
    for (let i = 0; i + 4 <= truth.length; i++) {
      if (containsSeq(hay, truth.slice(i, i + 4))) return true;
    }
  }
  return false;
}
