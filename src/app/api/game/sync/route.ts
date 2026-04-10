import { NextResponse } from "next/server";
import { SyncRequest, SyncResponse } from "@/types/game";
import { advanceToNow, applyInput, toSnapshot } from "@/lib/phantom-read/sim";
import { getRoom, saveRoom } from "@/lib/phantom-read/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = (await request.json().catch(() => null)) as SyncRequest | null;

  if (!body?.roomId || !body.playerId || !Array.isArray(body.inputs)) {
    return NextResponse.json({ error: "INVALID_SYNC_PAYLOAD" }, { status: 400 });
  }

  const state = await getRoom(body.roomId);
  if (!state) {
    return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
  }

  if (!state.players[body.playerId]) {
    return NextResponse.json({ error: "PLAYER_NOT_IN_ROOM" }, { status: 403 });
  }

  const now = Date.now();
  advanceToNow(state, now);

  let acceptedInputSeq = state.players[body.playerId].lastProcessedInputSeq;
  const sortedInputs = [...body.inputs].sort((a, b) => a.seq - b.seq);

  for (const input of sortedInputs) {
    acceptedInputSeq = applyInput(state, body.playerId, input);
  }

  advanceToNow(state, Date.now(), 2);
  await saveRoom(state);

  const response: SyncResponse = {
    acceptedInputSeq,
    snapshot: toSnapshot(state),
    suggestedSyncHz: (body.clientRttMs ?? 0) >= 180 ? 10 : 20,
    serverProcessingMs: Date.now() - startedAt,
  };

  return NextResponse.json(response);
}
