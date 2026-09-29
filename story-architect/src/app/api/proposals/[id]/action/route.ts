import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  authorActorFromSession,
  ProposalStateError,
  CanonAccessError,
} from "@/lib/canon/actor";
import { applyProposal } from "@/lib/canon/write";
import { ProposalAction } from "@/lib/canon/proposal-state";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const body = await request.json();

    const action = String(body.action ?? "").trim() as ProposalAction;

    if (
      action !== "ACCEPT" &&
      action !== "REJECT" &&
      action !== "EDIT_AND_ACCEPT" &&
      action !== "SUPERSEDE"
    ) {
      return NextResponse.json(
        { error: "Некорректное действие" },
        { status: 400 }
      );
    }

    const actor = authorActorFromSession(session);

    const result = await applyProposal(
      id,
      action,
      actor,
      body.editedPayload
    );

    return NextResponse.json({
      ok: true,
      proposal: result.proposal,
      canonChanged: result.canonChanged,
      canonEntityId: result.canonEntityId,
    });
  } catch (error) {
    console.error("Proposal action error:", error);

    if (error instanceof CanonAccessError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }

    if (error instanceof ProposalStateError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Не удалось обработать Proposal" },
      { status: 500 }
    );
  }
}