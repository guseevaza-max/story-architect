import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Общая оболочка read-only страниц проекта
 * (Relationships, Plot Lines, Timeline).
 * Папка _components приватная: Next.js не превращает её в маршрут.
 */
export function PageShell({
  projectId,
  title,
  subtitle,
  badge,
  children,
}: {
  projectId: string;
  title: string;
  subtitle: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 40,
        fontFamily: "var(--font-ui), system-ui, sans-serif",
      }}
    >
      <div style={{ marginBottom: 30 }}>
        <Link href={`/projects/${projectId}`}>← Назад в проект</Link>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 30,
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 8px" }}>{title}</h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 18 }}>{subtitle}</p>
        </div>

        <div
          style={{
            padding: "10px 16px",
            borderRadius: 20,
            background: "var(--surface-2)",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {badge}
        </div>
      </div>

      {children}
    </main>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  href,
  linkLabel,
}: {
  icon: string;
  title: string;
  text: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <section
      style={{
        padding: 50,
        border: "1px solid var(--border)",
        borderRadius: 12,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 15 }}>{icon}</div>
      <h2>{title}</h2>
      <p style={{ color: "var(--muted)" }}>{text}</p>
      <Link
        href={href}
        style={{
          display: "inline-block",
          marginTop: 16,
          padding: "12px 20px",
          borderRadius: 8,
          background: "var(--primary)",
          color: "var(--on-primary)",
          textDecoration: "none",
        }}
      >
        {linkLabel}
      </Link>
    </section>
  );
}

const TONES = {
  green: { background: "var(--ok-bg)", color: "var(--ok-text)" },
  gray: { background: "var(--surface-2)", color: "var(--text-2)" },
  amber: { background: "var(--warn-bg)", color: "var(--warn-text)" },
  blue: { background: "var(--info-bg)", color: "var(--info-text)" },
} as const;

export function Pill({
  text,
  tone = "gray",
}: {
  text: string;
  tone?: keyof typeof TONES;
}) {
  const colors = TONES[tone];

  return (
    <span
      style={{
        padding: "5px 9px",
        borderRadius: 20,
        background: colors.background,
        color: colors.color,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

export const cardStyle = {
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 24,
  background: "var(--surface)",
} as const;
