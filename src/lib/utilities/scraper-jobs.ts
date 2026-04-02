import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "fs";
import path from "path";
import crypto from "crypto";

export interface ScraperJob {
  id: string;
  provider: string;
  providerName: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  result: {
    billCount: number;
    stored: number;
    updated: number;
    imported?: number;
  } | null;
  pid: number | null;
}

const JOBS_DIR = path.join(process.cwd(), "data");
const JOBS_FILE = path.join(JOBS_DIR, "scraper-jobs.json");
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const STALE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

function ensureDir() {
  if (!existsSync(JOBS_DIR)) {
    mkdirSync(JOBS_DIR, { recursive: true });
  }
}

export function readJobs(): ScraperJob[] {
  try {
    if (!existsSync(JOBS_FILE)) return [];
    const raw = readFileSync(JOBS_FILE, "utf-8");
    const jobs: ScraperJob[] = JSON.parse(raw);
    // Filter out jobs older than 24 hours
    const cutoff = Date.now() - MAX_AGE_MS;
    return jobs.filter((j) => new Date(j.startedAt).getTime() > cutoff);
  } catch {
    return [];
  }
}

function writeJobs(jobs: ScraperJob[]): void {
  ensureDir();
  const tmp = JOBS_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(jobs, null, 2));
  renameSync(tmp, JOBS_FILE);
}

export function createJob(provider: string, providerName: string, pid: number | null): ScraperJob {
  const job: ScraperJob = {
    id: crypto.randomUUID(),
    provider,
    providerName,
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    result: null,
    pid,
  };

  const jobs = readJobs();
  jobs.unshift(job);
  writeJobs(jobs);
  return job;
}

export function updateJob(id: string, update: Partial<ScraperJob>): void {
  const jobs = readJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx >= 0) {
    jobs[idx] = { ...jobs[idx], ...update };
    writeJobs(jobs);
  }
}

export function getActiveJobForProvider(provider: string): ScraperJob | null {
  const jobs = readJobs();
  return jobs.find((j) => j.provider === provider && j.status === "running") || null;
}

export function cleanupStaleJobs(): void {
  const jobs = readJobs();
  const now = Date.now();
  let changed = false;

  for (const job of jobs) {
    if (
      job.status === "running" &&
      now - new Date(job.startedAt).getTime() > STALE_TIMEOUT_MS
    ) {
      job.status = "failed";
      job.error = "Timed out after 15 minutes";
      job.completedAt = new Date().toISOString();
      changed = true;
    }
  }

  if (changed) writeJobs(jobs);
}

export function dismissJob(id: string): void {
  const jobs = readJobs().filter((j) => j.id !== id);
  writeJobs(jobs);
}
