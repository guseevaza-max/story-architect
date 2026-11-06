"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import StatusBadge from "@/components/StatusBadge";
import { STAGES, nextTabIndex, stageHref, type StageKey, type StageState } from "@/lib/ux/chapterWorkspace";

const MARK: Record<StageState, string> = { done: "✓", todo: "•", optional: "" };

/**
 * Рабочее пространство главы: пять вкладок. Содержимое каждой вкладки
 * создаёт сервер; здесь они лишь показываются и скрываются. Скрытые вкладки
 * НЕ размонтируются, поэтому несохранённый текст редактора не теряется.
 * Переключение вкладок ничего не запрашивает и не запускает ИИ.
 */
export default function ChapterWorkspace({
  initialStage,
  basePath,
  legacyHref,
  backHref,
  title,
  bookChapter,
  status,
  statusLabel,
  states,
  recommendation,
  panels,
}: {
  initialStage: StageKey;
  basePath: string;
  legacyHref: string;
  backHref: string;
  title: string;
  bookChapter: string;
  status: string;
  statusLabel: string;
  states: Record<StageKey, StageState>;
  recommendation: { stage: StageKey; text: string };
  panels: Record<StageKey, ReactNode>;
}) {
  const [stage, setStage] = useState<StageKey>(initialStage);
  // ссылка вида ?tab=… на этой же странице переключает вкладку без перезагрузки
  useEffect(() => {
    setStage(initialStage);
  }, [initialStage]);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function select(next: StageKey) {
    setStage(next);
    try {
      window.history.replaceState(null, "", stageHref(basePath, next));
    } catch {
      // адрес не обязателен для работы вкладок
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = nextTabIndex(event.key, index, STAGES.length);
    if (target === null) return;
    event.preventDefault();
    select(STAGES[target]!.key);
    tabRefs.current[target]?.focus();
  }

  const recommended = STAGES.find((s) => s.key === recommendation.stage)!;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 24px 80px", fontFamily: "var(--font-ui), system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 14 }}>
        <Link href={backHref} style={{ color: "var(--text-2)", textDecoration: "none" }}>
          ← Назад к главам
        </Link>
        <Link href={legacyHref} style={{ color: "var(--muted)" }} title="Прежний вид страницы главы, все блоки подряд">
          Старый вид главы
        </Link>
      </div>

      <div style={{ fontSize: 13, color: "var(--muted)", margin: "16px 0 6px" }}>{bookChapter}</div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 30, margin: 0 }}>{title}</h1>
        <StatusBadge aria-label="Статус главы" status={status} label={statusLabel} prefix="Статус: " />
      </div>

      <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: "var(--info-bg)", fontSize: 14, lineHeight: 1.5 }}>
        <strong>Рекомендуем:</strong> {recommendation.text}{" "}
        {stage !== recommendation.stage && (
          <button type="button" onClick={() => select(recommendation.stage)} style={{ border: "none", background: "none", color: "var(--info-text)", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
            Открыть «{recommended.label}»
          </button>
        )}
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Это подсказка: открывать этапы можно в любом порядке.</div>
      </div>

      <div role="tablist" aria-label="Этапы работы над главой" style={{ display: "flex", gap: 4, marginTop: 20, overflowX: "auto", borderBottom: "1px solid var(--border)" }}>
        {STAGES.map((s, i) => {
          const active = s.key === stage;
          return (
            <button
              key={s.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${s.key}`}
              aria-selected={active}
              aria-controls={`panel-${s.key}`}
              tabIndex={active ? 0 : -1}
              title={s.hint}
              onClick={() => select(s.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              style={{
                padding: "10px 14px",
                border: "none",
                borderBottom: active ? "3px solid var(--text)" : "3px solid transparent",
                background: "none",
                fontSize: 15,
                fontWeight: active ? 700 : 500,
                color: active ? "var(--text)" : "var(--text-2)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {i + 1}. {s.label}
              {MARK[states[s.key]] && <span aria-hidden="true"> {MARK[states[s.key]]}</span>}
              {states[s.key] === "done" && <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}> (сделано)</span>}
            </button>
          );
        })}
      </div>

      {STAGES.map((s) => (
        <section key={s.key} role="tabpanel" id={`panel-${s.key}`} aria-labelledby={`tab-${s.key}`} hidden={s.key !== stage} style={{ paddingTop: 20 }}>
          {panels[s.key]}
        </section>
      ))}
    </main>
  );
}
