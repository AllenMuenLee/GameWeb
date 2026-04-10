import { NextResponse } from "next/server";
import { RestartRequest } from "@/types/game";
import { resetMatchInRoom, toSnapshot } from "@/lib/phantom-read/sim";
import { getRoom, saveRoom } from "@/lib/phantom-read/store";
import { explainStorageError } from "@/lib/server/storage-runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as RestartRequest | null;
    if (!body?.roomId || !body.playerId) {
      return NextResponse.json({ error: "INVALID_RESTART_PAYLOAD" }, { status: 400 });
    }

    const state = await getRoom(body.roomId);
    if (!state) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    }
    if (!state.players[body.playerId]) {
      return NextResponse.json({ error: "PLAYER_NOT_IN_ROOM" }, { status: 403 });
    }

    resetMatchInRoom(state);
    await saveRoom(state);
    return NextResponse.json({ snapshot: toSnapshot(state) });
  } catch (error) {
    const message = explainStorageError(error);
    const status = message === "STORAGE_NOT_CONFIGURED" ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
