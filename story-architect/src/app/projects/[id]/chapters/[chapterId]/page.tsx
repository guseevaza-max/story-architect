import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";

import ArchitectButton from "./ArchitectButton";
import SaveIdeaForm from "./SaveIdeaForm";
import ScenePlannerButton from "./ScenePlannerButton";
import WriterButton from "./writerButton";
import ContinuityButton from "./ContinuityButton";
import ContinuitySuggestionsButton from "./ContinuitySuggestionsButton";
import DraftEditor from "./DraftEditor";
import ApproveChapterButton from "./ApproveChapterButton";
import CanonChapterButton from "./CanonChapterButton";
import MemoryUpdateButton from "./MemoryUpdateButton";

const prisma = new PrismaClient();

type ChapterPlan = {
  chapterPurpose?: string;
  initialState?: string;
  endState?: string;
  plotDevelopment?: string[];
  characterDevelopment?: string[];
  mustHappen?: string[];
  mustNotHappen?: string[];
  openQuestions?: string[];
};

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id, chapterId } = await params;

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, name: true },
  });

  if (!project) notFound();

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, book: { projectId: project.id } },
    include: {
      book: true,
      scenes: { orderBy: { order: "asc" } },
    },
  });

  if (!chapter) notFound();

  const statusLabels: Record<string, string> = {
    IDEA: "Идея",
    PLANNED: "Запланирована",
    DRAFT: "Черновик",
    EDITING: "Редактирование",
    CHECKING: "Проверка",
    APPROVED: "Утверждена",
    CANON: "Canon",
  };

  const plan = chapter.plan as ChapterPlan | null;
  const hasPlan = !!(
    plan &&
    (plan.chapterPurpose ||
      plan.initialState ||
      plan.endState ||
      plan.plotDevelopment?.length ||
      plan.characterDevelopment?.length ||
      plan.mustHappen?.length ||
      plan.mustNotHappen?.length ||
      plan.openQuestions?.length)
  );

  const scenes = chapter.scenes as Array<{
    id: string;
    order: number;
    title: string | null;
    purpose: string | null;
    plan: unknown;
    plannedOutcome: string | null;
    status: string;
  }>;

  const hasScenes = scenes.length > 0;

  return (
    <main style={{ maxWidth: 1000, margin: "40px auto", padding: "0 24px 60px", fontFamily: "Arial, sans-serif" }}>
      <Link href={`/projects/${project.id}/chapters`} style={{ display: "inline-block", marginBottom: 20, color: "#555", textDecoration: "none" }}>
        ← Назад к главам
      </Link>

      <div style={{ fontSize: 13, color: "#777", marginBottom: 6 }}>
        Книга {chapter.book.number} · Глава {chapter.number}
      </div>

      <h1 style={{ fontSize: 32, margin: "0 0 10px" }}>
        {chapter.title || `Глава ${chapter.number}`}
      </h1>

      <div style={{ display: "inline-block", padding: "6px 12px", borderRadius: 999, background: chapter.status === "PLANNED" ? "#e8f5e9" : "#fff0bd", color: chapter.status === "PLANNED" ? "#287a35" : "#555", fontSize: 13, marginBottom: 28 }}>
        {statusLabels[chapter.status] || chapter.status}
      </div>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Назначение главы</h2>
        <p style={{ color: "#555", lineHeight: 1.6 }}>{chapter.purpose || "Назначение пока не задано."}</p>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Идея автора</h2>
        <SaveIdeaForm projectId={project.id} chapterId={chapter.id} initialIdea={chapter.authorIdea || ""} />
      </section>

      {hasPlan && (
        <section style={{ border: "2px solid #d9c58b", borderRadius: 12, padding: 24, marginBottom: 16, background: "#fffdf5" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0 }}>📋 Утверждённый план главы</h2>
              <p style={{ margin: "6px 0 0", color: "#777", fontSize: 14 }}>План сформирован Architect и утверждён автором.</p>
            </div>
            <span style={{ padding: "6px 10px", borderRadius: 999, background: "#e8f5e9", color: "#287a35", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>✓ Утверждён</span>
          </div>

          {plan?.chapterPurpose && <div style={{ marginBottom: 22 }}><h3>Цель главы</h3><p style={{ lineHeight: 1.6 }}>{plan.chapterPurpose}</p></div>}
          {plan?.initialState && <div style={{ marginBottom: 22 }}><h3>Начальное состояние</h3><p style={{ lineHeight: 1.6 }}>{plan.initialState}</p></div>}
          {plan?.endState && <div style={{ marginBottom: 22 }}><h3>Конечное состояние</h3><p style={{ lineHeight: 1.6 }}>{plan.endState}</p></div>}

          {plan?.plotDevelopment?.length ? <div style={{ marginBottom: 22 }}><h3>Развитие сюжета</h3><ul style={{ lineHeight: 1.6 }}>{plan.plotDevelopment.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}
          {plan?.characterDevelopment?.length ? <div style={{ marginBottom: 22 }}><h3>Развитие персонажей</h3><ul style={{ lineHeight: 1.6 }}>{plan.characterDevelopment.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}
          {plan?.mustHappen?.length ? <div style={{ marginBottom: 22 }}><h3>Обязательно должно произойти</h3><ul style={{ lineHeight: 1.6 }}>{plan.mustHappen.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}
          {plan?.mustNotHappen?.length ? <div style={{ marginBottom: 22 }}><h3>Не должно произойти</h3><ul style={{ lineHeight: 1.6 }}>{plan.mustNotHappen.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}
          {plan?.openQuestions?.length ? <div style={{ marginBottom: 22 }}><h3>Открытые вопросы</h3><ul style={{ lineHeight: 1.6 }}>{plan.openQuestions.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}

          <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid #ddd" }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>🎬 Следующий этап — план сцен</h3>
            <p style={{ color: "#666", lineHeight: 1.5, marginBottom: 16 }}>Scene Planner разбивает утверждённый план главы на последовательность сцен.</p>
            <ScenePlannerButton projectId={project.id} chapterId={chapter.id} />
          </div>
        </section>
      )}

      {hasScenes && (
        <section style={{ border: "2px solid #c9b7e8", borderRadius: 12, padding: 24, marginBottom: 16, background: "#faf8ff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 8 }}>
            <div>
              <h2 style={{ margin: 0 }}>🎬 Утверждённый план сцен</h2>
              <p style={{ margin: "6px 0 0", color: "#777", fontSize: 14 }}>Scene Planner сформировал сцены, и автор утвердил этот план.</p>
            </div>
            <span style={{ padding: "6px 10px", borderRadius: 999, background: "#e8f5e9", color: "#287a35", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
              ✓ {scenes.length} {scenes.length === 1 ? "сцена" : scenes.length < 5 ? "сцены" : "сцен"}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
            {scenes.map((scene) => {
              const scenePlan = Array.isArray(scene.plan) ? scene.plan.filter((item): item is string => typeof item === "string") : [];
              return (
                <article key={scene.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20, background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 13, color: "#777" }}>Сцена {scene.order}</div>
                    <span style={{ padding: "5px 9px", borderRadius: 999, background: "#f1f5f9", color: "#555", fontSize: 11, fontWeight: 600 }}>{scene.status}</span>
                  </div>
                  <h3 style={{ margin: "0 0 18px", fontSize: 20 }}>{scene.title || `Сцена ${scene.order}`}</h3>
                  {scene.purpose && <div style={{ marginBottom: 18 }}><strong>Цель сцены</strong><p style={{ margin: "8px 0 0", color: "#555", lineHeight: 1.6 }}>{scene.purpose}</p></div>}
                  {scenePlan.length > 0 && <div style={{ marginBottom: 18 }}><strong>План действий</strong><ul style={{ marginTop: 8, lineHeight: 1.6 }}>{scenePlan.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
                  {scene.plannedOutcome && <div><strong>Ожидаемый результат</strong><p style={{ margin: "8px 0 0", color: "#555", lineHeight: 1.6 }}>{scene.plannedOutcome}</p></div>}
                </article>
              );
            })}
          </div>

          {/* =================================================
              PRE-WRITER CONTINUITY CHECK
              ================================================= */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #ddd" }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>🔎 Сопоставление с Canon</h3>
            <p style={{ margin: "0 0 16px", color: "#666", lineHeight: 1.5 }}>
              Перед написанием главы AI проверяет утверждённую раскадровку на противоречия с Canon, предыдущими событиями, персонажами, правилами мира и логикой истории.
            </p>
            <ContinuityButton projectId={project.id} chapterId={chapter.id} />
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "#f1f5f9", fontSize: 13, color: "#555" }}>
              💡 Сначала устрани или прими найденные противоречия, затем запускай Writer.
            </div>
          </div>

          {/* =================================================
              WRITER
              ================================================= */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #ddd" }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>✍️ Следующий этап — Writer</h3>
            <p style={{ margin: 0, color: "#666", lineHeight: 1.5 }}>
              После проверки раскадровки Writer создаёт черновик главы на основе утверждённой структуры.
            </p>
            <div style={{ marginTop: 16 }}>
              <WriterButton projectId={project.id} chapterId={chapter.id} />
            </div>
          </div>
        </section>
      )}

      {chapter.draftText && (
        <section style={{ border: "2px solid #9bb7d4", borderRadius: 12, padding: 24, marginBottom: 16, background: "#f8fbff" }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ margin: 0 }}>📖 Редактор черновика</h2>
            <p style={{ margin: "6px 0 0", color: "#777", fontSize: 14, lineHeight: 1.5 }}>Здесь можно отредактировать текст главы. Изменения пока остаются в черновике и не изменяют Canon.</p>
          </div>
          <DraftEditor projectId={project.id} chapterId={chapter.id} initialText={chapter.draftText} />
        </section>
      )}

      {/* =====================================================
          DRAFT CONTINUITY CHECK
          ===================================================== */}
      {chapter.draftText && (
        <section style={{ border: "2px solid #b7c9d8", borderRadius: 12, padding: 24, marginBottom: 16, background: "#f8fbff" }}>
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ margin: 0 }}>🔎 Проверка непрерывности</h2>
            <p style={{ margin: "6px 0 0", color: "#777", fontSize: 14, lineHeight: 1.5 }}>AI проверяет текущий черновик на противоречия с планом, сценами и внутренней логикой истории.</p>
          </div>
          <ContinuityButton projectId={project.id} chapterId={chapter.id} />
        </section>
      )}

      {chapter.draftText && chapter.status !== "APPROVED" && chapter.status !== "CANON" && (
        <section style={{ border: "2px solid #9bc7a5", borderRadius: 12, padding: 24, marginBottom: 16, background: "#f7fff8" }}>
          <h2 style={{ marginTop: 0 }}>✓ Финальное утверждение</h2>
          <p style={{ color: "#666", lineHeight: 1.5, marginBottom: 16 }}>Если текст главы готов и необходимые исправления внесены, автор может утвердить главу. Это пока не изменяет Canon.</p>
          <ApproveChapterButton projectId={project.id} chapterId={chapter.id} />
        </section>
      )}

      {chapter.status === "APPROVED" && (
        <section style={{ border: "2px solid #c9b7e8", borderRadius: 12, padding: 24, marginBottom: 16, background: "#faf8ff" }}>
          <h2 style={{ marginTop: 0 }}>📚 Canon</h2>
          <p style={{ color: "#666", lineHeight: 1.5, marginBottom: 16 }}>Глава утверждена автором. Теперь её можно добавить в Canon — подтверждённую историю книги.</p>
          <CanonChapterButton projectId={project.id} chapterId={chapter.id} />
        </section>
      )}

      {chapter.status === "CANON" && (
        <section style={{ border: "2px solid #93c5fd", borderRadius: 12, padding: 24, marginBottom: 16, background: "#eff6ff" }}>
          <h2 style={{ marginTop: 0 }}>🧠 Memory Update</h2>
          <p style={{ color: "#666", lineHeight: 1.5, marginBottom: 16 }}>Глава уже находится в Canon. Теперь AI может извлечь из неё важные изменения для памяти истории.</p>
          <MemoryUpdateButton projectId={project.id} chapterId={chapter.id} />
        </section>
      )}

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Architect</h2>
        <p style={{ color: "#555" }}>Architect анализирует текущую идею автора и формирует структурированный план главы.</p>
        <ArchitectButton projectId={project.id} chapterId={chapter.id} />
        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "#f1f5f9", fontSize: 13, color: "#555" }}>
          💡 Architect не изменяет Canon автоматически. Он создаёт предложение, которое автор должен проверить и утвердить.
        </div>
      </section>
    </main>
  );
}
