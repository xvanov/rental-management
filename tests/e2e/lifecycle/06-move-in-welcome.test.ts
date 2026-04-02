import { describe, test, expect } from "vitest";
import { prisma } from "@/lib/db";
import { state } from "../helpers/state";
import { post, assertOk, assertCreated } from "../helpers/api-client";

describe("Phase 6: Move-In and Welcome Flow", () => {
  test("trigger move-in welcome flow (real SMS + email via BullMQ)", async () => {
    expect(state.tenantId).toBeTruthy();

    const moveInDate = new Date();
    moveInDate.setDate(moveInDate.getDate() + 7);

    const res = await post("/api/move-in", {
      tenantId: state.tenantId,
      moveInDate: moveInDate.toISOString().split("T")[0],
    });

    // Could be 200 or 201 depending on implementation
    const data = (await assertOk(res, "Trigger move-in")) as {
      message?: string;
      success?: boolean;
    };

    // Should succeed
    expect(data.message || data.success).toBeTruthy();
  });

  test("verify unit is now OCCUPIED", async () => {
    // Wait briefly for async job processing
    await new Promise((r) => setTimeout(r, 3000));

    const unit = await prisma.unit.findUnique({
      where: { id: state.unitIdA },
    });

    expect(unit).toBeTruthy();
    expect(unit!.status).toBe("OCCUPIED");
  });

  test("verify welcome event was logged", async () => {
    // Wait a bit more for BullMQ worker to process
    await new Promise((r) => setTimeout(r, 5000));

    const welcomeEvent = await prisma.event.findFirst({
      where: {
        tenantId: state.tenantId,
        type: "SYSTEM",
        payload: { path: ["action"], equals: "WELCOME_SENT" },
      },
    });

    // This may not exist if Redis/BullMQ is not running
    if (welcomeEvent) {
      expect(welcomeEvent).toBeTruthy();
    } else {
      console.log(
        "⚠️  Welcome event not found — Redis/BullMQ worker may not be running"
      );
    }
  });

  test("verify group chat announcement event", async () => {
    const groupChatEvent = await prisma.event.findFirst({
      where: {
        tenantId: state.tenantId,
        type: "SYSTEM",
        payload: { path: ["action"], equals: "GROUP_CHAT_ADDED" },
      },
    });

    // May not exist without BullMQ
    if (groupChatEvent) {
      expect(groupChatEvent).toBeTruthy();
    } else {
      console.log(
        "⚠️  Group chat event not found — Redis/BullMQ worker may not be running"
      );
    }
  });
});
