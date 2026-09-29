"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MemoryUpdate = { type: string; title: string; content: string; safety: "SAFE" | "UNCERTAIN" | "CONFLICT"; confidence: number; reason: string };
type MemoryProposal = { id: string; status: string; safety: string; payload: { chapterId: string; chapterNumber?: number; shortSummary: string; fullSummary?: string; worldDelta?: { changes?: string[] }; updates: MemoryUpdate[]; counts?: { total?: number; safe?: number; uncertain?: number; conflicts?: number } } };

export default function MemoryUpdateButton({ projectId, chapterId }: { projectId: string; chapterId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<MemoryProposal | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [result, setResult] = useState<any>(null);

  function applyProposal(p: MemoryProposal) {
    setProposal(p);
    setResult(null);
    setSelected((p.payload.updates || []).map((item, index) => item.safety === "SAFE" ? index : -1).filter((index) => index >= 0));
  }

  async function loadPendingProposal() {
    try {
      const response = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/memory`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.proposal) return;
      applyProposal(data.proposal);
    } catch (loadError) {
      console.error("Memory proposal load error:", loadError);
    }
  }

  useEffect(() => { loadPendingProposal(); }, [projectId, chapterId]);

  async function handleMemoryUpdate() {
    setLoading(true); setError(""); setResult(null); setActionMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/memory`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Не удалось выполнить Memory Update."); return; }
      if (data.proposal?.payload) applyProposal(data.proposal);
      setResult(data);
      router.refresh();
    } catch (requestError) { console.error(requestError); setError("Ошибка соединения с сервером."); }
    finally { setLoading(false); }
  }

  function toggleUpdate(index: number) { setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]); }
  function selectAllSafe() { if (proposal) setSelected(proposal.payload.updates.map((item, index) => item.safety === "SAFE" ? index : -1).filter((index) => index >= 0)); }

  async function handleProposalAction(action: "ACCEPT" | "REJECT") {
    if (!proposal) return;
    const selectedUpdates = proposal.payload.updates.filter((_, index) => selected.includes(index));
    if (action === "ACCEPT" && selectedUpdates.length === 0) { setError("Выбери хотя бы одно изменение памяти."); return; }
    setActionLoading(true); setError(""); setActionMessage("");
    try {
      const editedPayload = {
        ...proposal.payload,
        updates: selectedUpdates,
        worldDelta: { changes: selectedUpdates.map((item) => `${item.title}: ${item.content}`) },
        counts: { total: selectedUpdates.length, safe: selectedUpdates.filter((item) => item.safety === "SAFE").length, uncertain: selectedUpdates.filter((item) => item.safety === "UNCERTAIN").length, conflicts: selectedUpdates.filter((item) => item.safety === "CONFLICT").length },
      };
      const response = await fetch(`/api/proposals/${proposal.id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "ACCEPT" ? { action: "EDIT_AND_ACCEPT", editedPayload } : { action: "REJECT" }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Не удалось обработать Memory Proposal."); return; }
      setProposal(null); setSelected([]); setActionMessage(action === "ACCEPT" ? `Принято изменений: ${selectedUpdates.length}. Они добавлены в Memory.` : "Memory Proposal отклонён."); router.refresh();
    } catch (actionError) { console.error(actionError); setError("Ошибка соединения с сервером."); }
    finally { setActionLoading(false); }
  }

  const selectedCount = proposal ? proposal.payload.updates.filter((_, index) => selected.includes(index)).length : 0;

  return (
    <div>
      <button type="button" onClick={handleMemoryUpdate} disabled={loading} style={{ padding: "12px 20px", borderRadius: 8, border: "none", background: loading ? "#777" : "#2563eb", color: "#fff", cursor: loading ? "default" : "pointer", fontWeight: 600, fontSize: 14 }}>
        {loading ? "⏳ Анализируем память..." : "🧠 Обновить Memory"}
      </button>

      {error && <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "#fff1f2", color: "#991b1b", fontSize: 14 }}>{error}</div>}
      {actionMessage && <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "#ecfdf5", color: "#166534", fontSize: 14 }}>✓ {actionMessage}</div>}

      {result && !proposal && <div style={{ marginTop: 16, padding: 16, border: "1px solid #cbd5e1", borderRadius: 10, background: "#f8fafc" }}><h3 style={{ marginTop: 0 }}>🧠 Memory Extraction готов</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(100px, 1fr))", gap: 10 }}><div><strong>{result.summary?.total ?? 0}</strong><div>Всего</div></div><div><strong>{result.summary?.safe ?? 0}</strong><div>Безопасных</div></div><div><strong>{result.summary?.uncertain ?? 0}</strong><div>Неопределённых</div></div><div><strong>{result.summary?.conflicts ?? 0}</strong><div>Конфликтов</div></div></div></div>}

      {proposal && (
        <section style={{ marginTop: 16, padding: 18, border: "2px solid #d9c58b", borderRadius: 10, background: "#fffdf5" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}><h3 style={{ margin: 0 }}>🧠 Memory Proposal</h3><span style={{ padding: "5px 9px", borderRadius: 999, background: proposal.safety === "CONFLICT" ? "#fee2e2" : proposal.safety === "UNCERTAIN" ? "#fef3c7" : "#dcfce7", fontSize: 12, fontWeight: 600 }}>{proposal.safety}</span></div>
          <p style={{ color: "#666", lineHeight: 1.5 }}>AI подготовил изменения памяти. Они <strong>не становятся Canon автоматически</strong> — автор сам выбирает, что принять.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}><button type="button" onClick={selectAllSafe} style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}>✓ Выбрать безопасные</button><button type="button" onClick={() => setSelected([])} style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}>Снять выбор</button></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{proposal.payload.updates.map((item, index) => { const checked = selected.includes(index); return <label key={`${proposal.id}-${index}`} style={{ display: "block", padding: 14, border: checked ? "2px solid #86b99a" : "1px solid #ddd", borderRadius: 9, background: checked ? "#f7fff8" : "#fff", cursor: "pointer" }}><div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={checked} onChange={() => toggleUpdate(index)} style={{ marginTop: 4 }} /><div style={{ flex: 1 }}><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}><strong>{item.title}</strong><span style={{ fontSize: 11, padding: "3px 7px", borderRadius: 999, background: item.safety === "SAFE" ? "#dcfce7" : item.safety === "UNCERTAIN" ? "#fef3c7" : "#fee2e2" }}>{item.safety}</span><span style={{ fontSize: 11, color: "#777" }}>confidence {(Number(item.confidence || 0) * 100).toFixed(0)}%</span></div><div style={{ color: "#444", lineHeight: 1.5 }}>{item.content}</div><div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>Почему: {item.reason}</div></div></div></label>; })}</div>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #ddd", display: "flex", gap: 10, flexWrap: "wrap" }}><button type="button" onClick={() => handleProposalAction("ACCEPT")} disabled={actionLoading || selectedCount === 0} style={{ padding: "11px 16px", borderRadius: 8, border: "none", background: actionLoading || selectedCount === 0 ? "#aaa" : "#166534", color: "#fff", cursor: actionLoading || selectedCount === 0 ? "default" : "pointer", fontWeight: 600 }}>{actionLoading ? "⏳ Сохраняем..." : `✓ Принять выбранные (${selectedCount})`}</button><button type="button" onClick={() => handleProposalAction("REJECT")} disabled={actionLoading} style={{ padding: "11px 16px", borderRadius: 8, border: "1px solid #b91c1c", background: "#fff", color: "#b91c1c", cursor: actionLoading ? "default" : "pointer", fontWeight: 600 }}>Отклонить Proposal</button></div>
        </section>
      )}
    </div>
  );
}
