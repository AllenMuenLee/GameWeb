import { NextResponse } from "next/server";
import { getRoomOrThrow, toPublicRoom } from "@/lib/multiplayer/store";

type Params = Promise<{ roomCode: string }>;

export async function GET(_: Request, context: { params: Params }) {
  const { roomCode } = await context.params;

  try {
    const room = await getRoomOrThrow(roomCode);
    return NextResponse.json({ room: toPublicRoom(room) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message === "ROOM_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
