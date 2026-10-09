/**
 * Чистая функция форматирования накопленного состояния истории.
 * Не обращается к базе данных — поэтому легко тестируется.
 *
 * Принимает уже выбранные из БД записи и собирает из них компактный
 * текстовый блок для промпта (Architect, Scene Planner, Writer, Continuity).
 */

export type StateCharacter = {
  id: string;
  name: string;
  role: string | null;
  tier: number;
  description: string | null;
};

export type StateRow = {
  characterId: string;
  attribute: string;
  value: unknown;
  /** Порядок применения: чем больше, тем новее. Побеждает последнее значение. */
  order: number;
};

export type StateRelationship = {
  source: string;
  target: string;
  type: string;
  reason: string | null;
};

export const EMPTY_STORY_STATE =
  "Накопленного состояния персонажей и отношений пока нет.";

function clip(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function fit(lines: string[], limit: number): string[] {
  const result: string[] = [];
  let used = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const cost = line.length + 1;

    if (used + cost > limit) {
      const left = lines.length - i;
      result.push(`…и ещё ${left} (не поместилось в бюджет контекста)`);
      break;
    }

    result.push(line);
    used += cost;
  }

  return result;
}

export function formatStoryState(
  characters: StateCharacter[],
  stateRows: StateRow[],
  relationships: StateRelationship[],
  maxChars = 6000
): string {
  if (characters.length === 0 && relationships.length === 0) {
    return EMPTY_STORY_STATE;
  }

  // Для каждой пары (персонаж, атрибут) оставляем самое новое значение.
  const known = new Set(characters.map((c) => c.id));
  const latest = new Map<string, Map<string, string>>();

  [...stateRows]
    .sort((a, b) => a.order - b.order)
    .forEach((row) => {
      if (!known.has(row.characterId)) return;
      const text = valueToText(row.value);
      if (!text) return;

      const byAttribute =
        latest.get(row.characterId) ?? new Map<string, string>();
      byAttribute.set(row.attribute, clip(text, 200));
      latest.set(row.characterId, byAttribute);
    });

  const sortedCharacters = [...characters].sort(
    (a, b) => a.tier - b.tier || a.name.localeCompare(b.name, "ru")
  );

  const characterLines = sortedCharacters.map((c) => {
    const head = `- ${c.name}${c.role ? ` (${clip(c.role, 60)})` : ""}`;
    const about = c.description ? `: ${clip(c.description, 160)}` : "";
    const states = latest.get(c.id);
    const stateText =
      states && states.size > 0
        ? ` | Состояние: ${[...states.entries()]
            .map(([attribute, value]) => `${attribute} = ${value}`)
            .join("; ")}`
        : "";

    return `${head}${about}${stateText}`;
  });

  const relationshipLines = relationships.map((r) => {
    const reason = r.reason ? `: ${clip(r.reason, 160)}` : "";
    return `- ${r.source} → ${r.target} [${r.type}]${reason}`;
  });

  // 70% бюджета — персонажам, остальное — отношениям.
  const characterBudget = Math.floor(maxChars * 0.7);
  const parts: string[] = [];

  if (characterLines.length > 0) {
    parts.push(
      "ПЕРСОНАЖИ:\n" + fit(characterLines, characterBudget).join("\n")
    );
  }

  if (relationshipLines.length > 0) {
    const used = parts.join("\n\n").length;
    const relationshipBudget = Math.max(maxChars - used, 500);
    parts.push(
      "ОТНОШЕНИЯ:\n" + fit(relationshipLines, relationshipBudget).join("\n")
    );
  }

  return parts.join("\n\n");
}
