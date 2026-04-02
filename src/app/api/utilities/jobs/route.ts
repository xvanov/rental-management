import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs/promises";
import { getAuthContext } from "@/lib/auth-context";
import { runScraperAsync } from "@/lib/utilities/scraper-runner";
import {
  readJobs,
  createJob,
  updateJob,
  getActiveJobForProvider,
  cleanupStaleJobs,
  dismissJob,
} from "@/lib/utilities/scraper-jobs";

const PROVIDERS: Record<
  string,
  { name: string; scraperName: string; endpoint: string }
> = {
  "duke-energy": { name: "Duke Energy", scraperName: "duke-energy", endpoint: "/api/utilities/duke-energy" },
  "durham-water": { name: "Durham Water", scraperName: "durham-water", endpoint: "/api/utilities/durham-water" },
  "enbridge-gas": { name: "Enbridge Gas", scraperName: "enbridge-gas", endpoint: "/api/utilities/enbridge-gas" },
  "wake-electric": { name: "Wake Electric", scraperName: "wake-electric", endpoint: "/api/utilities/wake-electric" },
  "graham-utilities": { name: "Graham Utilities", scraperName: "graham-utilities", endpoint: "/api/utilities/graham-utilities" },
  smud: { name: "SMUD", scraperName: "smud", endpoint: "/api/utilities/smud" },
  spectrum: { name: "Spectrum", scraperName: "spectrum", endpoint: "/api/utilities/spectrum" },
  xfinity: { name: "Xfinity", scraperName: "xfinity", endpoint: "/api/utilities/xfinity" },
};

// GET: List all scraper jobs
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    cleanupStaleJobs();
    const jobs = readJobs();
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Failed to get scraper jobs:", error);
    return NextResponse.json({ error: "Failed to get jobs" }, { status: 500 });
  }
}

// POST: Start a new scraper job
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await req.json();
    const { provider } = body as { provider: string };

    if (!provider || !PROVIDERS[provider]) {
      return NextResponse.json(
        { error: `Unknown provider: ${provider}. Valid: ${Object.keys(PROVIDERS).join(", ")}` },
        { status: 400 }
      );
    }

    // Check for already running job
    const existing = getActiveJobForProvider(provider);
    if (existing) {
      return NextResponse.json(
        { error: "A scraper for this provider is already running", job: existing },
        { status: 409 }
      );
    }

    const config = PROVIDERS[provider];
    const projectRoot = process.cwd();
    const outputDir = path.join(projectRoot, "data", "downloaded-bills", config.scraperName);
    await fs.mkdir(outputDir, { recursive: true });

    // Clean up old output files
    try {
      const files = await fs.readdir(outputDir);
      for (const file of files) {
        if (file.startsWith("api_fetch_")) {
          await fs.unlink(path.join(outputDir, file));
        }
      }
    } catch {
      // ignore
    }

    const outputFile = path.join(outputDir, `api_fetch_${Date.now()}.json`);
    const args = ["--json", "--output", outputFile];

    // Create job record first so we have the ID for callbacks
    const job = createJob(config.scraperName, config.name, null);

    // Spawn the scraper asynchronously
    const { pid } = await runScraperAsync({
      scraperName: config.scraperName,
      args,
      outputFile,
      onComplete: async () => {
        console.log(`[ScraperJob] ${config.name} completed, processing results...`);
        try {
          const baseUrl = `http://localhost:${process.env.PORT || 3000}`;

          // Step 1: Parse downloaded PDFs and store in provider-specific parsed table
          const parseRes = await fetch(`${baseUrl}${config.endpoint}?parseOnly=true`);
          if (!parseRes.ok) {
            const errData = await parseRes.json().catch(() => ({}));
            updateJob(job.id, {
              status: "completed",
              completedAt: new Date().toISOString(),
              result: { billCount: 0, stored: 0, updated: 0, imported: 0 },
              error: errData.error || "Failed to process downloaded bills",
            });
            return;
          }

          const parseData = await parseRes.json();
          const allBills = [...(parseData.bills || []), ...(parseData.attention_required || [])];
          const parsed = parseData.summary?.stored || 0;
          const updated = parseData.summary?.updated || 0;
          console.log(`[ScraperJob] ${config.name} parsed ${parsed} new, ${updated} updated`);

          // Step 2: Auto-import all matched bills into the main UtilityBill table
          let imported = 0;
          if (allBills.length > 0) {
            const importRes = await fetch(`${baseUrl}${config.endpoint}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bills: allBills }),
            });
            if (importRes.ok) {
              const importData = await importRes.json();
              imported = importData.created || 0;
              console.log(`[ScraperJob] ${config.name} imported ${imported} new bills, ${importData.skipped || 0} skipped`);
            }
          }

          updateJob(job.id, {
            status: "completed",
            completedAt: new Date().toISOString(),
            result: {
              billCount: allBills.length,
              stored: parsed,
              updated,
              imported,
            },
          });
        } catch (err) {
          updateJob(job.id, {
            status: "completed",
            completedAt: new Date().toISOString(),
            result: { billCount: 0, stored: 0, updated: 0, imported: 0 },
            error: `Bills downloaded but processing failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      },
      onError: async (error: string) => {
        console.error(`[ScraperJob] ${config.name} failed:`, error);
        updateJob(job.id, {
          status: "failed",
          completedAt: new Date().toISOString(),
          error: error.length > 500 ? error.slice(-500) : error,
        });
      },
    });

    // Update job with PID
    updateJob(job.id, { pid });

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    console.error("Failed to start scraper job:", error);
    return NextResponse.json(
      { error: "Failed to start scraper job" },
      { status: 500 }
    );
  }
}

// DELETE: Dismiss a completed/failed job
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    dismissJob(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to dismiss job:", error);
    return NextResponse.json({ error: "Failed to dismiss job" }, { status: 500 });
  }
}
