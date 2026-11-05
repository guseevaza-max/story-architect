import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import { revertsToApproved } from "@/lib/chapters/draftEdit";
import { hasEditorMarks } from "@/lib/chapters/editorMarks";

const prisma = new PrismaClient();

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      chapterId: string;
    }>;
  }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { id, chapterId } = await params;

    const body = await request.json();

    const chapter = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        book: {
          project: {
            id,
            userId: session.user.id,
          },
        },
      },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "Глава не найдена" },
        { status: 404 }
      );
    }

    let revertedToApproved = false;

    const data: {
      authorIdea?: string | null;
      draftText?: string | null;
      status?: "APPROVED" | "CANON";
      approvedAt?: Date;
      finalText?: string | null;
    } = {};

    // =====================================================
    // СОХРАНЕНИЕ ИДЕИ АВТОРА
    // =====================================================

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "authorIdea"
      )
    ) {
      const authorIdea = String(
        body.authorIdea ?? ""
      ).trim();

      data.authorIdea = authorIdea || null;
    }

    // =====================================================
    // СОХРАНЕНИЕ ЧЕРНОВИКА
    // =====================================================

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "draftText"
      )
    ) {
      const draftText = String(
        body.draftText ?? ""
      );

      data.draftText = draftText;

      // Правка после Canon: finalText устарел, нужно утвердить заново.
      if (
        !Object.prototype.hasOwnProperty.call(body, "status") &&
        revertsToApproved(chapter, draftText)
      ) {
        data.status = "APPROVED";
        revertedToApproved = true;
      }
    }

    // =====================================================
    // УТВЕРЖДЕНИЕ ГЛАВЫ
    // =====================================================

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "status"
      ) &&
      body.status === "APPROVED"
    ) {
      if (!chapter.draftText?.trim()) {
        return NextResponse.json(
          {
            error:
              "Нельзя утвердить главу без текста черновика.",
          },
          { status: 400 }
        );
      }

      if (hasEditorMarks(chapter.draftText)) {
        return NextResponse.json(
          {
            error:
              "В черновике остались пометки редактора. Нажми «Доработать по заметкам», чтобы AI их учёл, или убери пометки вручную.",
          },
          { status: 400 }
        );
      }

      data.status = "APPROVED";
      data.approvedAt = new Date();
    }

    // =====================================================
    // ПЕРЕНОС В CANON
    // =====================================================

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "status"
      ) &&
      body.status === "CANON"
    ) {
      if (chapter.status !== "APPROVED") {
        return NextResponse.json(
          {
            error:
              "В Canon можно перевести только утверждённую главу.",
          },
          { status: 400 }
        );
      }

      if (!chapter.draftText?.trim()) {
        return NextResponse.json(
          {
            error:
              "Нельзя добавить в Canon главу без текста.",
          },
          { status: 400 }
        );
      }

      data.status = "CANON";
      data.finalText = chapter.draftText;
    }

    // =====================================================
    // ПРОВЕРКА ДАННЫХ
    // =====================================================

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        {
          error:
            "Нет данных для сохранения.",
        },
        { status: 400 }
      );
    }

    const updatedChapter =
      await prisma.chapter.update({
        where: {
          id: chapter.id,
        },
        data,
      });

    return NextResponse.json({
      ok: true,
      chapter: updatedChapter,
      revertedToApproved,
    });
  } catch (error) {
    console.error(
      "PATCH chapter error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Не удалось сохранить главу.",
      },
      { status: 500 }
    );
  }
}