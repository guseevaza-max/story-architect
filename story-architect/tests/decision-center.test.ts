import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const CARD = "src/components/proposals/ProposalCard.tsx";
const DEC = "src/components/proposals/ChapterDecisions.tsx";
const PAGE = "src/app/projects/[id]/proposals/page.tsx";

describe("Центр решений: общая карточка", () => {
  it("страница предложений использует общую карточку и тот же маршрут действия", () => {
    const page = read(PAGE);
    expect(page).toContain("ProposalCard");
    expect(page).toContain("/api/proposals/${proposalId}/action");
    expect(page).not.toContain("renderChapterPlan");
  });

  it("карточка сама ничего не отправляет: только onAction", () => {
    const card = read(CARD);
    expect(card).not.toMatch(/fetch\(/);
    expect(card).toContain("onAction");
    expect(card).toContain("EDIT_AND_ACCEPT");
    expect(card).toContain("authorAnswers");
  });

  it("вкладка главы принимает через тот же маршрут, без автопринятия", () => {
    const dec = read(DEC);
    expect(dec).toContain("/api/proposals/${proposalId}/action");
    expect(dec).toContain("ProposalCard");
    expect(dec).toContain("Автоматически ничего не принимается");
    expect(dec).not.toMatch(/useEffect/);
    expect(dec).not.toMatch(/"ACCEPT"[^;]*useState|handleAction\([^)]*"ACCEPT"/);
  });

  it("история только для чтения и не содержит кнопок действий", () => {
    const dec = read(DEC);
    const hist = dec.slice(dec.indexOf("История решений"));
    expect(hist).not.toContain("<button");
    expect(hist).not.toContain("onAction");
  });

  it("загрузчик: история — решённые планы этой главы", () => {
    const src = read("src/lib/chapters/loadChapterPage.ts");
    expect(src).toContain('"ACCEPTED", "REJECTED", "SUPERSEDED"');
    expect(src).toContain("history");
  });
});
