import { getQueue, createWorker, type Job } from "@/lib/jobs";

export const TEST_QUEUE = "test";

export interface TestJobData {
  message: string;
  timestamp: number;
}

export function getTestQueue() {
  return getQueue(TEST_QUEUE);
}

export function createTestWorker() {
  return createWorker<TestJobData>(
    TEST_QUEUE,
    async (job: Job<TestJobData>) => {
      console.log(
        `[TestJob] Processing job ${job.id}: ${job.data.message} (enqueued at ${new Date(job.data.timestamp).toISOString()})`
      );
    }
  );
}

export async function enqueueTestJob(message: string) {
  const queue = getTestQueue();
  const job = await queue.add("test-job", {
    message,
    timestamp: Date.now(),
  });
  return job;
}
