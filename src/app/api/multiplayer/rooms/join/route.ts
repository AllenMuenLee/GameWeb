import { NextResponse } from "next/server";
import { joinRoom } from "@/lib/multiplayer/store";
import { explainStorageError } from "@/lib/server/storage-runtime";

type JoinBody = {
  roomCode?: string;
  playerName?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as JoinBody;
  const roomCode = (body.roomCode ?? "").trim().toUpperCase();

  if (!roomCode) {
    return NextResponse.json({ error: "ROOM_CODE_REQUIRED" }, { status: 400 });
  }

  try {
    const data = await joinRoom(roomCode, (body.playerName ?? "Guest").trim());
    return NextResponse.json(data);
  } catch (error) {
    const message = explainStorageError(error);
    const status =
      message === "ROOM_NOT_FOUND" ? 404 : message === "STORAGE_NOT_CONFIGURED" ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
