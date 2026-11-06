/** Карточка персонажа: чистые функции подготовки данных. Только чтение. */

export function valueText(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "—";
  }
}

export type StateRow = { id: string; attribute: string; newValue: unknown; reason: string | null; chapterNumber: number | null; createdAt: string };

/** Текущее значение каждого атрибута = последняя запись; порядок глав важнее порядка создания. */
export function currentStates(rows: StateRow[]): StateRow[] {
  const best = new Map<string, StateRow>();
  for (const row of rows) {
    const prev = best.get(row.attribute);
    if (!prev || compareState(row, prev) > 0) best.set(row.attribute, row);
  }
  return Array.from(best.values()).sort((a, b) => a.attribute.localeCompare(b.attribute));
}

function compareState(a: StateRow, b: StateRow): number {
  const ac = a.chapterNumber ?? -1;
  const bc = b.chapterNumber ?? -1;
  if (ac !== bc) return ac - bc;
  return a.createdAt.localeCompare(b.createdAt);
}

const ATTRIBUTE_LABEL: Record<string, string> = {
  goal: "Цель",
  goals: "Цели",
  knowledge: "Знание",
  location: "Местонахождение",
  worldview: "Мировоззрение",
  leadership: "Лидерство",
  power: "Сила",
  discipline: "Дисциплина",
  reputation: "Репутация",
  influence: "Влияние",
  alive: "Жив",
  possessions: "Имущество",
  emotion: "Эмоции",
  health: "Здоровье",
  other: "Прочее",
};

/** Русская подпись атрибута состояния; неизвестные остаются как есть. */
export function attributeLabel(attribute: string): string {
  return ATTRIBUTE_LABEL[attribute.trim().toLowerCase()] ?? attribute;
}

const RELATION_LABEL: Record<string, string> = {
  trust: "доверие",
  rivalry: "соперничество",
  family: "семья",
  debt: "долг",
  love: "любовь",
  friendship: "дружба",
  fear: "страх",
  loyalty: "верность",
  other: "прочее",
};

/** Русская подпись типа связи; неизвестные остаются как есть. */
export function relationLabel(type: string): string {
  return RELATION_LABEL[type.trim().toLowerCase()] ?? type;
}

export function chapterWindow(from: number | null, to: number | null): string {
  if (from == null && to == null) return "";
  if (from != null && from === to) return `гл. ${from}`;
  if (from != null && to != null) return `гл. ${from}–${to}`;
  if (from != null) return `с гл. ${from}`;
  return `до гл. ${to}`;
}

export function knowledgeLabel(knows: boolean, partial: boolean, since: number | null): string {
  if (!knows) return "не знает";
  const base = partial ? "знает частично" : "знает";
  return since != null ? `${base} с гл. ${since}` : base;
}

export const TIER_LABEL: Record<number, string> = { 1: "Главный", 2: "Второстепенный", 3: "Эпизодический" };
