import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadCharacterCard } from "@/lib/characters/loadCharacterCard";
import { TIER_LABEL, attributeLabel, knowledgeLabel, relationLabel, valueText } from "@/lib/ux/characterCard";

const box = { border: "1px solid var(--border)", borderRadius: 14, padding: 20, background: "var(--surface)", marginBottom: 16 } as const;
const muted = { color: "var(--muted)" } as const;

const PROFILE: [string, "role" | "description" | "appearance" | "history" | "personality" | "goals" | "fears" | "beliefs" | "values"][] = [
  ["Роль", "role"],
  ["Описание", "description"],
  ["Внешность", "appearance"],
  ["История", "history"],
  ["Характер", "personality"],
  ["Цели", "goals"],
  ["Страхи", "fears"],
  ["Убеждения", "beliefs"],
  ["Ценности", "values"],
];

export default async function CharacterCardPage({ params }: { params: Promise<{ id: string; characterId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id, characterId } = await params;
  const data = await loadCharacterCard(session.user.id, id, characterId);
  if (!data) notFound();

  const { project, character, current, history, relationships } = data;
  const secrets = character.knowledge.filter((k) => k.holderType === "CHARACTER");

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 40, fontFamily: "var(--font-ui), system-ui, sans-serif" }}>
      <p>
        <Link href={`/projects/${project.id}/characters`}>← Все персонажи</Link>
      </p>

      <h1 style={{ marginBottom: 6 }}>{character.name}</h1>
      <p style={{ ...muted, marginTop: 0 }}>
        {TIER_LABEL[character.tier] ?? "Персонаж"} · {character.canonLevel === "HARD" ? "жёсткий Canon" : "мягкий Canon"} · проект {project.name}
      </p>
      <p style={{ ...muted, fontSize: 14 }}>Карточка только для чтения. Изменения вносятся через предложения и подтверждение автора.</p>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Профиль</h2>
        {PROFILE.filter(([, key]) => character[key]).map(([label, key]) => (
          <p key={key} style={{ lineHeight: 1.6 }}>
            <strong>{label}:</strong> {character[key]}
          </p>
        ))}
        {!PROFILE.some(([, key]) => character[key]) && <p style={muted}>Профиль пока не заполнен.</p>}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Текущее состояние</h2>
        {current.length === 0 ? (
          <p style={muted}>Записей о состоянии пока нет.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {current.map((row) => (
              <li key={row.id}>
                <strong>{attributeLabel(row.attribute)}:</strong> {valueText(row.newValue)}
                {row.chapterNumber != null && <span style={muted}> · с гл. {row.chapterNumber}</span>}
                {row.reason && <div style={{ ...muted, fontSize: 14, lineHeight: 1.5 }}>{row.reason}</div>}
              </li>
            ))}
          </ul>
        )}
        {history.length > current.length && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>История изменений ({history.length})</summary>
            <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
              {[...history].reverse().map((row) => (
                <li key={row.id}>
                  {attributeLabel(row.attribute)} → {valueText(row.newValue)}
                  <span style={muted}> · {row.chapterNumber != null ? `гл. ${row.chapterNumber}` : "без главы"}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Связи</h2>
        {relationships.length === 0 ? (
          <p style={muted}>Связей в Canon пока нет.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {relationships.map((r) => (
              <li key={r.id}>
                {r.outgoing ? "→" : "←"}{" "}
                <Link href={`/projects/${project.id}/characters/${r.otherId}`}>{r.otherName}</Link>: {relationLabel(r.type)}
                {r.value != null && <span> ({r.value})</span>}
                {r.window && <span style={muted}> · {r.window}</span>}
                {r.reason && <div style={{ ...muted, fontSize: 14, lineHeight: 1.5 }}>{r.reason}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Что знает</h2>
        {secrets.length === 0 ? (
          <p style={muted}>Записей о знании тайн нет.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {secrets.map((k) => (
              <li key={k.id}>
                {k.secret.name}: {knowledgeLabel(k.knows, k.partial, k.sinceChapter)}
                {k.note && <span style={muted}> · {k.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {character.arcs.length > 0 && (
        <section style={box}>
          <h2 style={{ marginTop: 0 }}>Арки</h2>
          {character.arcs.map((arc) => (
            <div key={arc.id} style={{ marginBottom: 12 }}>
              <strong>{arc.name}</strong>
              {arc.stages.length > 0 && (
                <ol style={{ margin: "6px 0 0", paddingLeft: 20, lineHeight: 1.6 }}>
                  {arc.stages.map((s) => (
                    <li key={s.id}>
                      {s.name}
                      {(s.actualChapter ?? s.plannedChapter) != null && (
                        <span style={muted}> · гл. {s.actualChapter ?? s.plannedChapter}{s.actualChapter == null ? " (план)" : ""}</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
