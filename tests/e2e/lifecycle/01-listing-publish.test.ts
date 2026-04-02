import { describe, test, expect } from "vitest";
import { state } from "../helpers/state";
import { post, assertOk, assertCreated } from "../helpers/api-client";

describe("Phase 1: Create and Publish Listing", () => {
  test("create a draft listing", async () => {
    const res = await post("/api/listings", {
      propertyId: state.propertyId,
      unitId: state.unitIdA,
      title: "E2E Test — Cozy Room in Durham",
      description:
        "Bright, furnished room in a shared house near downtown Durham. " +
        "Includes utilities, WiFi, and access to common areas. Available immediately.",
      price: 800,
      bedrooms: 1,
      bathrooms: 1,
      platform: "FACEBOOK",
    });

    const data = (await assertCreated(res, "Create listing")) as {
      id: string;
      status: string;
    };

    expect(data.id).toBeTruthy();
    expect(data.status).toBe("DRAFT");
    state.listingId = data.id;
  });

  test("publish listing to Facebook (dry-run)", async () => {
    expect(state.listingId).toBeTruthy();

    const res = await post(`/api/listings/${state.listingId}/publish`, {
      platforms: ["FACEBOOK"],
    });

    const data = (await assertOk(res, "Publish listing")) as {
      status: string;
    };

    // The listing should now be POSTED (even in dry-run mode the status updates)
    expect(data.status).toBe("POSTED");
  });
});
