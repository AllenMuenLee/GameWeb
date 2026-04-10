import { NextResponse } from "next/server";
import { applyAction } from "@/lib/multiplayer/store";

type Params = Promise<{ roomCode: string }>;

type ActionBody = {
  playerId?: string;
  action?: Record<string, unknown>;
};

export async function POST(req: Request, context: { params: Params }) {
  const { roomCode } = await context.params;
  const body = (await req.json()) as ActionBody;

  if (!body.playerId || !body.action) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const room = await applyAction(roomCode, body.playerId, body.action);
    return NextResponse.json({ room });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message === "ROOM_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
