import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { applyOneATwoBAction, initializeOneATwoBRoom, onJoinOneATwoB } from "@/games/1a2b/server";
import {
  applyTicTacToeAction,
  initializeTicTacToeRoom,
  onJoinTicTacToe,
} from "@/games/tic-tac-toe/server";
import { GameType, PublicRoomState, Room } from "./types";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL_SECONDS = 60 * 60 * 24;

const hasRedisEnv =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

const redis = hasRedisEnv ? Redis.fromEnv() : null;

function roomKey(roomCode: string) {
  return `gameweb:room:${roomCode.toUpperCase()}`;
}

function newRoomCode(): string {
  let result = "";
  for (let i = 0; i < 6; i += 1) {
    result += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return result;
}

function getMemoryStore(): Map<string, Room> {
  const globalForStore = globalThis as typeof globalThis & {
    __gameRooms?: Map<string, Room>;
  };

  if (!globalForStore.__gameRooms) {
    globalForStore.__gameRooms = new Map<string, Room>();
  }

  return globalForStore.__gameRooms;
}

async function getRoom(roomCode: string): Promise<Room | null> {
  const code = roomCode.toUpperCase();
  if (redis) {
    return (await redis.get<Room>(roomKey(code))) ?? null;
  }

  return getMemoryStore().get(code) ?? null;
}

async function setRoom(room: Room) {
  if (redis) {
    await redis.set(roomKey(room.roomCode), room, { ex: ROOM_TTL_SECONDS });
    return;
  }

  getMemoryStore().set(room.roomCode, room);
}

async function roomExists(roomCode: string): Promise<boolean> {
  if (redis) {
    return (await redis.exists(roomKey(roomCode.toUpperCase()))) === 1;
  }

  return getMemoryStore().has(roomCode.toUpperCase());
}

function initializeGameState(room: Room) {
  if (room.gameType === "1a2b") {
    initializeOneATwoBRoom(room);
    return;
  }

  initializeTicTacToeRoom(room);
}

function onPlayerJoined(room: Room, playerId: string) {
  if (room.gameType === "1a2b") {
    onJoinOneATwoB(room, playerId);
    return;
  }

  onJoinTicTacToe(room);
}

export async function createRoom(gameType: GameType, playerName: string) {
  let roomCode = newRoomCode();
  while (await roomExists(roomCode)) {
    roomCode = newRoomCode();
  }

  const hostId = randomUUID();
  const now = Date.now();

  const room: Room = {
    roomCode,
    gameType,
    players: [{ id: hostId, name: playerName.trim().slice(0, 24) || "Player 1" }],
    hostId,
    currentTurnPlayerId: null,
    createdAt: now,
    updatedAt: now,
    status: "waiting",
    winnerPlayerId: null,
  };

  initializeGameState(room);
  await setRoom(room);

  return { roomCode, playerId: hostId, room: toPublicRoom(room) };
}

export async function joinRoom(roomCode: string, playerName: string) {
  const room = await getRoom(roomCode);
  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }

  if (room.players.length >= 2) {
    throw new Error("ROOM_FULL");
  }

  const playerId = randomUUID();
  room.players.push({ id: playerId, name: playerName.trim().slice(0, 24) || "Player 2" });
  room.updatedAt = Date.now();
  onPlayerJoined(room, playerId);

  await setRoom(room);

  return { playerId, room: toPublicRoom(room) };
}

export async function getRoomOrThrow(roomCode: string) {
  const room = await getRoom(roomCode);
  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }
  return room;
}

export function toPublicRoom(room: Room): PublicRoomState {
  return {
    roomCode: room.roomCode,
    gameType: room.gameType,
    players: room.players,
    currentTurnPlayerId: room.currentTurnPlayerId,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    status: room.status,
    winnerPlayerId: room.winnerPlayerId,
    oneATwoB: room.oneATwoB
      ? {
          guesses: room.oneATwoB.guesses,
          hasSecret: Object.fromEntries(
            Object.entries(room.oneATwoB.secrets).map(([id, value]) => [id, Boolean(value)]),
          ),
        }
      : undefined,
    ticTacToe: room.ticTacToe,
  };
}

export async function applyAction(roomCode: string, playerId: string, action: Record<string, unknown>) {
  const room = await getRoomOrThrow(roomCode);
  const player = room.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error("PLAYER_NOT_IN_ROOM");
  }

  if (room.gameType === "1a2b") {
    applyOneATwoBAction(room, playerId, action);
  } else {
    applyTicTacToeAction(room, playerId, action);
  }

  room.updatedAt = Date.now();
  await setRoom(room);
  return toPublicRoom(room);
}
