import { NextResponse } from "next/server";
import { enqueueTestJob, createTestWorker } from "@/lib/jobs/test-job";

let workerStarted = false;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = body.message || "Hello from BullMQ test job!";

    // Start worker if not already running (dev convenience)
    if (!workerStarted) {
      createTestWorker();
      workerStarted = true;
    }

    const job = await enqueueTestJob(message);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: `Job enqueued with message: "${message}"`,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
