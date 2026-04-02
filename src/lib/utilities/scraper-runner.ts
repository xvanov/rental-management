import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

/**
 * Find a working Python binary for utility scrapers.
 * Checks per-scraper venv first, then shared Docker venv, then system python.
 */
export async function findPython(scraperName: string): Promise<string> {
  const projectRoot = process.cwd();
  const candidates = [
    // Per-scraper venv (local development)
    path.join(projectRoot, "scripts", scraperName, ".venv", "bin", "python"),
    // Shared Docker venv
    path.join(projectRoot, "scraper-venv", "bin", "python"),
    // Absolute path for Docker (when cwd is /app)
    "/app/scraper-venv/bin/python",
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate
    }
  }

  throw new Error(
    `No Python found for ${scraperName} scraper. ` +
    `Set up a venv in scripts/${scraperName}/ or install the shared scraper-venv.`
  );
}

/**
 * Get the Playwright browsers path for scrapers.
 * Checks per-scraper cache first, then Docker shared path.
 */
export function getPlaywrightBrowsersPath(scraperName?: string): string {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    return process.env.PLAYWRIGHT_BROWSERS_PATH;
  }
  const projectRoot = process.cwd();
  // Per-scraper cache (local dev)
  if (scraperName) {
    const localCache = path.join(projectRoot, "scripts", scraperName, ".cache", "ms-playwright");
    return localCache;
  }
  // Docker shared path
  return "/app/scraper-browsers";
}

/**
 * Run a utility scraper script and return the output file path.
 */
export async function runScraper(opts: {
  scraperName: string;
  args: string[];
  outputFile: string;
  timeoutMs?: number;
}): Promise<{ success: boolean; error?: string }> {
  const { scraperName, args, outputFile, timeoutMs = 300000 } = opts;
  const projectRoot = process.cwd();
  const scriptPath = path.join(projectRoot, "scripts", scraperName, "main.py");
  const pythonBin = await findPython(scraperName);

  try {
    const { stderr } = await execAsync(
      `${pythonBin} ${scriptPath} ${args.join(" ")}`,
      {
        cwd: path.join(projectRoot, "scripts", scraperName),
        timeout: timeoutMs,
        env: {
          ...process.env,
          PYTHONPATH: path.join(projectRoot, "scripts", scraperName),
          PLAYWRIGHT_BROWSERS_PATH: getPlaywrightBrowsersPath(scraperName),
        },
      }
    );

    if (stderr && !stderr.includes("DevTools")) {
      console.warn(`[${scraperName}] stderr:`, stderr);
    }

    return { success: true };
  } catch (execError: unknown) {
    const error = execError as { code?: number; stderr?: string; message?: string };
    console.error(`[${scraperName}] execution error:`, error);

    const stderr = error.stderr || "";
    if (stderr.includes("playwright install") || stderr.includes("Executable doesn't exist")) {
      return {
        success: false,
        error: `Playwright browsers not installed. Run: playwright install chromium`,
      };
    }

    // Check if output file was created despite the error
    try {
      await fs.access(outputFile);
      return { success: true }; // Output exists, scraper may have had non-fatal warnings
    } catch {
      return {
        success: false,
        error: error.stderr || error.message || "Unknown scraper error",
      };
    }
  }
}

/**
 * Run a scraper asynchronously (fire-and-forget).
 * Spawns the process detached and calls onComplete/onError when done.
 * Returns the child process PID immediately.
 */
export async function runScraperAsync(opts: {
  scraperName: string;
  args: string[];
  outputFile: string;
  onComplete: (outputFile: string) => Promise<void>;
  onError: (error: string) => Promise<void>;
}): Promise<{ pid: number }> {
  const { scraperName, args, outputFile, onComplete, onError } = opts;
  const projectRoot = process.cwd();
  const scriptPath = path.join(projectRoot, "scripts", scraperName, "main.py");
  const pythonBin = await findPython(scraperName);

  const child = spawn(pythonBin, [scriptPath, ...args], {
    cwd: path.join(projectRoot, "scripts", scraperName),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PYTHONPATH: path.join(projectRoot, "scripts", scraperName),
      PLAYWRIGHT_BROWSERS_PATH: getPlaywrightBrowsersPath(scraperName),
    },
  });

  child.unref();

  let stderrOutput = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrOutput += chunk.toString();
  });

  child.on("close", async (code) => {
    try {
      if (code === 0) {
        await onComplete(outputFile);
      } else {
        // Check if output file exists despite error (non-fatal warnings)
        try {
          await fs.access(outputFile);
          await onComplete(outputFile);
        } catch {
          await onError(stderrOutput || `Scraper exited with code ${code}`);
        }
      }
    } catch (err) {
      console.error(`[${scraperName}] async completion handler error:`, err);
    }
  });

  child.on("error", async (err) => {
    try {
      await onError(err.message);
    } catch (e) {
      console.error(`[${scraperName}] async error handler error:`, e);
    }
  });

  return { pid: child.pid! };
}
