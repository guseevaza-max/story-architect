import { NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import { proposalPayloadSchema } from "@/lib/schemas/proposal";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const projectId = String(
      searchParams.get("projectId") ?? ""
    ).trim();

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId обязателен" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: session.user.id,
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Проект не найден" },
        { status: 404 }
      );
    }

    const proposals = await prisma.proposal.findMany({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      ok: true,
      proposals,
    });
  } catch (error) {
    console.error("Proposal list error:", error);

    return NextResponse.json(
      {
        error: "Не удалось загрузить предложения",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const projectId = String(body.projectId ?? "").trim();
    const entityType = String(body.entityType ?? "").trim();
    const op = String(body.op ?? "CREATE").trim();

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId обязателен" },
        { status: 400 }
      );
    }

    if (!entityType) {
      return NextResponse.json(
        { error: "entityType обязателен" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: session.user.id,
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Проект не найден" },
        { status: 404 }
      );
    }

    const parsedPayload = proposalPayloadSchema.safeParse(
      body.payload
    );

    if (!parsedPayload.success) {
      return NextResponse.json(
        {
          error: "Некорректный Proposal payload",
          details: parsedPayload.error.flatten(),
        },
        { status: 400 }
      );
    }

    if (op !== "CREATE") {
      return NextResponse.json(
        {
          error:
            "На текущем этапе Proposal API поддерживает только CREATE",
        },
        { status: 400 }
      );
    }

    const proposal = await prisma.proposal.create({
      data: {
        projectId,
        entityType,
        entityId: body.entityId
          ? String(body.entityId)
          : null,
        op: "CREATE",
        payload:
          parsedPayload.data as Prisma.InputJsonValue,
        diff: body.diff
          ? (body.diff as Prisma.InputJsonValue)
          : undefined,
        reason: body.reason
          ? String(body.reason)
          : null,
        confidence:
          typeof body.confidence === "number"
            ? body.confidence
            : null,
        safety: body.safety
          ? String(body.safety)
          : "UNCERTAIN",
        status: "PENDING",
        aiRunId: body.aiRunId
          ? String(body.aiRunId)
          : null,
        sourceChapterId: body.sourceChapterId
          ? String(body.sourceChapterId)
          : null,
        impact: body.impact
          ? (body.impact as Prisma.InputJsonValue)
          : undefined,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        proposal,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Proposal creation error:", error);

    return NextResponse.json(
      {
        error: "Не удалось создать Proposal",
      },
      { status: 500 }
    );
  }
}