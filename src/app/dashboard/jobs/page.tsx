"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface JobInfo {
  id: string;
  name: string;
  data: Record<string, unknown>;
  status: string;
  createdAt: number;
  processedAt: number | null;
  finishedAt: number | null;
  failedReason: string | null;
}

export default function JobsDashboardPage() {
  const [stats, setStats] = useState<QueueStats[]>([]);
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enqueueing, setEnqueueing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs/stats");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setStats(data.stats);
        setJobs(data.jobs);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const enqueueTestJob = async () => {
    setEnqueueing(true);
    try {
      await fetch("/api/jobs/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Test job at ${new Date().toLocaleTimeString()}` }),
      });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enqueue");
    } finally {
      setEnqueueing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Job Queue Dashboard</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Job Queue Dashboard</h1>
        <Button onClick={enqueueTestJob} disabled={enqueueing}>
          {enqueueing ? "Enqueueing..." : "Enqueue Test Job"}
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md mb-4">
          {error}
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Queue Stats</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map((queue) => (
            <div key={queue.name} className="border rounded-lg p-4">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mb-2">
                {queue.name}
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Waiting:</span>{" "}
                  <span className="font-mono">{queue.waiting}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Active:</span>{" "}
                  <span className="font-mono">{queue.active}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Completed:</span>{" "}
                  <span className="font-mono">{queue.completed}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Failed:</span>{" "}
                  <span className="font-mono">{queue.failed}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Delayed:</span>{" "}
                  <span className="font-mono">{queue.delayed}</span>
                </div>
              </div>
            </div>
          ))}
          {stats.length === 0 && (
            <p className="text-muted-foreground col-span-full">
              No queues registered. Connect Redis to see queue stats.
            </p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Jobs</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">ID</th>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Created</th>
                <th className="text-left p-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t">
                  <td className="p-3 font-mono text-xs">{job.id}</td>
                  <td className="p-3">{job.name}</td>
                  <td className="p-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        job.status === "completed"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : job.status === "failed"
                            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                            : job.status === "active"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3 font-mono text-xs max-w-xs truncate">
                    {JSON.stringify(job.data)}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-muted-foreground">
                    No jobs found. Enqueue a test job to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
