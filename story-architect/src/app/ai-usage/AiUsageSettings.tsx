"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Price = {
  id: string;
  provider: string;
  model: string;
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M: number | null;
  source: string | null;
  effectiveFrom: string;
};

const input: React.CSSProperties = { padding: 6, marginRight: 8, marginBottom: 8 };
const card: React.CSSProperties = { border: "1px solid #ddd", borderRadius: 12, padding: 20, marginBottom: 16, background: "#fff" };

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Ошибка запроса");
}

export default function AiUsageSettings({ limitUsd, warnPercent, prices }: { limitUsd: number; warnPercent: number; prices: Price[] }) {
  const router = useRouter();
  const [limit, setLimit] = useState(String(limitUsd));
  const [warn, setWarn] = useState(String(warnPercent));
  const [form, setForm] = useState({ provider: "openai", model: "", inputPer1M: "", outputPer1M: "", cachedInputPer1M: "", source: "" });
  const [message, setMessage] = useState("");

  const run = async (fn: () => Promise<void>, ok: string) => {
    setMessage("");
    try {
      await fn();
      setMessage(ok);
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <>
      {message && <p>{message}</p>}

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Месячный лимит</h2>
        <label>Лимит, USD <input style={input} value={limit} onChange={(e) => setLimit(e.target.value)} size={8} /></label>
        <label>Предупреждение, % <input style={input} value={warn} onChange={(e) => setWarn(e.target.value)} size={4} /></label>
        <button onClick={() => run(() => send("/api/ai-usage/budget", "PATCH", { monthlyLimitUsd: Number(limit), warnPercent: Number(warn) }), "Лимит сохранён.")}>
          Сохранить
        </button>
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Тарифы моделей (USD за 1 млн токенов)</h2>
        <p style={{ color: "#555" }}>
          Стартовые цены взяты из вторичных источников и не подтверждены официальной страницей провайдера. Сверьте их
          с вашим кабинетом. Новая цена добавляется отдельной записью и действует на вызовы после сохранения, прошлые
          расходы не пересчитываются.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <thead>
            <tr>
              {["Провайдер", "Модель", "Вход", "Кэш", "Выход", "Действует с", "Источник"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #ddd" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prices.map((p) => (
              <tr key={p.id}>
                <td style={{ padding: "6px 8px" }}>{p.provider}</td>
                <td style={{ padding: "6px 8px" }}>{p.model}</td>
                <td style={{ padding: "6px 8px" }}>{p.inputPer1M}</td>
                <td style={{ padding: "6px 8px" }}>{p.cachedInputPer1M ?? "—"}</td>
                <td style={{ padding: "6px 8px" }}>{p.outputPer1M}</td>
                <td style={{ padding: "6px 8px" }}>{p.effectiveFrom.slice(0, 10)}</td>
                <td style={{ padding: "6px 8px" }}>{p.source ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Добавить или обновить тариф</h3>
        <input style={input} placeholder="Провайдер (openai)" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
        <input style={input} placeholder="Модель" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
        <input style={input} placeholder="Вход" size={6} value={form.inputPer1M} onChange={(e) => setForm({ ...form, inputPer1M: e.target.value })} />
        <input style={input} placeholder="Кэш (необяз.)" size={8} value={form.cachedInputPer1M} onChange={(e) => setForm({ ...form, cachedInputPer1M: e.target.value })} />
        <input style={input} placeholder="Выход" size={6} value={form.outputPer1M} onChange={(e) => setForm({ ...form, outputPer1M: e.target.value })} />
        <input style={input} placeholder="Источник цены" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        <button
          onClick={() =>
            run(
              () =>
                send("/api/ai-usage/prices", "PUT", {
                  provider: form.provider,
                  model: form.model,
                  inputPer1M: Number(form.inputPer1M),
                  outputPer1M: Number(form.outputPer1M),
                  cachedInputPer1M: form.cachedInputPer1M.trim() === "" ? null : Number(form.cachedInputPer1M),
                  source: form.source,
                }),
              "Тариф добавлен."
            )
          }
        >
          Сохранить тариф
        </button>
      </section>
    </>
  );
}
