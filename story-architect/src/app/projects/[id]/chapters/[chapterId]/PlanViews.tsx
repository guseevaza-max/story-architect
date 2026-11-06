import Link from "next/link";
import type { ChapterPlan } from "@/lib/chapters/loadChapterPage";

/** Показ утверждённого плана и плана сцен (только чтение, без запросов). */

const box: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 16, background: "var(--surface)" };

export function ApprovedPlan({ plan }: { plan: ChapterPlan }) {
  const list = (title: string, items?: string[]) =>
    items?.length ? (
      <div style={{ marginBottom: 18 }}>
        <h3>{title}</h3>
        <ul style={{ lineHeight: 1.6 }}>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </div>
    ) : null;
  const text = (title: string, value?: string) =>
    value ? (
      <div style={{ marginBottom: 18 }}>
        <h3>{title}</h3>
        <p style={{ lineHeight: 1.6 }}>{value}</p>
      </div>
    ) : null;

  return (
    <section style={{ ...box, border: "2px solid var(--warn-border)", background: "var(--warn-bg)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>📋 Утверждённый план главы</h2>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 14 }}>План сформирован Architect и утверждён автором.</p>
        </div>
        <span style={{ padding: "6px 10px", borderRadius: 999, background: "var(--ok-bg)", color: "var(--ok-text)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>✓ Утверждён</span>
      </div>
      {text("Цель главы", plan.chapterPurpose)}
      {text("Начальное состояние", plan.initialState)}
      {text("Конечное состояние", plan.endState)}
      {list("Развитие сюжета", plan.plotDevelopment)}
      {list("Развитие персонажей", plan.characterDevelopment)}
      {list("Обязательно должно произойти", plan.mustHappen)}
      {list("Не должно произойти", plan.mustNotHappen)}
      {plan.openQuestions?.length ? (
        <div>
          <h3>Открытые вопросы</h3>
          <ul style={{ lineHeight: 1.6 }}>
            {plan.openQuestions.map((q, i) => {
              const answer = plan.authorAnswers?.find((a) => a.question === q)?.answer;
              return (
                <li key={i}>
                  {q}
                  {answer ? (
                    <div style={{ marginTop: 6, padding: 10, borderRadius: 8, background: "var(--ok-bg)", border: "1px solid var(--ok-border)" }}>
                      <strong>Ответ автора:</strong> {answer}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export type SceneView = { id: string; order: number; title: string | null; purpose: string | null; plan: unknown; plannedOutcome: string | null; status: string };

export function ApprovedScenes({ scenes }: { scenes: SceneView[] }) {
  return (
    <section style={{ ...box, border: "2px solid var(--violet-border)", background: "var(--violet-bg)" }}>
      <h2 style={{ marginTop: 0 }}>🎬 Утверждённый план сцен ({scenes.length})</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {scenes.map((scene) => {
          const steps = Array.isArray(scene.plan) ? scene.plan.filter((x): x is string => typeof x === "string") : [];
          return (
            <article key={scene.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 18, background: "var(--surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>
                <span>Сцена {scene.order}</span>
                <span>{scene.status}</span>
              </div>
              <h3 style={{ margin: "0 0 12px" }}>{scene.title || `Сцена ${scene.order}`}</h3>
              {scene.purpose && (
                <p style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
                  <strong>Цель:</strong> {scene.purpose}
                </p>
              )}
              {steps.length > 0 && (
                <ul style={{ lineHeight: 1.6 }}>
                  {steps.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              )}
              {scene.plannedOutcome && (
                <p style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
                  <strong>Результат:</strong> {scene.plannedOutcome}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function EmptyNote({ title, children, action }: { title: string; children: React.ReactNode; action?: { href: string; label: string } }) {
  return (
    <section style={{ ...box, background: "var(--surface-2)", borderStyle: "dashed" }}>
      <strong>{title}</strong>
      <div style={{ color: "var(--muted)", marginTop: 6, lineHeight: 1.5, fontSize: 14 }}>{children}</div>
      {action ? (
        <div style={{ marginTop: 12 }}>
          <Link href={action.href} className="sa-btn">
            {action.label}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

export { box as panelBox };
