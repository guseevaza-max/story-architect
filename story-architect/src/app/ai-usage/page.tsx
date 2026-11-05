import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { loadUsageOverview, parseMonth } from "@/lib/ai/usageReport";
import type { UsageGroup } from "@/lib/ai/usage";
import AiUsageSettings from "./AiUsageSettings";

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const th: React.CSSProperties = { textAlign: "left", padding: "6px 10px", borderBottom: "1px solid #ddd" };
const td: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #eee" };
const card: React.CSSProperties = { border: "1px solid #ddd", borderRadius: 12, padding: 20, marginBottom: 16, background: "#fff" };

function Table({ title, groups, label }: { title: string; groups: UsageGroup[]; label?: (key: string) => string }) {
  return (
    <section style={card}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {groups.length === 0 ? (
        <p style={{ color: "#555" }}>Пока нет вызовов.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Название</th>
              <th style={th}>Вызовов</th>
              <th style={th}>Известная стоимость</th>
              <th style={th}>Стоимость неизвестна</th>
              <th style={th}>Токены (вход / кэш / выход)</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key}>
                <td style={td}>{label ? label(g.key) : g.key}</td>
                <td style={td}>{g.calls}{g.failedCalls ? ` (ошибок: ${g.failedCalls})` : ""}</td>
                <td style={td}>{usd(g.knownCostUsd)}</td>
                <td style={td}>{g.unknownCostCalls ? `${g.unknownCostCalls} выз.` : "—"}</td>
                <td style={td}>{g.inputTokens} / {g.cachedTokens} / {g.outputTokens}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function AiUsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const raw = (await searchParams).month;
  const month = parseMonth(Array.isArray(raw) ? raw[0] : raw);
  const data = await loadUsageOverview(prisma, session.user.id, month);

  const percent = data.limitUsd > 0 ? (data.budgetUsedUsd / data.limitUsd) * 100 : 0;
  const warn = percent >= data.warnPercent;
  const { total } = data.report;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <Link href="/">← На главную</Link>
      <h1>💰 Расходы ИИ</h1>
      <form method="get" style={{ marginBottom: 16 }}>
        Месяц (ГГГГ-ММ, по UTC): <input name="month" defaultValue={month} size={8} />{" "}
        <button type="submit">Показать</button>
      </form>

      <section style={{ ...card, borderColor: warn ? "#e8a5a0" : "#ddd", background: warn ? "#fdecea" : "#fff" }}>
        <h2 style={{ marginTop: 0 }}>Лимит месяца {month}</h2>
        <p style={{ fontSize: 20, margin: "4px 0" }}>
          {usd(data.budgetUsedUsd)} из {usd(data.limitUsd)} ({percent.toFixed(1)}%)
        </p>
        <div style={{ height: 10, background: "#eee", borderRadius: 5, overflow: "hidden", maxWidth: 400 }}>
          <div style={{ width: `${Math.min(percent, 100)}%`, height: "100%", background: warn ? "#c62828" : "#2e7d32" }} />
        </div>
        {warn && <p style={{ color: "#b00020" }}>Использовано {data.warnPercent}% и больше. При 100% новые вызовы блокируются.</p>}
        <p style={{ color: "#555" }}>
          В счётчик входят известные расходы ({usd(data.counter.spentUsd)}), консервативный учёт вызовов с неизвестной
          стоимостью ({usd(data.counter.assumedUsd)}) и резерв выполняющихся вызовов ({usd(data.counter.reservedUsd)}).
        </p>
        <p style={{ color: "#555" }}>
          Учтены вызовы только тех функций, которые подключены к учёту (сейчас пилот: Scene Planner, плюс прошлые записи
          Architect и Memory Extraction без стоимости). Остальные функции пока не отражаются в расходах.
        </p>
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Итого по записям AiRun за месяц</h2>
        <p>
          Вызовов: <strong>{total.calls}</strong> · известная стоимость: <strong>{usd(total.knownCostUsd)}</strong> ·
          вызовов с неизвестной стоимостью: <strong>{total.unknownCostCalls}</strong>
          {total.unknownCostCalls > 0 && " (сумма выше без них, это не ноль, а отсутствие данных)"}
        </p>
      </section>

      <Table title="По функциям" groups={data.report.byRole} />
      <Table title="По моделям" groups={data.report.byModel} />
      <Table title="По дням (UTC)" groups={data.report.byDay} />
      <Table title="По проектам" groups={data.report.byProject} label={(key) => data.projectNames[key] ?? key} />

      <AiUsageSettings limitUsd={data.limitUsd} warnPercent={data.warnPercent} prices={data.prices} />
    </main>
  );
}
