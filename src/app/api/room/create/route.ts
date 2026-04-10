import { NextResponse } from "next/server";
import { CreateRoomResponse } from "@/types/game";
import { createInitialGameState, createPlayerIdentity, createRoomId, toSnapshot } from "@/lib/phantom-read/sim";
import { roomExists, saveRoom } from "@/lib/phantom-read/store";
import { explainStorageError } from "@/lib/server/storage-runtime";

type CreateRoomBody = {
  playerName?: string;
};

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as CreateRoomBody;
    const playerName = body.playerName?.trim().slice(0, 24) || "Player 1";

    let roomId = createRoomId();
    while (await roomExists(roomId)) {
      roomId = createRoomId();
    }

    const playerId = createPlayerIdentity();
    const state = createInitialGameState(roomId, playerId, playerName);
    await saveRoom(state);

    const response: CreateRoomResponse = {
      roomId,
      playerId,
      slot: "player1",
      snapshot: toSnapshot(state),
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = explainStorageError(error);
    const status = message === "STORAGE_NOT_CONFIGURED" ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
