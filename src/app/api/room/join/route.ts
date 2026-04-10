import { NextResponse } from "next/server";
import { JoinRoomResponse } from "@/types/game";
import { addSecondPlayer, createPlayerIdentity, toSnapshot } from "@/lib/phantom-read/sim";
import { getRoom, saveRoom } from "@/lib/phantom-read/store";

type JoinRoomBody = {
  roomId?: string;
  playerName?: string;
};

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as JoinRoomBody;
  const roomId = body.roomId?.trim().toUpperCase();

  if (!roomId) {
    return NextResponse.json({ error: "ROOM_ID_REQUIRED" }, { status: 400 });
  }

  const state = await getRoom(roomId);
  if (!state) {
    return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
  }

  if (state.playerIds.length >= 2) {
    return NextResponse.json({ error: "ROOM_FULL" }, { status: 409 });
  }

  const playerId = createPlayerIdentity();
  const playerName = body.playerName?.trim().slice(0, 24) || "Player 2";
  const player = addSecondPlayer(state, playerId, playerName);
  await saveRoom(state);

  const response: JoinRoomResponse = {
    roomId: state.roomId,
    playerId,
    slot: player.slot,
    snapshot: toSnapshot(state),
  };

  return NextResponse.json(response);
}

