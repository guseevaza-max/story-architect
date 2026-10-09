import { describe, expect, it } from "vitest";
import {
  EMPTY_STORY_STATE,
  formatStoryState,
} from "../src/lib/context/storyStateFormat";

const solomon = {
  id: "c1",
  name: "Соломон",
  role: "Чемпион",
  tier: 1,
  description: "Попал в чужое тело",
};
const kairen = {
  id: "c2",
  name: "Кайрен",
  role: null,
  tier: 2,
  description: null,
};

describe("formatStoryState", () => {
  it("пустая история даёт понятное сообщение", () => {
    expect(formatStoryState([], [], [])).toBe(EMPTY_STORY_STATE);
  });

  it("побеждает самое новое значение атрибута", () => {
    const text = formatStoryState(
      [solomon],
      [
        { characterId: "c1", attribute: "навык", value: "базовый", order: 1 },
        { characterId: "c1", attribute: "навык", value: "стабильный", order: 2 },
      ],
      []
    );
    expect(text).toContain("навык = стабильный");
    expect(text).not.toContain("базовый");
  });

  it("порядок применения важнее порядка в массиве", () => {
    const text = formatStoryState(
      [solomon],
      [
        { characterId: "c1", attribute: "навык", value: "новый", order: 5 },
        { characterId: "c1", attribute: "навык", value: "старый", order: 1 },
      ],
      []
    );
    expect(text).toContain("навык = новый");
  });

  it("состояния неизвестных персонажей игнорируются", () => {
    const text = formatStoryState(
      [solomon],
      [{ characterId: "ghost", attribute: "x", value: "y", order: 1 }],
      []
    );
    expect(text).not.toContain("ghost");
    expect(text).not.toContain("x = y");
  });

  it("главные персонажи идут раньше второстепенных", () => {
    const text = formatStoryState([kairen, solomon], [], []);
    expect(text.indexOf("Соломон")).toBeLessThan(text.indexOf("Кайрен"));
  });

  it("выводит отношения", () => {
    const text = formatStoryState(
      [solomon],
      [],
      [
        {
          source: "Соломон",
          target: "Кайрен",
          type: "trust",
          reason: "союзники",
        },
      ]
    );
    expect(text).toContain("Соломон → Кайрен [trust]: союзники");
  });

  it("соблюдает бюджет и сообщает об обрезке", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      id: `id${i}`,
      name: `Персонаж ${i}`,
      role: "роль",
      tier: 2,
      description: "описание ".repeat(10),
    }));
    const text = formatStoryState(many, [], [], 2000);
    expect(text.length).toBeLessThan(3000);
    expect(text).toContain("не поместилось в бюджет");
  });
});
