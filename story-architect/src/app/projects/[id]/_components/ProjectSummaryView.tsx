import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { STATUS_LABEL, chapterTab, visibleChapters } from "@/lib/ux/nav";
import { stageHref } from "@/lib/ux/chapterWorkspace";
import type { ProjectSummary } from "@/lib/ux/summary";

const card: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 12, padding: 20, background: "var(--surface)" };
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

/** Рабочий стол-пульт: что делать дальше, ждущие решения, расход, ряд глав. Только показ. */
export default function ProjectSummaryView({ projectId, summary }: { projectId: string; summary: ProjectSummary | null }) {
  if (!summary) {
    return (
      <section style={{ ...card, marginTop: 24, color: "var(--danger-text)", background: "var(--danger-bg)" }}>
        Не удалось собрать сводку. Все разделы доступны ниже и в верхней навигации.
      </section>
    );
  }
  const { next, pending, budget, statusCounts, totalWords, chapters, threads } = summary;
  const percent = budget && budget.limitUsd > 0 ? (budget.usedUsd / budget.limitUsd) * 100 : 0;
  const warn = !!budget && percent >= budget.warnPercent;
  const shown = visibleChapters(chapters, 12);
  const base = `/projects/${projectId}`;

  return (
    <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
      <div className="sa-pulse">
        <section className="sa-card sa-hero">
          <div style={{ fontSize: 13, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>Продолжить работу</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 26, lineHeight: 1.25 }}>{next.title}</h2>
          <p style={{ margin: "0 0 18px", color: "var(--text-2)", maxWidth: 560 }}>{next.text}</p>
          <Link href={next.href} className="sa-btn sa-btn-primary" style={{ padding: "10px 18px", fontSize: 15 }}>
            Продолжить →
          </Link>
        </section>

        <section className="sa-card" style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Ждут вашего решения</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 2 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: pending.total > 0 ? "var(--accent)" : "var(--text)" }}>{pending.total}</span>
              <Link href={`${base}/proposals`}>Центр решений →</Link>
            </div>
            {pending.byKind.length > 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{pending.byKind.map((k) => `${k.label}: ${k.count}`).join(" · ")}</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>Расход ИИ за месяц</div>
            {budget ? (
              <>
                <div style={{ color: warn ? "var(--danger-text)" : undefined }}>
                  {usd(budget.usedUsd)} из {usd(budget.limitUsd)}
                  {warn ? " — близко к лимиту" : ""}
                </div>
                <div style={{ height: 8, background: "var(--surface-3)", borderRadius: 4, overflow: "hidden", margin: "6px 0" }} aria-label={`Израсходовано ${percent.toFixed(1)}%`}>
                  <div style={{ width: `${Math.min(100, percent)}%`, height: "100%", background: warn ? "var(--danger-solid)" : "var(--accent)" }} />
                </div>
              </>
            ) : (
              <div style={{ color: "var(--muted)" }}>Данные о расходах недоступны.</div>
            )}
            <Link href="/ai-usage" style={{ fontSize: 14 }}>
              Подробнее →
            </Link>
          </div>
        </section>
      </div>

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, margin: "8px 0 12px" }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>
            Главы
            {chapters.length > 0 && (
              <span style={{ marginLeft: 10, fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>
                {chapters.length} · слов в черновиках: {totalWords}
              </span>
            )}
          </h2>
          <Link href={`${base}/chapters`}>Все главы →</Link>
        </div>

        {chapters.length === 0 ? (
          <div className="sa-card" style={{ borderStyle: "dashed", color: "var(--muted)" }}>
            Глав пока нет. <Link href={`${base}/chapters`}>Создать первую главу →</Link>
          </div>
        ) : (
          <>
            {statusCounts.length > 1 && (
              <ul style={{ margin: "0 0 12px", padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
                {statusCounts.map((s) => (
                  <li key={s.status}>
                    <StatusBadge status={s.status} label={`${s.label}: ${s.count}`} />
                  </li>
                ))}
              </ul>
            )}
            <div className="sa-chapters">
              {shown.map((c) => (
                <Link key={c.id} href={stageHref(`${base}/chapters/${c.id}`, chapterTab(c))} className={`sa-chapter${c.id === next.chapterId ? " sa-chapter-current" : ""}`}>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>Глава {c.number}</span>
                  <strong style={{ lineHeight: 1.3 }}>{c.title || "Без названия"}</strong>
                  <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: "auto" }}>
                    <StatusBadge status={c.status} label={STATUS_LABEL[c.status] ?? c.status} />
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>{c.words ? `${c.words} сл.` : "нет текста"}</span>
                  </span>
                </Link>
              ))}
            </div>
            {shown.length < chapters.length && <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 0 }}>Показаны главы вокруг текущей. Остальные — в разделе «Все главы».</p>}
          </>
        )}
      </section>

      <section className="sa-card">
        <h3 style={{ marginTop: 0 }}>Недавние беседы с Соавтором</h3>
        {threads.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>Бесед пока нет. Откройте панель «💬 Соавтор» справа внизу.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {threads.map((t) => (
              <li key={t.id}>
                {t.mode === "CRITIC" ? "Критик · " : ""}
                {t.title}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

