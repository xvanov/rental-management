import { describe, test, expect } from "vitest";
import { prisma } from "@/lib/db";
import { state } from "../helpers/state";
import { post, assertCreated } from "../helpers/api-client";

describe("Phase 7: Tenancy — Maintenance & Payments", () => {
  test("create a maintenance request", async () => {
    const res = await post("/api/tasks", {
      title: "E2E Test — Broken faucet in bathroom",
      description:
        "The bathroom faucet is dripping constantly. Started yesterday. " +
        "Water pressure seems fine but the handle is loose.",
      priority: "HIGH",
      propertyId: state.propertyId,
    });

    const data = (await assertCreated(res, "Create maintenance task")) as {
      id: string;
      status: string;
    };

    expect(data.id).toBeTruthy();
    expect(data.status).toBe("PENDING");
    state.taskId = data.id;
  });

  test("record a rent payment", async () => {
    expect(state.tenantId).toBeTruthy();

    const paymentDate = new Date().toISOString().split("T")[0];

    const res = await post("/api/payments", {
      tenantId: state.tenantId,
      amount: 800,
      method: "ZELLE",
      date: paymentDate,
      note: "E2E test — first month rent via Zelle",
    });

    const data = (await assertCreated(res, "Record payment")) as {
      id: string;
    };

    expect(data.id).toBeTruthy();
    state.paymentId = data.id;
  });

  test("verify payment exists in database", async () => {
    const payment = await prisma.payment.findUnique({
      where: { id: state.paymentId },
    });

    expect(payment).toBeTruthy();
    expect(payment!.amount).toBe(800);
    expect(payment!.method).toBe("ZELLE");
    expect(payment!.tenantId).toBe(state.tenantId);
  });

  test("verify maintenance task exists", async () => {
    const task = await prisma.task.findUnique({
      where: { id: state.taskId },
    });

    expect(task).toBeTruthy();
    expect(task!.title).toContain("Broken faucet");
    expect(task!.priority).toBe("HIGH");
  });
});
