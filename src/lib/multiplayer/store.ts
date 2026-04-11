import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Redis } from "@upstash/redis";
import { applyOneATwoBAction, initializeOneATwoBRoom, onJoinOneATwoB } from "@/games/1a2b/server";
import {
  applyPhantomReadAction,
  initializePhantomReadRoom,
  onJoinPhantomRead,
} from "@/games/phantom-read/server";
import {
  applyTicTacToeAction,
  initializeTicTacToeRoom,
  onJoinTicTacToe,
} from "@/games/tic-tac-toe/server";
import { canUseRedisStore, ensurePersistentStoreConfigured } from "@/lib/server/storage-runtime";
import { hasDatabaseUrl, prisma } from "@/lib/server/prisma";
import { GameType, PublicRoomState, Room } from "./types";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL_SECONDS = 60 * 60 * 24;
const SQL_KIND = "multiplayer_room";
const SQL_MUTATION_RETRIES = 5;

const redis = canUseRedisStore() ? Redis.fromEnv() : null;

function roomKey(roomCode: string) {
  return `gameweb:room:${roomCode.toUpperCase()}`;
}

function sqlRoomKey(roomCode: string) {
  return `${SQL_KIND}:${roomCode.toUpperCase()}`;
}

function roomExpiry(): Date {
  return new Date(Date.now() + ROOM_TTL_SECONDS * 1000);
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

async function getSqlRoomRecord(
  roomCode: string,
): Promise<{ room: Room; version: number } | null> {
  if (!hasDatabaseUrl()) return null;

  const record = await prisma.roomState.findUnique({
    where: { key: sqlRoomKey(roomCode) },
    select: {
      state: true,
      version: true,
      expiresAt: true,
    },
  });

  if (!record) return null;

  if (record.expiresAt.getTime() <= Date.now()) {
    await prisma.roomState.delete({ where: { key: sqlRoomKey(roomCode) } }).catch(() => undefined);
    return null;
  }

  return { room: record.state as unknown as Room, version: record.version };
}

async function setSqlRoom(room: Room): Promise<void> {
  await prisma.roomState.upsert({
    where: { key: sqlRoomKey(room.roomCode) },
    create: {
      key: sqlRoomKey(room.roomCode),
      kind: SQL_KIND,
      state: room as unknown as Prisma.JsonObject,
      expiresAt: roomExpiry(),
    },
    update: {
      state: room as unknown as Prisma.JsonObject,
      expiresAt: roomExpiry(),
      version: { increment: 1 },
    },
  });
}

async function tryCreateSqlRoom(room: Room): Promise<boolean> {
  try {
    await prisma.roomState.create({
      data: {
        key: sqlRoomKey(room.roomCode),
        kind: SQL_KIND,
        state: room as unknown as Prisma.JsonObject,
        expiresAt: roomExpiry(),
      },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}

async function mutateSqlRoom(
  roomCode: string,
  mutate: (room: Room) => void,
): Promise<Room> {
  const code = roomCode.toUpperCase();

  for (let attempt = 0; attempt < SQL_MUTATION_RETRIES; attempt += 1) {
    const record = await getSqlRoomRecord(code);
    if (!record) {
      throw new Error("ROOM_NOT_FOUND");
    }

    mutate(record.room);
    record.room.updatedAt = Date.now();

    const update = await prisma.roomState.updateMany({
      where: {
        key: sqlRoomKey(code),
        version: record.version,
        expiresAt: { gt: new Date() },
      },
      data: {
        state: record.room as unknown as Prisma.JsonObject,
        expiresAt: roomExpiry(),
        version: { increment: 1 },
      },
    });

    if (update.count === 1) {
      return record.room;
    }
  }

  throw new Error("ROOM_CONFLICT_RETRY");
}

async function getRoom(roomCode: string): Promise<Room | null> {
  ensurePersistentStoreConfigured();
  const code = roomCode.toUpperCase();

  if (hasDatabaseUrl()) {
    const record = await getSqlRoomRecord(code);
    return record?.room ?? null;
  }

  if (redis) {
    return (await redis.get<Room>(roomKey(code))) ?? null;
  }

  return getMemoryStore().get(code) ?? null;
}

async function setRoom(room: Room) {
  ensurePersistentStoreConfigured();

  if (hasDatabaseUrl()) {
    await setSqlRoom(room);
    return;
  }

  if (redis) {
    await redis.set(roomKey(room.roomCode), room, { ex: ROOM_TTL_SECONDS });
    return;
  }

  getMemoryStore().set(room.roomCode, room);
}

async function roomExists(roomCode: string): Promise<boolean> {
  ensurePersistentStoreConfigured();
  const code = roomCode.toUpperCase();

  if (hasDatabaseUrl()) {
    return (await getSqlRoomRecord(code)) !== null;
  }

  if (redis) {
    return (await redis.exists(roomKey(code))) === 1;
  }

  return getMemoryStore().has(code);
}

function initializeGameState(room: Room) {
  if (room.gameType === "1a2b") {
    initializeOneATwoBRoom(room);
    return;
  }

  if (room.gameType === "tic-tac-toe") {
    initializeTicTacToeRoom(room);
    return;
  }

  initializePhantomReadRoom(room);
}

function onPlayerJoined(room: Room, playerId: string) {
  if (room.gameType === "1a2b") {
    onJoinOneATwoB(room, playerId);
    return;
  }

  if (room.gameType === "tic-tac-toe") {
    onJoinTicTacToe(room);
    return;
  }

  onJoinPhantomRead(room, playerId);
}

export async function createRoom(gameType: GameType, playerName: string) {
  if (hasDatabaseUrl()) {
    while (true) {
      const roomCode = newRoomCode();
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

      if (await tryCreateSqlRoom(room)) {
        return { roomCode, playerId: hostId, room: toPublicRoom(room) };
      }
    }
  }

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
  if (hasDatabaseUrl()) {
    const playerId = randomUUID();
    const room = await mutateSqlRoom(roomCode, (value) => {
      if (value.players.length >= 2) {
        throw new Error("ROOM_FULL");
      }

      value.players.push({ id: playerId, name: playerName.trim().slice(0, 24) || "Player 2" });
      onPlayerJoined(value, playerId);
    });

    return { playerId, room: toPublicRoom(room) };
  }

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
    phantomRead: room.phantomRead
      ? {
          round: room.phantomRead.round,
          fighters: room.phantomRead.fighters,
          submitted: Object.fromEntries(
            Object.entries(room.phantomRead.submissions).map(([id, value]) => [id, Boolean(value)]),
          ),
          recentLogs: room.phantomRead.logs,
        }
      : undefined,
  };
}

export async function applyAction(roomCode: string, playerId: string, action: Record<string, unknown>) {
  if (hasDatabaseUrl()) {
    const room = await mutateSqlRoom(roomCode, (value) => {
      const player = value.players.find((p) => p.id === playerId);
      if (!player) {
        throw new Error("PLAYER_NOT_IN_ROOM");
      }

      if (value.gameType === "1a2b") {
        applyOneATwoBAction(value, playerId, action);
      } else if (value.gameType === "tic-tac-toe") {
        applyTicTacToeAction(value, playerId, action);
      } else {
        applyPhantomReadAction(value, playerId, action);
      }
    });

    return toPublicRoom(room);
  }

  const room = await getRoomOrThrow(roomCode);
  const player = room.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error("PLAYER_NOT_IN_ROOM");
  }

  if (room.gameType === "1a2b") {
    applyOneATwoBAction(room, playerId, action);
  } else if (room.gameType === "tic-tac-toe") {
    applyTicTacToeAction(room, playerId, action);
  } else {
    applyPhantomReadAction(room, playerId, action);
  }

  room.updatedAt = Date.now();
  await setRoom(room);
  return toPublicRoom(room);
}
