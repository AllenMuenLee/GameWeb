import { Room } from "@/lib/multiplayer/types";

function isUniqueFourDigit(input: string): boolean {
  return /^\d{4}$/.test(input) && new Set(input.split("")).size === 4;
}

function getAB(secret: string, guess: string): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (let i = 0; i < 4; i += 1) {
    if (guess[i] === secret[i]) {
      a += 1;
    } else if (secret.includes(guess[i])) {
      b += 1;
    }
  }
  return { a, b };
}

export function initializeOneATwoBRoom(room: Room) {
  room.oneATwoB = {
    secrets: { [room.hostId]: null },
    guesses: [],
  };
}

export function onJoinOneATwoB(room: Room, playerId: string) {
  if (!room.oneATwoB) {
    throw new Error("INVALID_ROOM_STATE");
  }

  room.oneATwoB.secrets[playerId] = null;
  room.status = "setup";
}

export function applyOneATwoBAction(room: Room, playerId: string, action: Record<string, unknown>) {
  if (!room.oneATwoB) {
    throw new Error("INVALID_ROOM_STATE");
  }

  const actionType = action.type;

  if (actionType === "set-secret") {
    const secret = String(action.secret ?? "").trim();
    if (!isUniqueFourDigit(secret)) {
      throw new Error("INVALID_SECRET");
    }

    room.oneATwoB.secrets[playerId] = secret;

    const bothReady = room.players.length === 2 && room.players.every((p) => room.oneATwoB?.secrets[p.id]);
    if (bothReady) {
      room.status = "playing";
      room.currentTurnPlayerId = room.players[0].id;
    } else {
      room.status = "setup";
    }

    return;
  }

  if (actionType === "make-guess") {
    if (room.status !== "playing") {
      throw new Error("GAME_NOT_PLAYING");
    }

    if (room.currentTurnPlayerId !== playerId) {
      throw new Error("NOT_YOUR_TURN");
    }

    const guess = String(action.guess ?? "").trim();
    if (!isUniqueFourDigit(guess)) {
      throw new Error("INVALID_GUESS");
    }

    const opponent = room.players.find((p) => p.id !== playerId);
    if (!opponent) {
      throw new Error("WAITING_FOR_OPPONENT");
    }

    const opponentSecret = room.oneATwoB.secrets[opponent.id];
    if (!opponentSecret) {
      throw new Error("OPPONENT_NOT_READY");
    }

    const { a, b } = getAB(opponentSecret, guess);
    room.oneATwoB.guesses.push({ guess, a, b, byPlayerId: playerId, at: Date.now() });

    if (a === 4) {
      room.status = "finished";
      room.winnerPlayerId = playerId;
      room.currentTurnPlayerId = null;
      return;
    }

    room.currentTurnPlayerId = opponent.id;
    return;
  }

  if (actionType === "restart-game") {
    room.oneATwoB.secrets = Object.fromEntries(room.players.map((p) => [p.id, null]));
    room.oneATwoB.guesses = [];
    room.winnerPlayerId = null;
    room.currentTurnPlayerId = null;
    room.status = room.players.length === 2 ? "setup" : "waiting";
    return;
  }

  throw new Error("UNKNOWN_ACTION");
}
