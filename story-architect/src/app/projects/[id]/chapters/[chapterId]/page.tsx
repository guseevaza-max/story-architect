import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { CHAPTER_STATUS_LABELS, loadChapterPage } from "@/lib/chapters/loadChapterPage";
import { nextUnfinishedChapter, parseStage, recommend, stageHref, stageStates, type ChapterFacts, type StageKey } from "@/lib/ux/chapterWorkspace";

import ArchitectButton from "./ArchitectButton";
import SaveIdeaForm from "./SaveIdeaForm";
import AuthorIntentPanel from "./AuthorIntentPanel";
import ScenePlannerButton from "./ScenePlannerButton";
import WriterButton from "./writerButton";
import NarrativeContextPanel from "./NarrativeContextPanel";
import ContinuityButton from "./ContinuityButton";
import ContinuitySuggestionsButton from "./ContinuitySuggestionsButton";
import DraftEditor from "./DraftEditor";
import ApproveChapterButton from "./ApproveChapterButton";
import CanonChapterButton from "./CanonChapterButton";
import MemoryUpdateButton from "./MemoryUpdateButton";
import ChapterWorkspace from "./ChapterWorkspace";
import { ApprovedPlan, ApprovedScenes, EmptyNote, panelBox } from "./PlanViews";

/**
 * Рабочее пространство главы: пять вкладок вместо одной длинной страницы.
 * Все прежние компоненты используются как есть. Прежний вид доступен по
 * адресу .../legacy. Ничего не запускается при открытии: платные действия
 * только по кнопкам автора.
 */
export default async function ChapterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; chapterId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id, chapterId } = await params;
  const data = await loadChapterPage(session.user.id, id, chapterId);
  if (!data) notFound();

  const { project, chapter, plan, hasPlan, pending, siblings } = data;
  const base = `/projects/${project.id}/chapters/${chapter.id}`;
  const proposalsHref = `/projects/${project.id}/proposals`;
  const scenes = chapter.scenes;
  const hasScenes = scenes.length > 0;
  const hasDraft = !!chapter.draftText?.trim();
  const status = chapter.status;

  const facts: ChapterFacts = {
    status,
    hasIdea: !!chapter.authorIdea?.trim(),
    hasIntent: chapter.authorIntent != null,
    planApproved: chapter.planApproved,
    sceneCount: scenes.length,
    hasDraft,
    pendingPlanProposals: pending.length,
  };
  const recommendation = recommend(facts);
  const query = await searchParams;
  const initialStage: StageKey = parseStage(query.tab) ?? parseStage(query.stage) ?? recommendation.stage;
  const nextChapter = nextUnfinishedChapter(siblings, chapter.id);

  const panels: Record<StageKey, React.ReactNode> = {
    // ───────────── 1. Замысел ─────────────
    intent: (
      <>
        <section style={panelBox}>
          <h2 style={{ marginTop: 0 }}>Назначение главы</h2>
          <p style={{ color: "var(--text-2)", lineHeight: 1.6 }}>{chapter.purpose || "Назначение пока не задано."}</p>
        </section>
        <section style={panelBox}>
          <h2 style={{ marginTop: 0 }}>Идея автора</h2>
          <SaveIdeaForm projectId={project.id} chapterId={chapter.id} initialIdea={chapter.authorIdea || ""} />
        </section>
        <section style={panelBox}>
          <h2 style={{ marginTop: 0 }}>🎨 Авторский замысел</h2>
          <AuthorIntentPanel projectId={project.id} chapterId={chapter.id} />
        </section>
        <NarrativeContextPanel projectId={project.id} chapterId={chapter.id} />
      </>
    ),

    // ───────────── 2. Планирование ─────────────
    planning: (
      <>
        {pending.length > 0 && (
          <section style={{ ...panelBox, background: "var(--warn-bg)", borderColor: "var(--warn-border)" }}>
            <strong>Ждут вашего решения: {pending.length}</strong>
            <p style={{ margin: "6px 0 10px", color: "var(--warn-text)" }}>
              {pending.some((p) => p.entityType === "chapter_plan") ? "План главы" : ""}
              {pending.some((p) => p.entityType === "chapter_plan") && pending.some((p) => p.entityType === "scene_plan") ? " и " : ""}
              {pending.some((p) => p.entityType === "scene_plan") ? "план сцен" : ""} утверждается в Центре решений. Автоматически ничего не принимается.
            </p>
            <Link href={proposalsHref} style={{ fontWeight: 600 }}>
              Открыть Центр решений →
            </Link>
          </section>
        )}

        <section style={panelBox}>
          <h2 style={{ marginTop: 0 }}>Architect</h2>
          <p style={{ color: "var(--text-2)" }}>Architect анализирует идею автора и формирует структурированный план главы. Он создаёт предложение, которое вы проверяете и утверждаете.</p>
          <ArchitectButton projectId={project.id} chapterId={chapter.id} />
        </section>

        {hasPlan && plan ? (
          <>
            <ApprovedPlan plan={plan} />
            <section style={panelBox}>
              <h2 style={{ marginTop: 0 }}>🎬 Scene Planner</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.5 }}>Разбивает утверждённый план главы на последовательность сцен.</p>
              <ScenePlannerButton projectId={project.id} chapterId={chapter.id} />
            </section>
          </>
        ) : (
          <EmptyNote
            title="Утверждённого плана главы пока нет"
            action={pending.length > 0 ? { href: proposalsHref, label: "Открыть Центр решений →" } : undefined}
          >
            Запустите Architect и утвердите предложение в Центре решений: после этого здесь появятся план и Scene Planner. Планирование необязательно: текст можно писать и без плана.
          </EmptyNote>
        )}

        {hasScenes ? (
          <ApprovedScenes scenes={scenes} />
        ) : hasPlan ? (
          <EmptyNote title="Плана сцен пока нет">Запустите Scene Planner выше и утвердите предложение.</EmptyNote>
        ) : null}

        {hasPlan || hasScenes ? (
          <section style={{ ...panelBox, border: "2px solid var(--info-border)", background: "var(--info-bg)" }}>
            <h2 style={{ marginTop: 0 }}>🔎 Проверка плана и сцен до написания</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>
              Сверяет план с Canon, состоянием истории и сюжетной картой, проверяет покрытие плана сценами и ограничения на раскрытие тайн. Текст главы не нужен. Это платный запрос ИИ, он запускается только по вашей кнопке. Canon и статус главы не меняются.
            </p>
            <ContinuityButton projectId={project.id} chapterId={chapter.id} mode="plan" />
          </section>
        ) : (
          <EmptyNote title="Проверка плана и сцен до написания">Станет доступна, когда появится утверждённый план главы или план сцен.</EmptyNote>
        )}
      </>
    ),

    // ───────────── 3. Черновик ─────────────
    draft: (
      <>
        {hasScenes ? (
          <section style={panelBox}>
            <h2 style={{ marginTop: 0 }}>✍️ Writer</h2>
            <p style={{ margin: "0 0 12px", color: "var(--muted)", lineHeight: 1.5 }}>Создаёт черновик главы по утверждённым плану и сценам. Запускается только по кнопке.</p>
            <WriterButton projectId={project.id} chapterId={chapter.id} />
          </section>
        ) : (
          <EmptyNote title="Writer пока недоступен" action={{ href: stageHref(base, "planning"), label: "Перейти к планированию →" }}>
            Writer работает по утверждённым плану и сценам (этап «Планирование»). Текст можно написать вручную в редакторе ниже.
          </EmptyNote>
        )}
        <section style={{ ...panelBox, border: "2px solid var(--info-border)", background: "var(--info-bg)" }}>
          <h2 style={{ margin: 0 }}>📖 Редактор черновика</h2>
          <p style={{ margin: "6px 0 16px", color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>Изменения остаются в черновике и не меняют Canon. Сохранение вручную; при переключении вкладок текст не теряется.</p>
          <DraftEditor projectId={project.id} chapterId={chapter.id} initialText={chapter.draftText ?? ""} />
        </section>
      </>
    ),

    // ───────────── 4. Анализ ─────────────
    analysis: hasDraft ? (
      <>
        <section style={{ ...panelBox, border: "2px solid var(--info-border)", background: "var(--info-bg)" }}>
          <h2 style={{ margin: 0 }}>🔎 Проверка непрерывности</h2>
          <p style={{ margin: "6px 0 16px", color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>AI проверяет написанный черновик на противоречия с планом, сценами и Canon. Запускается только по кнопке и стоит денег.</p>
          <ContinuityButton projectId={project.id} chapterId={chapter.id} />
          <ContinuitySuggestionsButton projectId={project.id} chapterId={chapter.id} />
        </section>
        <EmptyNote title="Редакторский разбор">
          Сценарного критика можно запустить в панели «💬 Соавтор» (режим «Сценарный критик»): он оценивает ремесло главы и ничего не меняет.
        </EmptyNote>
      </>
    ) : (
      <EmptyNote title="Анализировать пока нечего" action={{ href: stageHref(base, "draft"), label: "Перейти к черновику →" }}>
        Проверка непрерывности работает с текстом. Напишите или сгенерируйте черновик на этапе «Черновик».
      </EmptyNote>
    ),

    // ───────────── 5. Завершение ─────────────
    finish: (
      <>
        {hasDraft && status !== "APPROVED" && status !== "CANON" ? (
          <section style={{ ...panelBox, border: "2px solid var(--ok-border)", background: "var(--ok-bg)" }}>
            <h2 style={{ marginTop: 0 }}>✓ Финальное утверждение</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>Если текст готов, автор может утвердить главу. Это пока не меняет Canon.</p>
            <ApproveChapterButton projectId={project.id} chapterId={chapter.id} />
          </section>
        ) : status === "APPROVED" || status === "CANON" ? (
          <EmptyNote title="✓ Глава утверждена">Правка текста вернёт главу к утверждению.</EmptyNote>
        ) : (
          <EmptyNote title="Утверждение пока недоступно" action={{ href: stageHref(base, "draft"), label: "Перейти к черновику →" }}>
            Нужен текст черновика.
          </EmptyNote>
        )}

        {status === "APPROVED" ? (
          <section style={{ ...panelBox, border: "2px solid var(--violet-border)", background: "var(--violet-bg)" }}>
            <h2 style={{ marginTop: 0 }}>📚 Canon</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>Глава утверждена. Теперь её можно добавить в Canon.</p>
            <CanonChapterButton projectId={project.id} chapterId={chapter.id} />
          </section>
        ) : status === "CANON" ? (
          <EmptyNote title="📚 Глава в Canon">Подтверждённая история книги.</EmptyNote>
        ) : (
          <EmptyNote title="Перевод в Canon">Станет доступен после утверждения главы.</EmptyNote>
        )}

        {status === "CANON" ? (
          <section style={{ ...panelBox, border: "2px solid var(--info-border)", background: "var(--info-bg)" }}>
            <h2 style={{ marginTop: 0 }}>🧠 Memory Update</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>Глава в Canon. AI может извлечь из неё важные изменения для памяти истории; каждое утверждает автор.</p>
            <MemoryUpdateButton projectId={project.id} chapterId={chapter.id} />
          </section>
        ) : (
          <EmptyNote title="🧠 Memory Update">Доступно после перевода главы в Canon.</EmptyNote>
        )}

        {status === "CANON" && nextChapter ? (
          <section style={{ ...panelBox, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: "0 0 4px" }}>Следующая глава</h2>
              <div style={{ color: "var(--text-2)" }}>
                Книга {nextChapter.bookNumber} · глава {nextChapter.number}
                {nextChapter.title ? ` «${nextChapter.title}»` : ""}
              </div>
            </div>
            <Link href={`/projects/${project.id}/chapters/${nextChapter.id}`} className="sa-btn sa-btn-primary">
              Перейти к главе →
            </Link>
          </section>
        ) : null}
      </>
    ),
  };

  return (
    <ChapterWorkspace
      initialStage={initialStage}
      basePath={base}
      legacyHref={`${base}/legacy`}
      backHref={`/projects/${project.id}/chapters`}
      title={chapter.title || `Глава ${chapter.number}`}
      bookChapter={`Книга ${chapter.book.number} · Глава ${chapter.number}`}
      status={status}
      statusLabel={CHAPTER_STATUS_LABELS[status] || status}
      states={stageStates(facts)}
      recommendation={recommendation}
      panels={panels}
    />
  );
}

