import { describe, expect, it } from "vitest";
import {
  buildProposalDrafts,
  emptyExistingSets,
  looksLikeConsequence,
  looksLikeGovernmentBody,
  looksLikeState,
  normalizeName,
  type Candidate,
} from "../src/lib/storyBible/analysisToProposals";
import { proposalPayloadSchema } from "../src/lib/schemas/proposal";

function candidate(partial: Partial<Candidate> & Pick<Candidate, "kind" | "name">): Candidate {
  return {
    description: "",
    evidence: "",
    confidence: 0.9,
    isOngoing: false,
    eventGroup: "",
    cause: "",
    consequences: "",
    inWorldDate: "",
    ...partial,
  };
}

const reasons = (items: { reason: string }[]) => items.map((i) => i.reason);

describe("регрессия 1: «Империя Пепла» не становится ни фракцией, ни локацией", () => {
  it("двойная классификация вместе с государством: ничего не создаётся", () => {
    const { drafts, skipped } = buildProposalDrafts({
      candidates: [
        candidate({ kind: "state_or_realm", name: "Империя Пепла" }),
        candidate({ kind: "faction", name: "Империя Пепла" }),
        candidate({ kind: "location", name: "Империя Пепла" }),
      ],
    });
    expect(drafts).toEqual([]);
    expect(reasons(skipped).sort()).toEqual([
      "state_not_location",
      "state_not_location",
      "state_not_supported",
    ]);
  });

  it("локация с названием государства отсекается, даже если модель ошиблась с типом", () => {
    const { drafts, skipped } = buildProposalDrafts({
      candidates: [candidate({ kind: "location", name: "Империя Пепла" })],
    });
    expect(drafts).toEqual([]);
    expect(reasons(skipped)).toEqual(["state_not_location"]);
  });

  it("запасной путь: одно название в locations и factions — тип неоднозначен", () => {
    const { drafts, skipped } = buildProposalDrafts({
      locations: ["Империя Пепла"],
      factions: ["Империя Пепла"],
    });
    expect(drafts).toEqual([]);
    expect(reasons(skipped)).toEqual(["ambiguous_type", "ambiguous_type"]);
  });

  it("не государство с двойным типом тоже помечается неоднозначным", () => {
    const { drafts, skipped } = buildProposalDrafts({
      candidates: [
        candidate({ kind: "location", name: "Серый порт" }),
        candidate({ kind: "faction", name: "Серый порт" }),
      ],
    });
    expect(drafts).toEqual([]);
    expect(reasons(skipped)).toEqual(["ambiguous_type", "ambiguous_type"]);
  });

  it("распознаёт названия государств", () => {
    expect(looksLikeState("Империя Пепла")).toBe(true);
    expect(looksLikeState("Объединённая республика")).toBe(true);
    expect(looksLikeState("Ривенхольм")).toBe(false);
  });
});

describe("регрессия 2–3: власть и канцелярия не становятся фракциями", () => {
  it("«Имперская власть» (абстракция) пропускается", () => {
    const { drafts, skipped } = buildProposalDrafts({
      candidates: [candidate({ kind: "abstract_concept", name: "Имперская власть" })],
    });
    expect(drafts).toEqual([]);
    expect(reasons(skipped)).toEqual(["not_a_faction"]);
  });

  it("«Имперская канцелярия» (госорган) пропускается", () => {
    const { drafts, skipped } = buildProposalDrafts({
      candidates: [candidate({ kind: "government_body", name: "Имперская канцелярия" })],
    });
    expect(drafts).toEqual([]);
    expect(reasons(skipped)).toEqual(["not_a_faction"]);
  });

  it("если модель всё же назвала их фракцией, названия отсекаются", () => {
    const { drafts, skipped } = buildProposalDrafts({
      candidates: [
        candidate({ kind: "faction", name: "Имперская власть" }),
        candidate({ kind: "faction", name: "Имперская канцелярия" }),
      ],
    });
    expect(drafts).toEqual([]);
    expect(reasons(skipped)).toEqual(["not_a_faction", "not_a_faction"]);
  });

  it("запасной путь отсекает те же названия в списке фракций", () => {
    const { drafts } = buildProposalDrafts({
      factions: ["Имперская власть", "Имперская канцелярия"],
    });
    expect(drafts).toEqual([]);
  });

  it("настоящая фракция проходит", () => {
    const { drafts } = buildProposalDrafts({
      candidates: [
        candidate({
          kind: "faction",
          name: "Гильдия Стекла",
          description: "Объединение алхимиков",
          evidence: "Мира служит в Гильдии Стекла",
        }),
      ],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.payload.data.type).toBe("FACTION");
    expect(drafts[0]?.reason).toContain("Основание в тексте");
  });

  it("распознаёт госорганы, но не обычные названия", () => {
    expect(looksLikeGovernmentBody("Имперская канцелярия")).toBe(true);
    expect(looksLikeGovernmentBody("Имперская власть")).toBe(true);
    expect(looksLikeGovernmentBody("Гильдия Стекла")).toBe(false);
  });
});

describe("регрессия 4: единичные факты и последствия — не сюжетные линии", () => {
  it("«Лиора не раскрыла заказчика» (единичный факт, isOngoing=false)", () => {
    const { drafts, skipped } = buildProposalDrafts({
      candidates: [
        candidate({ kind: "plot_line", name: "Лиора не раскрыла заказчика", isOngoing: false }),
      ],
    });
    expect(drafts).toEqual([]);
    expect(reasons(skipped)).toEqual(["not_a_plot_line"]);
  });

  it("«Передача секретной карты может иметь последствия» отсекается по формулировке", () => {
    const { drafts, skipped } = buildProposalDrafts({
      candidates: [
        candidate({
          kind: "plot_line",
          name: "Передача секретной карты может иметь последствия",
          isOngoing: true,
        }),
      ],
    });
    expect(drafts).toEqual([]);
    expect(reasons(skipped)).toEqual(["not_a_plot_line"]);
  });

  it("тип consequence_or_fact никогда не становится предложением", () => {
    const { drafts, skipped } = buildProposalDrafts({
      candidates: [candidate({ kind: "consequence_or_fact", name: "Лиора не раскрыла заказчика" })],
    });
    expect(drafts).toEqual([]);
    expect(reasons(skipped)).toEqual(["single_fact"]);
  });

  it("запасной путь отсекает последствия в списке plotLines", () => {
    const { drafts, skipped } = buildProposalDrafts({
      plotLines: ["Передача секретной карты может иметь последствия"],
    });
    expect(drafts).toEqual([]);
    expect(reasons(skipped)).toEqual(["not_a_plot_line"]);
  });

  it("развивающийся конфликт с isOngoing=true становится линией", () => {
    const { drafts } = buildProposalDrafts({
      candidates: [
        candidate({
          kind: "plot_line",
          name: "Поиск заказчика секретной карты",
          description: "Дарен выясняет, кто стоит за картой",
          isOngoing: true,
        }),
      ],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.entityType).toBe("PLOT_LINE");
  });

  it("распознаёт формулировки последствий", () => {
    expect(looksLikeConsequence("Это может иметь последствия")).toBe(true);
    expect(looksLikeConsequence("Поиск заказчика")).toBe(false);
  });
});

describe("регрессия 5: связанные действия объединяются в одно событие", () => {
  const steps = [
    candidate({
      kind: "event",
      name: "Лиора передала Дарену секретную карту",
      description: "Лиора передаёт Дарену секретную карту.",
      eventGroup: "передача карты",
      cause: "Дарен просил помощи",
    }),
    candidate({
      kind: "event",
      name: "Дарен принял карту",
      description: "Дарен принимает карту.",
      eventGroup: "передача карты",
    }),
    candidate({
      kind: "event",
      name: "Лиора скрыла заказчика",
      description: "Лиора не раскрывает, кто заказчик.",
      eventGroup: "передача карты",
      consequences: "Доверие Дарена к Лиоре снизилось.",
    }),
    candidate({
      kind: "event",
      name: "Доверие изменилось",
      description: "Доверие между героями меняется.",
      eventGroup: "Передача карты",
    }),
  ];

  it("четыре шага одного эпизода — одно предложение", () => {
    const { drafts } = buildProposalDrafts({ candidates: steps });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.entityType).toBe("EVENT");
    expect(drafts[0]?.reason).toContain("объединено шагов: 4");
  });

  it("ничего значимого не теряется: все детали, причина и последствия на месте", () => {
    const data = (buildProposalDrafts({ candidates: steps }).drafts[0]?.payload
      .data ?? {}) as Record<string, string>;
    expect(data.description).toContain("передаёт Дарену секретную карту");
    expect(data.description).toContain("принимает карту");
    expect(data.description).toContain("не раскрывает, кто заказчик");
    expect(data.description).toContain("Доверие между героями меняется");
    expect(data.cause).toBe("Дарен просил помощи");
    expect(data.consequences).toContain("Доверие Дарена к Лиоре снизилось");
  });

  it("независимые события без общей группы остаются отдельными", () => {
    const { drafts } = buildProposalDrafts({
      candidates: [
        candidate({ kind: "event", name: "Падение Ривенхольма" }),
        candidate({ kind: "event", name: "Коронация Горана" }),
      ],
    });
    expect(drafts).toHaveLength(2);
  });

  it("объединённое событие проходит реальную Zod-схему предложений", () => {
    const { drafts } = buildProposalDrafts({ candidates: steps });
    for (const draft of drafts) {
      expect(proposalPayloadSchema.safeParse(draft.payload).success).toBe(true);
    }
  });
});

describe("неоднозначность, уверенность и повторный анализ", () => {
  it("неизвестный тип (other) пропускается с причиной", () => {
    const { drafts, skipped } = buildProposalDrafts({
      candidates: [candidate({ kind: "other", name: "Нечто странное" })],
    });
    expect(drafts).toEqual([]);
    expect(reasons(skipped)).toEqual(["unsupported_kind"]);
  });

  it("низкая уверенность в типе блокирует создание", () => {
    const { drafts, skipped } = buildProposalDrafts({
      candidates: [candidate({ kind: "location", name: "Тихая гавань", confidence: 0.3 })],
    });
    expect(drafts).toEqual([]);
    expect(reasons(skipped)).toEqual(["low_confidence"]);
  });

  it("безымянная фигура не становится персонажем", () => {
    const { drafts, skipped } = buildProposalDrafts({
      candidates: [
        candidate({ kind: "unnamed_figure", name: "Человек в сером плаще" }),
        candidate({ kind: "character", name: "Незнакомец у пристани" }),
        candidate({ kind: "character", name: "Дарен Вейр" }),
      ],
    });
    expect(drafts.map((d) => d.name)).toEqual(["Дарен Вейр"]);
    expect(reasons(skipped)).toEqual(["unnamed", "unnamed"]);
  });

  it("при наличии candidates плоские списки для создания не используются", () => {
    const { drafts } = buildProposalDrafts({
      candidates: [candidate({ kind: "character", name: "Дарен Вейр" })],
      characters: ["Кто-то ещё — лишний"],
      locations: ["Лишнее место"],
    });
    expect(drafts.map((d) => d.name)).toEqual(["Дарен Вейр"]);
  });

  it("повторный анализ не создаёт дублей, включая объединённое событие", () => {
    const input = {
      candidates: [
        candidate({ kind: "character", name: "Дарен Вейр" }),
        candidate({ kind: "location", name: "Серый порт" }),
        candidate({ kind: "event", name: "Передача карты", eventGroup: "карта" }),
        candidate({ kind: "event", name: "Принятие карты", eventGroup: "карта" }),
      ],
    };
    const first = buildProposalDrafts(input);
    expect(first.drafts).toHaveLength(3);

    const existing = emptyExistingSets();
    for (const d of first.drafts) {
      existing.pending[d.entityType].add(normalizeName(d.name));
    }

    const second = buildProposalDrafts(input, existing);
    expect(second.drafts).toEqual([]);
    expect(reasons(second.skipped)).toEqual([
      "duplicate_pending",
      "duplicate_pending",
      "duplicate_pending",
    ]);
  });

  it("нормализация не различает кавычки, регистр и «ё»", () => {
    expect(normalizeName("«Ёлочный  Порт»")).toBe(normalizeName("елочный порт"));
  });

  it("предложения не меняют Canon: создаются только черновики с PENDING-данными", () => {
    const { drafts } = buildProposalDrafts({
      candidates: [candidate({ kind: "character", name: "Дарен Вейр" })],
    });
    // Модуль не работает с базой: на выходе только описание будущего предложения.
    expect(Object.keys(drafts[0] ?? {}).sort()).toEqual([
      "category",
      "entityType",
      "name",
      "payload",
      "reason",
    ]);
  });
});
