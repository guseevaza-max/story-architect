import { describe, it, expect } from "vitest";
import {
  transitionProposal,
  isUsableAsCanon,
  isContextEligible,
} from "../src/lib/canon/proposal-state";

// ТЗ, тест 5: предложение остаётся предложением до одобрения автором.
describe("Шлюз канона", () => {
  it("AI не может принять собственное предложение", () => {
    expect(() =>
      transitionProposal({ current: "PENDING", action: "ACCEPT", actorType: "AI" })
    ).toThrow(/только автору/);
  });

  it("система не может принять предложение", () => {
    expect(() =>
      transitionProposal({
        current: "PENDING",
        action: "ACCEPT",
        actorType: "SYSTEM",
      })
    ).toThrow(/только автору/);
  });

  it("принятие автором меняет канон", () => {
    const r = transitionProposal({
      current: "PENDING",
      action: "ACCEPT",
      actorType: "AUTHOR",
    });
    expect(r).toEqual({ next: "ACCEPTED", mutatesCanon: true });
  });

  it("правка перед принятием тоже меняет канон", () => {
    const r = transitionProposal({
      current: "PENDING",
      action: "EDIT_AND_ACCEPT",
      actorType: "AUTHOR",
    });
    expect(r.mutatesCanon).toBe(true);
  });

  it("отклонение канон не меняет", () => {
    const r = transitionProposal({
      current: "PENDING",
      action: "REJECT",
      actorType: "AUTHOR",
    });
    expect(r).toEqual({ next: "REJECTED", mutatesCanon: false });
  });

  // ТЗ, тест 6: отклонённое предложение не используется как канон.
  it("решение автора не перезаписывается повторным прогоном", () => {
    for (const current of ["ACCEPTED", "REJECTED", "SUPERSEDED"] as const) {
      expect(() =>
        transitionProposal({ current, action: "ACCEPT", actorType: "AUTHOR" })
      ).toThrow(/переход невозможен/);
    }
  });

  it("каноном считается только статус CANON", () => {
    expect(isUsableAsCanon("CANON")).toBe(true);
    for (const s of ["PROPOSAL", "DRAFT", "REJECTED", "UNKNOWN"]) {
      expect(isUsableAsCanon(s)).toBe(false);
    }
  });

  it("UNKNOWN попадает в контекст, но каноном не является", () => {
    expect(isContextEligible("UNKNOWN")).toBe(true);
    expect(isUsableAsCanon("UNKNOWN")).toBe(false);
    expect(isContextEligible("REJECTED")).toBe(false);
  });
});
