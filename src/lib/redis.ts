import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined;
};

function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL;
  if (url) {
    return new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  }
  return new IORedis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
}

export const redis: IORedis =
  globalForRedis.redis ?? createRedisConnection();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
