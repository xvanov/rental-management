import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

/**
 * Shared mutable state passed between sequential test phases.
 * Reads from and writes to a JSON file on every access, because
 * each test file runs in its own worker process.
 */

const STATE_FILE = path.join(__dirname, "..", ".e2e-state.json");

interface E2EState {
  testAuthHeader: string;
  organizationId: string;
  originalOrgId: string;
  userId: string;
  propertyId: string;
  unitIdA: string;
  unitIdB: string;
  listingId: string;
  facebookPsid: string;
  showingId: string;
  tenantId: string;
  applicationId: string;
  applicationToken: string;
  leaseId: string;
  signingToken: string;
  taskId: string;
  paymentId: string;
  mediaId: string;
  tenantId2: string;
  leaseId2: string;
  signingToken2: string;
}

function readState(): Partial<E2EState> {
  try {
    if (!existsSync(STATE_FILE)) return {};
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeState(data: Partial<E2EState>): void {
  writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

/**
 * Proxy that reads from disk on every get and writes on every set.
 * This ensures state is shared across worker processes.
 */
export const state: E2EState = new Proxy({} as E2EState, {
  get(_target, prop: string) {
    const data = readState();
    return (data as Record<string, unknown>)[prop] ?? "";
  },
  set(_target, prop: string, value: unknown) {
    const data = readState();
    (data as Record<string, unknown>)[prop] = value;
    writeState(data);
    return true;
  },
});
