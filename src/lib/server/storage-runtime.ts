const hasRedisEnv =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

const allowMemoryStoreFallback =
  process.env.NODE_ENV !== "production" || process.env.ALLOW_MEMORY_STORE_IN_PROD === "1";

export function canUseRedisStore(): boolean {
  return hasRedisEnv;
}

export function ensurePersistentStoreConfigured(): void {
  if (hasRedisEnv || allowMemoryStoreFallback) {
    return;
  }

  throw new Error("STORAGE_NOT_CONFIGURED");
}

export function explainStorageError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "UNKNOWN_ERROR";
}
