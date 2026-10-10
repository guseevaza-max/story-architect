/**
 * Преобразование результата анализа Story Bible в черновики предложений.
 *
 * Чистая логика без базы данных. Принцип сохраняется: AI только ПРЕДЛАГАЕТ,
 * в Canon ничего не попадает без подтверждения автора на странице Proposals.
 *
 * Два источника данных:
 *  1. candidates — структурированные кандидаты с типом, обоснованием из текста
 *     и уверенностью (основной путь).
 *  2. Плоские списки строк (characters, locations, ...) — запасной путь для
 *     ответов без candidates; к ним применяются те же защитные проверки.
 *
 * Принципы классификации:
 *  - Государство, империя, народ — не локация и не фракция.
 *  - Государственный орган или абстрактное понятие («власть», «канцелярия»)
 *    не становится фракцией без достаточных оснований.
 *  - Сюжетная линия — развивающийся конфликт, цель или тайна. Единичный факт,
 *    поступок или неопределённое последствие линией не является.
 *  - Тесно связанные действия одного эпизода объединяются в ОДНО событие.
 *  - Если тип неоднозначен, предложение не создаётся, а причина показывается
 *    в списке «Пропущено».
 *
 * Не превращаются в предложения: facts, relationships, secrets, openQuestions.
 */

export type CandidateKind =
  | "character"
  | "unnamed_figure"
  | "location"
  | "faction"
  | "state_or_realm"
  | "government_body"
  | "abstract_concept"
  | "world_rule"
  | "event"
  | "plot_line"
  | "consequence_or_fact"
  | "other";

export type Candidate = {
  kind: CandidateKind;
  name: string;
  description: string;
  /** Короткая цитата или близкий пересказ из текста — основание для типа. */
  evidence: string;
  /** Уверенность модели в типе, от 0 до 1. */
  confidence: number;
  /** Для сюжетных линий: развивается ли это на протяжении нескольких сцен. */
  isOngoing: boolean;
  /** Для событий: одинаковое значение у шагов одного эпизода. */
  eventGroup: string;
  cause: string;
  consequences: string;
  inWorldDate: string;
};

export type AnalysisInput = {
  candidates?: Candidate[];
  facts?: string[];
  characters?: string[];
  locations?: string[];
  factions?: string[];
  worldRules?: string[];
  events?: string[];
  relationships?: string[];
  secrets?: string[];
  plotLines?: string[];
  openQuestions?: string[];
};

export type DraftEntityType =
  | "CHARACTER"
  | "WORLD_ENTITY"
  | "WORLD_RULE"
  | "PLOT_LINE"
  | "EVENT";

export type DraftCategory =
  | "characters"
  | "locations"
  | "factions"
  | "worldRules"
  | "events"
  | "plotLines";

export type SkippedCategory = DraftCategory | "other";

export type ProposalDraft = {
  category: DraftCategory;
  entityType: DraftEntityType;
  name: string;
  payload: { entityType: DraftEntityType; data: Record<string, unknown> };
  reason: string;
};

export type SkipReason =
  | "duplicate_canon"
  | "duplicate_pending"
  | "previously_rejected"
  | "duplicate_in_analysis"
  | "unnamed"
  | "empty"
  | "ambiguous_type"
  | "state_not_location"
  | "state_not_supported"
  | "not_a_faction"
  | "not_a_plot_line"
  | "single_fact"
  | "low_confidence"
  | "unsupported_kind";

export type SkippedItem = {
  category: SkippedCategory;
  text: string;
  reason: SkipReason;
};

/** Нормализованные названия по типам сущностей. */
export type ExistingNames = Record<DraftEntityType, Set<string>>;

/**
 * Что уже есть в проекте: подтверждённый Canon, ожидающие решения предложения
 * и предложения, ранее отклонённые автором (чтобы не возвращать их снова).
 */
export type ExistingSets = {
  canon: ExistingNames;
  pending: ExistingNames;
  rejected: ExistingNames;
};

export type DraftResult = {
  drafts: ProposalDraft[];
  skipped: SkippedItem[];
  /** Сколько пунктов не превращаются в предложения (только для показа). */
  notMapped: {
    facts: number;
    relationships: number;
    secrets: number;
    openQuestions: number;
  };
};

/** Минимальная уверенность, ниже которой тип считается ненадёжным. */
export const MIN_CONFIDENCE = 0.5;

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'“”„‘’.,;:!?()[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function emptyExistingNames(): ExistingNames {
  return {
    CHARACTER: new Set(),
    WORLD_ENTITY: new Set(),
    WORLD_RULE: new Set(),
    PLOT_LINE: new Set(),
    EVENT: new Set(),
  };
}

export function emptyExistingSets(): ExistingSets {
  return {
    canon: emptyExistingNames(),
    pending: emptyExistingNames(),
    rejected: emptyExistingNames(),
  };
}

function clip(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

// ───────────────────────── распознавание типов по названию ─────────────────

/**
 * Маркеры прямо заявленной неизвестности: такие фигуры не должны
 * автоматически становиться персонажами. Роли без имени («стражник»,
 * «женщина») сюда сознательно НЕ входят, чтобы не терять настоящих героев.
 */
const UNNAMED_PREFIXES = [
  "незнакомец",
  "незнакомка",
  "неизвестн",
  "безымянн",
  "некто",
  "кто-то",
  "какой-то",
  "какая-то",
  "какие-то",
  "человек в ",
  "человек с ",
  "фигура",
];

export function looksUnnamed(text: string): boolean {
  const normalized = normalizeName(text);

  return UNNAMED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

const STATE_WORDS = new Set([
  "империя",
  "империи",
  "империю",
  "королевство",
  "королевства",
  "республика",
  "республики",
  "государство",
  "государства",
  "федерация",
  "княжество",
  "халифат",
  "царство",
  "держава",
  "конфедерация",
]);

/** Название государства: «Империя Пепла», «Объединённая республика». */
export function looksLikeState(name: string): boolean {
  return normalizeName(name)
    .split(" ")
    .some((word) => STATE_WORDS.has(word));
}

const GOVERNMENT_STEMS = [
  "канцеляр",
  "министерств",
  "ведомств",
  "администрац",
  "правительств",
  "департамент",
  "префектур",
];

const ABSTRACT_WORDS = new Set(["власть", "власти", "властей", "власть."]);

/** Государственный орган или абстрактное понятие, а не самостоятельная фракция. */
export function looksLikeGovernmentBody(name: string): boolean {
  const words = normalizeName(name).split(" ");

  return words.some(
    (word) =>
      ABSTRACT_WORDS.has(word) ||
      GOVERNMENT_STEMS.some((stem) => word.startsWith(stem))
  );
}

/** Формулировка последствия или предположения, а не развивающейся линии. */
export function looksLikeConsequence(text: string): boolean {
  const normalized = normalizeName(text);

  return (
    normalized.includes("последстви") ||
    /\b(может|могут)\s+(иметь|повлечь|привести)\b/.test(normalized)
  );
}

// ───────────────────────── разбор названия и описания ──────────────────────

const NAME_MAX = 80;

/**
 * Делит строку анализа на название и описание.
 * «Ривенхольм — город на берегу моря» → название «Ривенхольм».
 */
export function splitNameDescription(text: string): {
  name: string;
  description?: string;
} {
  const clean = text.replace(/\s+/g, " ").trim();

  for (const separator of [" — ", " – ", " - ", ": "]) {
    const index = clean.indexOf(separator);

    if (index > 0 && index <= NAME_MAX) {
      const name = clean.slice(0, index).trim();
      const rest = clean.slice(index + separator.length).trim();

      if (name) {
        return { name, description: rest ? clean : undefined };
      }
    }
  }

  if (clean.length <= NAME_MAX) {
    return { name: clean };
  }

  const cut = clean.slice(0, NAME_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  const name = `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim()}…`;

  return { name, description: clean };
}

// ───────────────────────── сборщик черновиков ──────────────────────────────

class Collector {
  readonly drafts: ProposalDraft[] = [];
  readonly skipped: SkippedItem[] = [];
  private readonly seen: ExistingNames = emptyExistingNames();

  constructor(private readonly existing: ExistingSets) {}

  skip(category: SkippedCategory, text: string, reason: SkipReason) {
    this.skipped.push({ category, text, reason });
  }

  /** Добавляет черновик, если такого названия ещё нет нигде. */
  add(draft: ProposalDraft, shownText: string) {
    const key = normalizeName(draft.name);
    const type = draft.entityType;

    if (this.existing.canon[type].has(key)) {
      this.skip(draft.category, shownText, "duplicate_canon");
      return;
    }

    if (this.existing.pending[type].has(key)) {
      this.skip(draft.category, shownText, "duplicate_pending");
      return;
    }

    if (this.existing.rejected[type].has(key)) {
      this.skip(draft.category, shownText, "previously_rejected");
      return;
    }

    if (this.seen[type].has(key)) {
      this.skip(draft.category, shownText, "duplicate_in_analysis");
      return;
    }

    this.seen[type].add(key);
    this.drafts.push(draft);
  }
}

function notMappedCounts(analysis: AnalysisInput) {
  return {
    facts: analysis.facts?.length ?? 0,
    relationships: analysis.relationships?.length ?? 0,
    secrets: analysis.secrets?.length ?? 0,
    openQuestions: analysis.openQuestions?.length ?? 0,
  };
}

// ───────────────────────── путь 1: структурированные кандидаты ─────────────

const KIND_CATEGORY: Record<CandidateKind, SkippedCategory> = {
  character: "characters",
  unnamed_figure: "characters",
  location: "locations",
  faction: "factions",
  state_or_realm: "other",
  government_body: "other",
  abstract_concept: "other",
  world_rule: "worldRules",
  event: "events",
  plot_line: "plotLines",
  consequence_or_fact: "other",
  other: "other",
};

function withEvidence(base: string, evidence: string): string {
  const clean = evidence.trim();

  return clean ? `${base}. Основание в тексте: «${clip(clean, 200)}»` : base;
}

function draftsFromCandidates(
  candidates: Candidate[],
  collector: Collector
) {
  // Какие типы встретились под одним названием: ловим двойную классификацию.
  const kindsByName = new Map<string, Set<CandidateKind>>();

  for (const candidate of candidates) {
    const key = normalizeName(candidate.name);
    const kinds = kindsByName.get(key) ?? new Set<CandidateKind>();
    kinds.add(candidate.kind);
    kindsByName.set(key, kinds);
  }

  const eventGroups = new Map<string, Candidate[]>();
  const eventOrder: string[] = [];

  candidates.forEach((candidate, index) => {
    const name = candidate.name.replace(/\s+/g, " ").trim();
    const category = KIND_CATEGORY[candidate.kind];

    if (!name) {
      collector.skip(category, candidate.name, "empty");
      return;
    }

    const kinds =
      kindsByName.get(normalizeName(name)) ?? new Set<CandidateKind>();
    const inCategoryList =
      candidate.kind === "location" || candidate.kind === "faction";

    // Государство не бывает локацией или фракцией только из-за названия.
    if (inCategoryList && kinds.has("state_or_realm")) {
      collector.skip(category, name, "state_not_location");
      return;
    }

    // Одно название одновременно как локация и фракция — тип неоднозначен.
    if (inCategoryList && kinds.has("location") && kinds.has("faction")) {
      collector.skip(category, name, "ambiguous_type");
      return;
    }

    const trusted = candidate.confidence >= MIN_CONFIDENCE;

    switch (candidate.kind) {
      case "unnamed_figure":
        collector.skip(category, name, "unnamed");
        return;

      case "state_or_realm":
        collector.skip(category, name, "state_not_supported");
        return;

      case "government_body":
      case "abstract_concept":
        collector.skip(category, name, "not_a_faction");
        return;

      case "consequence_or_fact":
        collector.skip(category, name, "single_fact");
        return;

      case "other":
        collector.skip(category, name, "unsupported_kind");
        return;

      case "character": {
        if (looksUnnamed(name)) {
          collector.skip(category, name, "unnamed");
          return;
        }

        if (!trusted) {
          collector.skip(category, name, "low_confidence");
          return;
        }

        collector.add(
          {
            category: "characters",
            entityType: "CHARACTER",
            name,
            payload: {
              entityType: "CHARACTER",
              data: {
                name,
                description: clip(candidate.description || name, 2000),
              },
            },
            reason: withEvidence(
              "Персонаж извлечён AI из текста Story Bible",
              candidate.evidence
            ),
          },
          name
        );
        return;
      }

      case "location": {
        if (looksLikeState(name)) {
          collector.skip(category, name, "state_not_location");
          return;
        }

        if (!trusted) {
          collector.skip(category, name, "low_confidence");
          return;
        }

        collector.add(
          {
            category: "locations",
            entityType: "WORLD_ENTITY",
            name,
            payload: {
              entityType: "WORLD_ENTITY",
              data: {
                type: "LOCATION",
                name,
                description: clip(candidate.description, 2000) || undefined,
              },
            },
            reason: withEvidence(
              "Локация извлечена AI из текста Story Bible",
              candidate.evidence
            ),
          },
          name
        );
        return;
      }

      case "faction": {
        if (looksLikeGovernmentBody(name)) {
          collector.skip(category, name, "not_a_faction");
          return;
        }

        if (!trusted) {
          collector.skip(category, name, "low_confidence");
          return;
        }

        collector.add(
          {
            category: "factions",
            entityType: "WORLD_ENTITY",
            name,
            payload: {
              entityType: "WORLD_ENTITY",
              data: {
                type: "FACTION",
                name,
                description: clip(candidate.description, 2000) || undefined,
              },
            },
            reason: withEvidence(
              "Фракция извлечена AI из текста Story Bible",
              candidate.evidence
            ),
          },
          name
        );
        return;
      }

      case "world_rule": {
        if (!trusted) {
          collector.skip(category, name, "low_confidence");
          return;
        }

        collector.add(
          {
            category: "worldRules",
            entityType: "WORLD_RULE",
            name,
            payload: {
              entityType: "WORLD_RULE",
              data: {
                name,
                statement: clip(candidate.description || name, 2000),
              },
            },
            reason: withEvidence(
              "Правило мира извлечено AI из текста Story Bible",
              candidate.evidence
            ),
          },
          name
        );
        return;
      }

      case "plot_line": {
        // Линия — это развивающийся конфликт, цель или тайна, а не факт.
        if (!candidate.isOngoing || looksLikeConsequence(name)) {
          collector.skip(category, name, "not_a_plot_line");
          return;
        }

        if (!trusted) {
          collector.skip(category, name, "low_confidence");
          return;
        }

        collector.add(
          {
            category: "plotLines",
            entityType: "PLOT_LINE",
            name,
            payload: {
              entityType: "PLOT_LINE",
              data: {
                name,
                description: clip(candidate.description, 2000) || undefined,
              },
            },
            reason: withEvidence(
              "Сюжетная линия извлечена AI из текста Story Bible",
              candidate.evidence
            ),
          },
          name
        );
        return;
      }

      case "event": {
        if (!trusted) {
          collector.skip(category, name, "low_confidence");
          return;
        }

        // Шаги одного эпизода (одинаковый eventGroup) сольём в одно событие.
        const group = normalizeName(candidate.eventGroup);
        const key = group || `__single_${index}`;
        const list = eventGroups.get(key) ?? [];

        if (list.length === 0) eventOrder.push(key);

        list.push({ ...candidate, name });
        eventGroups.set(key, list);
        return;
      }
    }
  });

  for (const key of eventOrder) {
    const steps = eventGroups.get(key) ?? [];
    const first = steps[0];

    if (!first) continue;

    const unique = (values: string[]) => [
      ...new Set(values.map((v) => v.replace(/\s+/g, " ").trim()).filter(Boolean)),
    ];

    // Ничего значимого не теряем: описание каждого шага остаётся в тексте.
    const description = unique(
      steps.map((step) => step.description || step.name)
    ).join(" ");
    const cause = unique(steps.map((step) => step.cause))[0];
    const consequences = unique(steps.map((step) => step.consequences)).join(
      " "
    );
    const inWorldDate = unique(steps.map((step) => step.inWorldDate))[0];
    const evidence = unique(steps.map((step) => step.evidence))
      .slice(0, 2)
      .join(" … ");

    collector.add(
      {
        category: "events",
        entityType: "EVENT",
        name: first.name,
        payload: {
          entityType: "EVENT",
          data: {
            name: first.name,
            description: clip(description, 2000) || undefined,
            cause: cause ? clip(cause, 1000) : undefined,
            consequences: consequences ? clip(consequences, 1000) : undefined,
            inWorldDate: inWorldDate || undefined,
          },
        },
        reason: withEvidence(
          steps.length > 1
            ? `Событие извлечено AI из текста Story Bible (объединено шагов: ${steps.length})`
            : "Событие извлечено AI из текста Story Bible",
          evidence
        ),
      },
      first.name
    );
  }
}

// ───────────────────────── путь 2: плоские списки строк ────────────────────

function draftsFromLists(analysis: AnalysisInput, collector: Collector) {
  type Row = { text: string; name: string; description?: string };

  const prepare = (items: string[] | undefined): Row[] =>
    (items ?? []).map((raw) => {
      const text = raw.replace(/\s+/g, " ").trim();
      return { text, ...(text ? splitNameDescription(text) : { name: "" }) };
    });

  const locations = prepare(analysis.locations);
  const factions = prepare(analysis.factions);

  const locationNames = new Set(
    locations.filter((r) => r.name).map((r) => normalizeName(r.name))
  );
  const factionNames = new Set(
    factions.filter((r) => r.name).map((r) => normalizeName(r.name))
  );

  // Characters
  for (const row of prepare(analysis.characters)) {
    if (!row.text) {
      collector.skip("characters", row.text, "empty");
    } else if (looksUnnamed(row.text)) {
      collector.skip("characters", row.text, "unnamed");
    } else {
      collector.add(
        {
          category: "characters",
          entityType: "CHARACTER",
          name: row.name,
          payload: {
            entityType: "CHARACTER",
            data: { name: row.name, description: row.description ?? row.name },
          },
          reason: "Персонаж извлечён AI из текста Story Bible",
        },
        row.text
      );
    }
  }

  // Locations
  for (const row of locations) {
    const key = normalizeName(row.name);

    if (!row.text) {
      collector.skip("locations", row.text, "empty");
    } else if (factionNames.has(key)) {
      collector.skip("locations", row.text, "ambiguous_type");
    } else if (looksLikeState(row.name)) {
      collector.skip("locations", row.text, "state_not_location");
    } else {
      collector.add(
        {
          category: "locations",
          entityType: "WORLD_ENTITY",
          name: row.name,
          payload: {
            entityType: "WORLD_ENTITY",
            data: {
              type: "LOCATION",
              name: row.name,
              description: row.description,
            },
          },
          reason: "Локация извлечена AI из текста Story Bible",
        },
        row.text
      );
    }
  }

  // Factions
  for (const row of factions) {
    const key = normalizeName(row.name);

    if (!row.text) {
      collector.skip("factions", row.text, "empty");
    } else if (locationNames.has(key)) {
      collector.skip("factions", row.text, "ambiguous_type");
    } else if (looksLikeGovernmentBody(row.name)) {
      collector.skip("factions", row.text, "not_a_faction");
    } else {
      collector.add(
        {
          category: "factions",
          entityType: "WORLD_ENTITY",
          name: row.name,
          payload: {
            entityType: "WORLD_ENTITY",
            data: {
              type: "FACTION",
              name: row.name,
              description: row.description,
            },
          },
          reason: "Фракция извлечена AI из текста Story Bible",
        },
        row.text
      );
    }
  }

  // World rules
  for (const row of prepare(analysis.worldRules)) {
    if (!row.text) {
      collector.skip("worldRules", row.text, "empty");
    } else {
      collector.add(
        {
          category: "worldRules",
          entityType: "WORLD_RULE",
          name: row.name,
          payload: {
            entityType: "WORLD_RULE",
            data: { name: row.name, statement: row.text },
          },
          reason: "Правило мира извлечено AI из текста Story Bible",
        },
        row.text
      );
    }
  }

  // Events
  for (const row of prepare(analysis.events)) {
    if (!row.text) {
      collector.skip("events", row.text, "empty");
    } else {
      collector.add(
        {
          category: "events",
          entityType: "EVENT",
          name: row.name,
          payload: {
            entityType: "EVENT",
            data: { name: row.name, description: row.description },
          },
          reason: "Событие извлечено AI из текста Story Bible",
        },
        row.text
      );
    }
  }

  // Plot lines
  for (const row of prepare(analysis.plotLines)) {
    if (!row.text) {
      collector.skip("plotLines", row.text, "empty");
    } else if (looksLikeConsequence(row.text)) {
      collector.skip("plotLines", row.text, "not_a_plot_line");
    } else {
      collector.add(
        {
          category: "plotLines",
          entityType: "PLOT_LINE",
          name: row.name,
          payload: {
            entityType: "PLOT_LINE",
            data: { name: row.name, description: row.description },
          },
          reason: "Сюжетная линия извлечена AI из текста Story Bible",
        },
        row.text
      );
    }
  }
}

export function buildProposalDrafts(
  analysis: AnalysisInput,
  existing: ExistingSets = emptyExistingSets()
): DraftResult {
  const collector = new Collector(existing);

  if (analysis.candidates && analysis.candidates.length > 0) {
    draftsFromCandidates(analysis.candidates, collector);
  } else {
    draftsFromLists(analysis, collector);
  }

  return {
    drafts: collector.drafts,
    skipped: collector.skipped,
    notMapped: notMappedCounts(analysis),
  };
}
