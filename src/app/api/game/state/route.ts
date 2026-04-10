import { NextRequest, NextResponse } from "next/server";
import { advanceToNow, toSnapshot } from "@/lib/phantom-read/sim";
import { getRoom, saveRoom } from "@/lib/phantom-read/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("roomId")?.trim().toUpperCase();
  if (!roomId) {
    return NextResponse.json({ error: "ROOM_ID_REQUIRED" }, { status: 400 });
  }

  const state = await getRoom(roomId);
  if (!state) {
    return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
  }

  advanceToNow(state, Date.now());
  await saveRoom(state);
  return NextResponse.json({ snapshot: toSnapshot(state) });
}

