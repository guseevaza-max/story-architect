import { NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import OpenAI from "openai";

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован." }, { status: 401 });

    const { id: projectId, chapterId } = await params;
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Проект не найден." }, { status: 404 });

    const proposal = await prisma.proposal.findFirst({
      where: {
        projectId,
        status: "PENDING",
        entityType: "memory_update",
        OR: [
          { sourceChapterId: chapterId },
          { entityId: chapterId },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ok: true, proposal });
  } catch (error) {
    console.error("Memory proposal GET error:", error);
    return NextResponse.json({ error: "Не удалось загрузить Memory Proposal." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован." }, { status: 401 });

    const { id: projectId, chapterId } = await params;
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
    if (!project) return NextResponse.json({ error: "Проект не найден." }, { status: 404 });

    const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, book: { projectId } }, include: { book: true } });
    if (!chapter) return NextResponse.json({ error: "Глава не найдена." }, { status: 404 });
    if (chapter.status !== "CANON") return NextResponse.json({ error: "Memory Update можно запускать только после добавления главы в Canon." }, { status: 400 });

    // Не создаём дубликаты. Если для главы уже есть PENDING proposal,
    // возвращаем его и показываем автору на странице.
    const existingProposal = await prisma.proposal.findFirst({
      where: {
        projectId,
        status: "PENDING",
        entityType: "memory_update",
        OR: [{ sourceChapterId: chapter.id }, { entityId: chapter.id }],
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingProposal) {
      const payload = existingProposal.payload as any;
      const updates = Array.isArray(payload?.updates) ? payload.updates : [];
      return NextResponse.json({
        ok: true,
        reused: true,
        proposal: {
          id: existingProposal.id,
          status: existingProposal.status,
          safety: existingProposal.safety,
          payload,
        },
        summary: {
          shortSummary: payload?.shortSummary || "",
          total: updates.length,
          safe: updates.filter((item: any) => item.safety === "SAFE").length,
          uncertain: updates.filter((item: any) => item.safety === "UNCERTAIN").length,
          conflicts: updates.filter((item: any) => item.safety === "CONFLICT").length,
        },
        updates,
      });
    }

    const chapterText = chapter.finalText?.trim() || chapter.draftText?.trim();
    if (!chapterText) return NextResponse.json({ error: "У главы нет утверждённого текста." }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY не настроен." }, { status: 500 });

    const startedAt = Date.now();
    const response = await openai.responses.create({
      model: "gpt-5.6-luna",
      input: [
        {
          role: "system",
          content: `Ты — MEMORY EXTRACTION AGENT системы Story Architect.

Твоя задача — анализировать УТВЕРЖДЁННУЮ главу книги и определить, какие изменения должны попасть в память истории.

КАТЕГОРИИ: FACT, CHARACTER_CHANGE, RELATIONSHIP_CHANGE, WORLD_CHANGE, EVENT, PLOT_PROGRESS, SECRET, FORESHADOWING, QUESTION, NEW_ENTITY.

ПРАВИЛА:
- Не выдумывай информацию.
- Используй только то, что подтверждается текстом главы.
- Не считай предположение фактом.
- Если информация неоднозначна — safety = UNCERTAIN.
- Если информация потенциально противоречит существующему Canon — safety = CONFLICT.
- Если информация явно подтверждается текстом и не выглядит противоречивой — safety = SAFE.
- Не изменяй Canon и не удаляй существующие факты.
- Не создавай новые сущности без основания в тексте.
- Выделяй только информацию, которая может быть важна для продолжения истории.

Создай shortSummary, fullSummary, worldDelta и updates. Для каждого update укажи type, title, content, safety, confidence и reason.`,
        },
        {
          role: "user",
          content: `PROJECT:\n${project.name}\n\nBOOK:\n${chapter.book.title}\n\nCHAPTER:\n${chapter.number}. ${chapter.title || "Без названия"}\n\nCHAPTER PURPOSE:\n${chapter.purpose || "Не указан"}\n\nAPPROVED CHAPTER TEXT:\n${chapterText}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "memory_extraction",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              shortSummary: { type: "string" },
              fullSummary: { type: "string" },
              worldDelta: { type: "object", additionalProperties: false, properties: { changes: { type: "array", items: { type: "string" } } }, required: ["changes"] },
              updates: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    type: { type: "string", enum: ["FACT", "CHARACTER_CHANGE", "RELATIONSHIP_CHANGE", "WORLD_CHANGE", "EVENT", "PLOT_PROGRESS", "SECRET", "FORESHADOWING", "QUESTION", "NEW_ENTITY"] },
                    title: { type: "string" },
                    content: { type: "string" },
                    safety: { type: "string", enum: ["SAFE", "UNCERTAIN", "CONFLICT"] },
                    confidence: { type: "number" },
                    reason: { type: "string" },
                  },
                  required: ["type", "title", "content", "safety", "confidence", "reason"],
                },
              },
            },
            required: ["shortSummary", "fullSummary", "worldDelta", "updates"],
          },
        },
      },
    });

    const outputText = response.output_text?.trim();
    if (!outputText) return NextResponse.json({ error: "AI не вернул результат Memory Extraction." }, { status: 500 });
    const result = JSON.parse(outputText);
    const updates = Array.isArray(result.updates) ? result.updates : [];
    const safety = updates.some((item: any) => item.safety === "CONFLICT") ? "CONFLICT" : updates.some((item: any) => item.safety === "UNCERTAIN") ? "UNCERTAIN" : "SAFE";
    const safeCount = updates.filter((item: any) => item.safety === "SAFE").length;
    const uncertainCount = updates.filter((item: any) => item.safety === "UNCERTAIN").length;
    const conflictCount = updates.filter((item: any) => item.safety === "CONFLICT").length;

    const aiRun = await prisma.aiRun.create({
      data: {
        userId: session.user.id,
        projectId,
        roleKey: "MEMORY_EXTRACTION",
        model: "gpt-5.6-luna",
        status: "SUCCESS",
        requestPayload: toInputJson({ chapterId, chapterNumber: chapter.number }),
        responsePayload: toInputJson(result),
        durationMs: Date.now() - startedAt,
      },
    });

    const proposal = await prisma.proposal.create({
      data: {
        projectId,
        entityType: "memory_update",
        entityId: chapter.id,
        op: "CREATE",
        payload: toInputJson({
          chapterId: chapter.id,
          chapterNumber: chapter.number,
          shortSummary: result.shortSummary,
          fullSummary: result.fullSummary,
          worldDelta: result.worldDelta,
          updates,
          counts: { total: updates.length, safe: safeCount, uncertain: uncertainCount, conflicts: conflictCount },
        }),
        reason: "Извлечение памяти после утверждения главы.",
        confidence: updates.length > 0 ? updates.reduce((sum: number, item: any) => sum + Number(item.confidence || 0), 0) / updates.length : 1,
        safety,
        aiRunId: aiRun.id,
        sourceChapterId: chapter.id,
      },
    });

    return NextResponse.json({
      ok: true,
      proposal: { id: proposal.id, status: proposal.status, safety: proposal.safety, payload: proposal.payload },
      summary: { shortSummary: result.shortSummary, total: updates.length, safe: safeCount, uncertain: uncertainCount, conflicts: conflictCount },
      updates,
    });
  } catch (error) {
    console.error("Memory extraction error:", error);
    return NextResponse.json({ error: "Не удалось выполнить Memory Update." }, { status: 500 });
  }
}
