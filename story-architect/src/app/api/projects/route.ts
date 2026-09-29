import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";

const prisma = new PrismaClient();

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

    const name = String(body.name ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Project title is required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.create({
      data: {
        userId: session.user.id,
        name,
        description: String(body.description ?? "").trim() || null,
        premise: String(body.premise ?? "").trim() || null,
        genre: String(body.genre ?? "").trim() || null,
        tone: String(body.tone ?? "").trim() || null,
        targetAudience:
          String(body.targetAudience ?? "").trim() || null,
        language: String(body.language ?? "ru").trim() || "ru",
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Project creation error:", error);

    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
