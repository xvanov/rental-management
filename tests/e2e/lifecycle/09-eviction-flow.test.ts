import { describe, test, expect } from "vitest";
import { prisma } from "@/lib/db";
import { state } from "../helpers/state";
import {
  post,
  get,
  assertOk,
  assertCreated,
  publicPost,
  publicGet,
} from "../helpers/api-client";

// Minimal signature for lease signing
const FAKE_SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("Phase 9: Eviction Flow (separate tenant)", () => {
  // ─── Setup: Create second tenant with lease on Unit B ─────────────

  test("create eviction-path tenant on Unit B", async () => {
    // Needs a real email for lease signing flow
    const testEmail = process.env.TEST_EMAIL || "e2e-eviction@example.com";
    const res = await post("/api/tenants", {
      firstName: "E2E Test",
      lastName: "Tenant-Eviction",
      email: testEmail,
      phone: process.env.TEST_PHONE_NUMBER || undefined,
      unitId: state.unitIdB,
    });

    const data = (await assertCreated(res, "Create eviction tenant")) as {
      id: string;
    };

    expect(data.id).toBeTruthy();
    state.tenantId2 = data.id;
  });

  test("create lease for eviction tenant", async () => {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 2); // Started 2 months ago
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);

    const res = await post("/api/leases", {
      tenantId: state.tenantId2,
      unitId: state.unitIdB,
      content: `ROOM RENTAL AGREEMENT (EVICTION TEST)

TENANT: E2E Test Tenant-Eviction
ROOM: E2E Test Room B
RENT: $800.00 per month, due on the 1st
DEPOSIT: $800.00
GRACE PERIOD: 5 days
LATE FEE: $50.00

E2E test lease for eviction flow testing.`,
      rentAmount: 800,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    const data = (await assertCreated(res, "Create eviction lease")) as {
      id: string;
    };

    expect(data.id).toBeTruthy();
    state.leaseId2 = data.id;
  });

  test("send lease for signing and complete signature", async () => {
    // Send for signing
    const signRes = await post("/api/leases/sign", {
      leaseId: state.leaseId2,
    });

    const signData = (await assertOk(signRes, "Sign eviction lease")) as {
      signingUrl: string;
    };

    const tokenMatch = signData.signingUrl.match(/\/sign\/(.+)$/);
    expect(tokenMatch).toBeTruthy();
    state.signingToken2 = tokenMatch![1];

    // Complete signing
    const completeRes = await publicPost(
      `/api/signing/${state.signingToken2}/complete`,
      {
        signatureDataUrl: FAKE_SIGNATURE,
        fullName: "E2E Test Tenant-Eviction",
        smsConsent: true,
      }
    );

    const completeData = (await assertOk(
      completeRes,
      "Complete eviction lease signing"
    )) as { success: boolean };

    expect(completeData.success).toBe(true);
  });

  test("trigger move-in for eviction tenant", async () => {
    const res = await post("/api/move-in", {
      tenantId: state.tenantId2,
    });

    await assertOk(res, "Move-in eviction tenant");

    // Verify unit occupied
    const unit = await prisma.unit.findUnique({
      where: { id: state.unitIdB },
    });
    expect(unit!.status).toBe("OCCUPIED");
  });

  // ─── Eviction Flow ────────────────────────────────────────────────

  test("create late rent notice", async () => {
    const res = await post("/api/notices", {
      tenantId: state.tenantId2,
      type: "LATE_RENT",
      content: `LATE RENT NOTICE

To: E2E Test Tenant-Eviction
Property: 123 E2E Test Street, Room B

Your rent payment of $800.00 was due on the 1st of the month.
As of today, your rent is past due. Please remit payment immediately to avoid further action.

A late fee of $50.00 has been assessed per the terms of your lease agreement.

Total amount due: $850.00`,
    });

    const data = (await assertCreated(res, "Create late rent notice")) as {
      id: string;
      status: string;
    };

    expect(data.id).toBeTruthy();
    expect(data.status).toBe("DRAFT");
  });

  test("run enforcement engine", async () => {
    const res = await post("/api/enforcement/run");

    const data = (await assertOk(res, "Run enforcement")) as {
      actionsProcessed: number;
      actions: Array<{ type: string; tenantId: string }>;
    };

    expect(data).toBeTruthy();
    // May or may not find actions depending on timing/ledger state
    console.log(
      `Enforcement processed ${data.actionsProcessed} actions:`,
      data.actions?.map((a) => a.type).join(", ") || "none"
    );
  });

  test("create eviction warning notice", async () => {
    const res = await post("/api/notices", {
      tenantId: state.tenantId2,
      type: "EVICTION_WARNING",
      content: `EVICTION WARNING — PAY OR QUIT

To: E2E Test Tenant-Eviction
Property: 123 E2E Test Street, Room B

This notice serves as a formal warning that eviction proceedings will be initiated
if all outstanding rent and fees are not paid within 10 days of this notice.

Outstanding balance: $850.00

Per North Carolina General Statutes Chapter 42, failure to pay within the
specified period may result in summary ejectment proceedings.

This is your final opportunity to cure this breach before legal action is taken.`,
    });

    const data = (await assertCreated(
      res,
      "Create eviction warning"
    )) as {
      id: string;
      type: string;
    };

    expect(data.id).toBeTruthy();
    expect(data.type).toBe("EVICTION_WARNING");
  });

  test("generate court packet PDF", async () => {
    const res = await get(
      `/api/court-packet?tenantId=${state.tenantId2}`
    );

    // Court packet returns a PDF file
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("application/pdf");

    // Verify it has content
    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
    console.log(
      `Court packet generated: ${(buffer.byteLength / 1024).toFixed(1)} KB`
    );
  });

  test("verify all notices exist in database", async () => {
    const notices = await prisma.notice.findMany({
      where: { tenantId: state.tenantId2 },
      orderBy: { createdAt: "asc" },
    });

    expect(notices.length).toBeGreaterThanOrEqual(2);

    const types = notices.map((n) => n.type);
    expect(types).toContain("LATE_RENT");
    expect(types).toContain("EVICTION_WARNING");
  });
});
