import { NextResponse } from "next/server";
import { joinRoom } from "@/lib/multiplayer/store";

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
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message === "ROOM_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
