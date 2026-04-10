import { Redis } from "@upstash/redis";
import { GameState } from "@/types/game";

const ROOM_TTL_SECONDS = 60 * 60 * 2;

const hasRedisEnv =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

const redis = hasRedisEnv ? Redis.fromEnv() : null;

function roomKey(roomId: string): string {
  return `phantom-read:room:${roomId.toUpperCase()}`;
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

export async function roomExists(roomId: string): Promise<boolean> {
  const key = roomKey(roomId);
  if (redis) {
    return (await redis.exists(key)) === 1;
  }
  return getMemoryStore().has(key);
}

export async function getRoom(roomId: string): Promise<GameState | null> {
  const key = roomKey(roomId);
  if (redis) {
    return (await redis.get<GameState>(key)) ?? null;
  }
  return getMemoryStore().get(key) ?? null;
}

export async function saveRoom(state: GameState): Promise<void> {
  const key = roomKey(state.roomId);
  if (redis) {
    await redis.set(key, state, { ex: ROOM_TTL_SECONDS });
    return;
  }
  getMemoryStore().set(key, state);
}

