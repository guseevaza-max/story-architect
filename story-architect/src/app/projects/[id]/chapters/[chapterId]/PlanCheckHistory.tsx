import { PLAN_STATUS_LABEL, planReportStatus, type PlanHistoryItem } from "@/lib/ux/planHistory";

/** История проверок плана и сцен. Только чтение: ничего не запускает и не меняет. */
export default function PlanCheckHistory({ items }: { items: PlanHistoryItem[] }) {
  if (items.length === 0) return null;
  return (
    <details style={{ marginTop: 16, border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", background: "var(--surface)" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>История проверок плана ({items.length})</summary>
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {items.map((item) => (
          <div key={item.id} style={{ paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
            <div style={{ fontWeight: 600 }}>
              {PLAN_STATUS_LABEL[planReportStatus(item.issues)]}{" "}
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                · {new Date(item.createdAt).toLocaleString("ru-RU")} · замечаний: {item.issues.length}
              </span>
            </div>
            {item.summary && <p style={{ margin: "6px 0", color: "var(--text-2)", lineHeight: 1.5 }}>{item.summary}</p>}
            {item.issues.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-2)", lineHeight: 1.6 }}>
                {item.issues.map((issue, index) => (
                  <li key={index}>{issue.title}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
