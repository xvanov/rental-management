import { describe, test, expect } from "vitest";
import { state } from "../helpers/state";
import { get, post, assertOk, assertCreated } from "../helpers/api-client";

describe("Phase 3: Schedule a Showing", () => {
  test("check showing availability", async () => {
    const res = await get(
      `/api/showings/availability?propertyId=${state.propertyId}`
    );

    const data = (await assertOk(res, "Showing availability")) as {
      slots: Array<{ start: string; end: string }>;
      calendarIntegrated: boolean;
    };

    expect(data.slots).toBeDefined();
    expect(Array.isArray(data.slots)).toBe(true);
    // Should have at least some available slots
    expect(data.slots.length).toBeGreaterThan(0);
  });

  test("schedule a showing", async () => {
    // Use a date 3 days from now at 10:00 AM
    const showingDate = new Date();
    showingDate.setDate(showingDate.getDate() + 3);
    showingDate.setHours(10, 0, 0, 0);

    const res = await post("/api/showings", {
      propertyId: state.propertyId,
      date: showingDate.toISOString(),
      attendeeName: "Alex Johnson",
      attendeePhone: process.env.TEST_PHONE_NUMBER || undefined,
      attendeeEmail: process.env.TEST_EMAIL || undefined,
      notes: "E2E test showing — prospect from Facebook inquiry",
    });

    const data = (await assertCreated(res, "Create showing")) as {
      id: string;
      status: string;
    };

    expect(data.id).toBeTruthy();
    expect(data.status).toBe("SCHEDULED");
    state.showingId = data.id;
  });
});
