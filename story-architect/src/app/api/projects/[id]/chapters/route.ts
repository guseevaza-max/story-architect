import { NextResponse } from "next/server";
import { PrismaClient, ChapterStatus } from "@prisma/client";
import { auth } from "@/auth";

const prisma = new PrismaClient();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Проект не найден" },
        { status: 404 }
      );
    }

    const body = await request.json();

    const title = String(body.title ?? "").trim();
    const purpose = String(body.purpose ?? "").trim();
    const authorIdea = String(body.authorIdea ?? "").trim();

    if (!title) {
      return NextResponse.json(
        { error: "Название главы обязательно" },
        { status: 400 }
      );
    }

    let book = await prisma.book.findFirst({
      where: {
        projectId: project.id,
        number: 1,
      },
    });

    if (!book) {
      book = await prisma.book.create({
        data: {
          projectId: project.id,
          number: 1,
          title: "Книга 1",
        },
      });
    }

    const lastChapter = await prisma.chapter.findFirst({
      where: {
        bookId: book.id,
      },
      orderBy: {
        number: "desc",
      },
    });

    const chapterNumber = (lastChapter?.number ?? 0) + 1;

    const chapter = await prisma.chapter.create({
      data: {
        bookId: book.id,
        number: chapterNumber,
        title,
        purpose: purpose || null,
        authorIdea: authorIdea || null,
        status: ChapterStatus.IDEA,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        chapter,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create chapter error:", error);

    return NextResponse.json(
      { error: "Не удалось создать главу" },
      { status: 500 }
    );
  }
}