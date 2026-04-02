import { describe, test, expect } from "vitest";
import { prisma } from "@/lib/db";
import { state } from "../helpers/state";
import { post, assertOk, assertCreated, publicPatch } from "../helpers/api-client";

describe("Phase 4: Application Flow", () => {
  test("create a prospect tenant", async () => {
    const testPhone = process.env.TEST_PHONE_NUMBER;
    const testEmail = process.env.TEST_EMAIL;

    const res = await post("/api/tenants", {
      firstName: "E2E Test",
      lastName: "Tenant-Peaceful",
      email: testEmail,
      phone: testPhone,
      unitId: state.unitIdA,
    });

    const data = (await assertCreated(res, "Create tenant")) as {
      id: string;
    };

    expect(data.id).toBeTruthy();
    state.tenantId = data.id;
  });

  test("create an application", async () => {
    expect(state.tenantId).toBeTruthy();

    const res = await post("/api/applications", {
      tenantId: state.tenantId,
      propertyId: state.propertyId,
    });

    const data = (await assertCreated(res, "Create application")) as {
      id: string;
      token: string;
    };

    expect(data.id).toBeTruthy();
    expect(data.token).toBeTruthy();
    state.applicationId = data.id;
    state.applicationToken = data.token;
  });

  test("send application link via SMS (real message)", async () => {
    const testPhone = process.env.TEST_PHONE_NUMBER;
    if (!testPhone) {
      console.log("Skipping SMS send — TEST_PHONE_NUMBER not set");
      return;
    }

    expect(state.applicationId).toBeTruthy();

    const res = await post("/api/applications/send-link", {
      applicationId: state.applicationId,
      channel: "SMS",
      to: testPhone,
    });

    const data = (await assertOk(res, "Send application link")) as {
      success: boolean;
    };

    expect(data.success).toBe(true);
  });

  test("fill out application form (public, no auth)", async () => {
    expect(state.applicationToken).toBeTruthy();

    const res = await publicPatch("/api/applications", {
      token: state.applicationToken,
      firstName: "Alex",
      lastName: "Johnson",
      email: process.env.TEST_EMAIL || "e2e-test@example.com",
      phone: process.env.TEST_PHONE_NUMBER || "9195551234",
      currentAddress: "456 Previous St, Raleigh, NC 27601",
      employer: "Tech Corp Inc.",
      income: "65000",
      rentalHistory: "Rented at previous address for 2 years, no issues.",
      evictionHistory: "None",
    });

    const data = (await assertOk(res, "Submit application form")) as {
      status: string;
    };

    // Status should transition to UNDER_REVIEW after form submission
    expect(data.status).toBe("UNDER_REVIEW");
  });

  test("verify application in database", async () => {
    const app = await prisma.application.findUnique({
      where: { id: state.applicationId },
    });

    expect(app).toBeTruthy();
    expect(app!.status).toBe("UNDER_REVIEW");
    expect(app!.firstName).toBe("Alex");
    expect(app!.lastName).toBe("Johnson");
  });
});
