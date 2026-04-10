import { NextRequest, NextResponse } from "next/server";
import { advanceToNow, toSnapshot } from "@/lib/phantom-read/sim";
import { getRoom, saveRoom } from "@/lib/phantom-read/store";
import { explainStorageError } from "@/lib/server/storage-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
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
  } catch (error) {
    const message = explainStorageError(error);
    const status = message === "STORAGE_NOT_CONFIGURED" ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
