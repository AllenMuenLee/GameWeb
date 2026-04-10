import { NextResponse } from "next/server";
import { getRoomOrThrow, toPublicRoom } from "@/lib/multiplayer/store";
import { explainStorageError } from "@/lib/server/storage-runtime";

type Params = Promise<{ roomCode: string }>;

export async function GET(_: Request, context: { params: Params }) {
  const { roomCode } = await context.params;

  try {
    const room = await getRoomOrThrow(roomCode);
    return NextResponse.json({ room: toPublicRoom(room) });
  } catch (error) {
    const message = explainStorageError(error);
    const status =
      message === "ROOM_NOT_FOUND" ? 404 : message === "STORAGE_NOT_CONFIGURED" ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
