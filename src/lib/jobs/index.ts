import { Queue, Worker, type Job, type WorkerOptions, type QueueOptions } from "bullmq";
import { redis } from "@/lib/redis";

const queues: Map<string, Queue> = new Map();

export function getQueue(name: string, opts?: Partial<QueueOptions>): Queue {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
    ...opts,
  });
  queues.set(name, queue);
  return queue;
}

export function createWorker<T = unknown>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  opts?: Partial<WorkerOptions>
): Worker<T> {
  const worker = new Worker<T>(queueName, processor, {
    connection: redis,
    ...opts,
  });

  worker.on("completed", (job) => {
    console.log(`[BullMQ] Job ${job.id} in queue "${queueName}" completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[BullMQ] Job ${job?.id} in queue "${queueName}" failed:`,
      err.message
    );
  });

  return worker;
}

export { Queue, Worker, type Job };
