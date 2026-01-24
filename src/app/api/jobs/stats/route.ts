import { NextResponse } from "next/server";
import { getQueueStats, getRecentJobs } from "@/lib/jobs/board";

export async function GET() {
  try {
    const stats = await getQueueStats();
    const jobs = await getRecentJobs("test", 20);

    return NextResponse.json({ stats, jobs });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: errorMessage, stats: [], jobs: [] },
      { status: 500 }
    );
  }
}
