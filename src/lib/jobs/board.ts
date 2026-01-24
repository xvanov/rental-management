import { getTestQueue } from "@/lib/jobs/test-job";

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export async function getQueueStats(): Promise<QueueStats[]> {
  const testQueue = getTestQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    testQueue.getWaitingCount(),
    testQueue.getActiveCount(),
    testQueue.getCompletedCount(),
    testQueue.getFailedCount(),
    testQueue.getDelayedCount(),
  ]);

  return [
    {
      name: testQueue.name,
      waiting,
      active,
      completed,
      failed,
      delayed,
    },
  ];
}

export async function getRecentJobs(queueName: string, limit = 20) {
  const testQueue = getTestQueue();
  if (queueName !== testQueue.name) return [];

  const jobs = await testQueue.getJobs(
    ["completed", "failed", "waiting", "active", "delayed"],
    0,
    limit
  );

  return jobs.map((job) => ({
    id: job.id,
    name: job.name,
    data: job.data,
    status: job.finishedOn
      ? job.failedReason
        ? "failed"
        : "completed"
      : job.processedOn
        ? "active"
        : "waiting",
    createdAt: job.timestamp,
    processedAt: job.processedOn,
    finishedAt: job.finishedOn,
    failedReason: job.failedReason,
  }));
}
