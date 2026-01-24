import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const health: {
    status: "ok" | "degraded" | "error";
    timestamp: string;
    services: Record<string, { status: string; latency?: number; error?: string }>;
  } = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {},
  };

  // Check PostgreSQL connection
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = {
      status: "ok",
      latency: Date.now() - start,
    };
  } catch (error) {
    health.status = "degraded";
    health.services.database = {
      status: "error",
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }

  // Check Redis connection
  try {
    const { redis: redisClient } = await import("@/lib/redis");
    const start = Date.now();
    await redisClient.ping();
    health.services.redis = {
      status: "ok",
      latency: Date.now() - start,
    };
  } catch (error) {
    // Redis is optional - don't mark as degraded since BullMQ is a background service
    health.services.redis = {
      status: "error",
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
