import { NextResponse } from "next/server";
import { applyAction } from "@/lib/multiplayer/store";
import { explainStorageError } from "@/lib/server/storage-runtime";

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
    const message = explainStorageError(error);
    const status =
      message === "ROOM_NOT_FOUND" ? 404 : message === "STORAGE_NOT_CONFIGURED" ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
