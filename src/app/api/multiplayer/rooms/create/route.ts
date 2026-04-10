import { NextResponse } from "next/server";
import { createRoom } from "@/lib/multiplayer/store";
import { GameType } from "@/lib/multiplayer/types";
import { explainStorageError } from "@/lib/server/storage-runtime";

type CreateBody = {
  gameType?: GameType;
  playerName?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBody;

    if (
      !body.gameType ||
      (body.gameType !== "1a2b" &&
        body.gameType !== "tic-tac-toe" &&
        body.gameType !== "phantom-read")
    ) {
      return NextResponse.json({ error: "INVALID_GAME_TYPE" }, { status: 400 });
    }

    const playerName = (body.playerName ?? "Host").trim();
    const data = await createRoom(body.gameType, playerName);

    return NextResponse.json(data);
  } catch (error) {
    const message = explainStorageError(error);
    const status = message === "STORAGE_NOT_CONFIGURED" ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
