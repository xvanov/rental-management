import { describe, test, expect } from "vitest";
import { prisma } from "@/lib/db";
import { state } from "../helpers/state";
import { post, assertOk, assertCreated, publicGet, publicPost } from "../helpers/api-client";

// A minimal 1x1 transparent PNG as a base64 data URL for the signature
const FAKE_SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("Phase 5: Lease Creation and E-Signature", () => {
  test("create a draft lease", async () => {
    expect(state.tenantId).toBeTruthy();
    expect(state.unitIdA).toBeTruthy();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7); // Start 1 week from now
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1); // 1-year lease

    const res = await post("/api/leases", {
      tenantId: state.tenantId,
      unitId: state.unitIdA,
      content: `ROOM RENTAL AGREEMENT

This Room Rental Agreement ("Agreement") is entered into for the rental of a room at 123 E2E Test Street, Durham, NC 27701.

TENANT: Alex Johnson
ROOM: E2E Test Room A
RENT: $800.00 per month, due on the 1st
DEPOSIT: $800.00
TERM: 12 months from move-in date
GRACE PERIOD: 5 days
LATE FEE: $50.00 flat fee

The tenant agrees to abide by all house rules and maintain the room in good condition.

This is an E2E test lease for automated testing purposes.`,
      rentAmount: 800,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    const data = (await assertCreated(res, "Create lease")) as {
      id: string;
      status: string;
    };

    expect(data.id).toBeTruthy();
    expect(data.status).toBe("DRAFT");
    state.leaseId = data.id;
  });

  test("send lease for signing (real email)", async () => {
    expect(state.leaseId).toBeTruthy();

    const res = await post("/api/leases/sign", {
      leaseId: state.leaseId,
    });

    const data = (await assertOk(res, "Send for signing")) as {
      success: boolean;
      signingUrl: string;
      emailSent: boolean;
    };

    expect(data.success).toBe(true);
    expect(data.signingUrl).toBeTruthy();

    // Extract the signing token from the URL
    const tokenMatch = data.signingUrl.match(/\/sign\/(.+)$/);
    expect(tokenMatch).toBeTruthy();
    state.signingToken = tokenMatch![1];
  });

  test("verify signing page is accessible (public)", async () => {
    expect(state.signingToken).toBeTruthy();

    const res = await publicGet(`/api/signing/${state.signingToken}`);
    const data = (await assertOk(res, "Get signing page")) as {
      signerName: string;
      leaseContent: string;
    };

    expect(data.signerName).toBeTruthy();
    expect(data.leaseContent).toContain("ROOM RENTAL AGREEMENT");
  });

  test("complete e-signature (public, no auth)", async () => {
    expect(state.signingToken).toBeTruthy();

    const res = await publicPost(
      `/api/signing/${state.signingToken}/complete`,
      {
        signatureDataUrl: FAKE_SIGNATURE,
        fullName: "Alex Johnson",
        smsConsent: true,
      }
    );

    const data = (await assertOk(res, "Complete signing")) as {
      success: boolean;
      leaseId: string;
    };

    expect(data.success).toBe(true);
    expect(data.leaseId).toBe(state.leaseId);
  });

  test("verify lease is now ACTIVE in database", async () => {
    const lease = await prisma.lease.findUnique({
      where: { id: state.leaseId },
    });

    expect(lease).toBeTruthy();
    expect(lease!.status).toBe("ACTIVE");
    expect(lease!.signedAt).toBeTruthy();
  });
});
