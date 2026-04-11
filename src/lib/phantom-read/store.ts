import { Prisma } from "@prisma/client";
import { Redis } from "@upstash/redis";
import { GameState } from "@/types/game";
import { canUseRedisStore, ensurePersistentStoreConfigured } from "@/lib/server/storage-runtime";
import { hasDatabaseUrl, prisma } from "@/lib/server/prisma";

const ROOM_TTL_SECONDS = 60 * 60 * 2;
const SQL_KIND = "phantom_read_room";

const redis = canUseRedisStore() ? Redis.fromEnv() : null;

function roomKey(roomId: string): string {
  return `phantom-read:room:${roomId.toUpperCase()}`;
}

function sqlRoomKey(roomId: string): string {
  return `${SQL_KIND}:${roomId.toUpperCase()}`;
}

function roomExpiry(): Date {
  return new Date(Date.now() + ROOM_TTL_SECONDS * 1000);
}

function getMemoryStore(): Map<string, GameState> {
  const globalForStore = globalThis as typeof globalThis & {
    __phantomReadRooms?: Map<string, GameState>;
  };

  if (!globalForStore.__phantomReadRooms) {
    globalForStore.__phantomReadRooms = new Map<string, GameState>();
  }

  return globalForStore.__phantomReadRooms;
}

async function getSqlRoom(roomId: string): Promise<GameState | null> {
  const key = sqlRoomKey(roomId);
  const record = await prisma.roomState.findUnique({
    where: { key },
    select: { state: true, expiresAt: true },
  });

  if (!record) return null;

  if (record.expiresAt.getTime() <= Date.now()) {
    await prisma.roomState.delete({ where: { key } }).catch(() => undefined);
    return null;
  }

  return record.state as unknown as GameState;
}

async function saveSqlRoom(state: GameState): Promise<void> {
  const key = sqlRoomKey(state.roomId);
  await prisma.roomState.upsert({
    where: { key },
    create: {
      key,
      kind: SQL_KIND,
      state: state as unknown as Prisma.JsonObject,
      expiresAt: roomExpiry(),
    },
    update: {
      state: state as unknown as Prisma.JsonObject,
      expiresAt: roomExpiry(),
      version: { increment: 1 },
    },
  });
}

export async function roomExists(roomId: string): Promise<boolean> {
  ensurePersistentStoreConfigured();
  if (hasDatabaseUrl()) {
    return (await getSqlRoom(roomId)) !== null;
  }

  const key = roomKey(roomId);
  if (redis) {
    return (await redis.exists(key)) === 1;
  }
  return getMemoryStore().has(key);
}

export async function getRoom(roomId: string): Promise<GameState | null> {
  ensurePersistentStoreConfigured();
  if (hasDatabaseUrl()) {
    return await getSqlRoom(roomId);
  }

  const key = roomKey(roomId);
  if (redis) {
    return (await redis.get<GameState>(key)) ?? null;
  }
  return getMemoryStore().get(key) ?? null;
}

export async function saveRoom(state: GameState): Promise<void> {
  ensurePersistentStoreConfigured();
  if (hasDatabaseUrl()) {
    await saveSqlRoom(state);
    return;
  }

  const key = roomKey(state.roomId);
  if (redis) {
    await redis.set(key, state, { ex: ROOM_TTL_SECONDS });
    return;
  }
  getMemoryStore().set(key, state);
}
