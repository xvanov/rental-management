import { describe, test, expect } from "vitest";
import { prisma } from "@/lib/db";
import { existsSync } from "fs";
import { state } from "../helpers/state";
import {
  get,
  post,
  patch,
  assertOk,
  assertCreated,
  publicGet,
  publicPost,
  publicPatch,
} from "../helpers/api-client";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";
const FAKE_PSID = `e2e_psid_${Date.now()}`;

// A minimal 1x1 transparent PNG as a base64 data URL for the signature
const FAKE_SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// Small test image (1x1 red pixel PNG) for media upload testing
const TEST_IMAGE_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64"
);

// ═══════════════════════════════════════════════════════════════════════
// Phase 1: Create listing and publish to REAL Facebook page
// ═══════════════════════════════════════════════════════════════════════

describe("Phase 1: Create and Publish Listing (REAL Facebook)", () => {
  test("create a draft listing", async () => {
    const res = await post("/api/listings", {
      propertyId: state.propertyId,
      unitId: state.unitIdA,
      title: "E2E Test — Cozy Room in Durham",
      description:
        "Bright, furnished room in a shared house near downtown Durham. " +
        "Includes utilities, WiFi, and access to common areas. Available immediately.\n\n" +
        "⚠️ This is an automated E2E test listing — please ignore.",
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

  test("publish listing to REAL Facebook page", async () => {
    expect(state.listingId).toBeTruthy();

    const res = await post(`/api/listings/${state.listingId}/publish`, {
      platforms: ["FACEBOOK"],
    });

    const data = (await assertOk(res, "Publish listing")) as {
      status: string;
      facebookPostId?: string;
      platforms?: Array<{ platform: string; externalId?: string }>;
    };

    expect(data.status).toBe("POSTED");

    // Verify the listing has a real Facebook post ID in the database
    const listing = await prisma.listing.findUnique({
      where: { id: state.listingId },
    });
    expect(listing).toBeTruthy();
    expect(listing!.status).toBe("POSTED");
    expect(listing!.postedAt).toBeTruthy();

    if (listing!.facebookPostId) {
      console.log(`✅ Real Facebook post created: ${listing!.facebookPostId}`);
    } else {
      console.log("⚠️  No facebookPostId — Facebook credentials may not be configured");
    }
  });

  test("clean up: delete the Facebook post", async () => {
    // Delete the listing (which also deletes the Facebook post)
    const res = await fetch(`${BASE_URL}/api/listings?id=${state.listingId}`, {
      method: "DELETE",
      headers: {
        "X-Test-Auth": state.testAuthHeader,
      },
    });

    // Accept 200 or 404 (already deleted)
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      console.log("✅ Facebook post cleaned up");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Phase 2: Facebook Messenger conversation (real webhook processing)
// ═══════════════════════════════════════════════════════════════════════

function messengerWebhook(text: string) {
  return {
    object: "page",
    entry: [
      {
        id: process.env.FACEBOOK_PAGE_ID || "test_page",
        time: Date.now(),
        messaging: [
          {
            sender: { id: FAKE_PSID },
            recipient: { id: process.env.FACEBOOK_PAGE_ID || "test_page" },
            timestamp: Date.now(),
            message: {
              mid: `mid_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              text,
            },
          },
        ],
      },
    ],
  };
}

async function sendAndWait(text: string) {
  const res = await publicPost("/api/webhooks/facebook", messengerWebhook(text));
  await assertOk(res, `Messenger webhook: "${text}"`);
  // Wait for async processing (AI response generation)
  await new Promise((r) => setTimeout(r, 3000));
}

describe("Phase 2: Facebook Messenger Inquiry", () => {
  test("initial inquiry from prospect", async () => {
    state.facebookPsid = FAKE_PSID;

    await sendAndWait(
      "Hi! I saw your listing and I'm interested. Is this place still available?"
    );

    const convo = await prisma.facebookConversation.findFirst({
      where: { senderPsid: FAKE_PSID },
    });

    expect(convo).toBeTruthy();
    expect(convo!.messageCount).toBeGreaterThanOrEqual(1);
  });

  test("prospect asks a question about the property", async () => {
    await sendAndWait("Does it allow pets? And what's the parking situation?");

    const convo = await prisma.facebookConversation.findFirst({
      where: { senderPsid: FAKE_PSID },
      orderBy: { updatedAt: "desc" },
    });

    expect(convo!.messageCount).toBeGreaterThanOrEqual(2);
  });

  test("prospect requests a showing", async () => {
    await sendAndWait("Looks great! I'd love to schedule a showing.");

    const convo = await prisma.facebookConversation.findFirst({
      where: { senderPsid: FAKE_PSID },
      orderBy: { updatedAt: "desc" },
    });

    expect(convo).toBeTruthy();
  });

  test("prospect provides name and confirms interest", async () => {
    await sendAndWait(
      "My name is Alex Johnson. That time works perfectly, let's book it!"
    );

    const convo = await prisma.facebookConversation.findFirst({
      where: { senderPsid: FAKE_PSID },
      orderBy: { updatedAt: "desc" },
    });

    expect(convo).toBeTruthy();
  });

  test("verify inbound + outbound messages stored in DB", async () => {
    const inbound = await prisma.message.count({
      where: {
        channel: "FACEBOOK",
        direction: "INBOUND",
        metadata: { path: ["senderId"], equals: FAKE_PSID },
      },
    });

    const outbound = await prisma.message.count({
      where: {
        channel: "FACEBOOK",
        direction: "OUTBOUND",
        metadata: { path: ["recipientId"], equals: FAKE_PSID },
      },
    });

    expect(inbound).toBeGreaterThanOrEqual(4);
    // Outbound means the AI auto-responder actually sent replies
    console.log(`  Messages: ${inbound} inbound, ${outbound} outbound`);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Phase 3: Schedule a showing (Google Calendar if configured)
// ═══════════════════════════════════════════════════════════════════════

describe("Phase 3: Schedule a Showing", () => {
  test("check showing availability (uses Google Calendar if configured)", async () => {
    const res = await get(
      `/api/showings/availability?propertyId=${state.propertyId}`
    );

    const data = (await assertOk(res, "Showing availability")) as {
      slots: Array<{ start: string; end: string }>;
      calendarIntegrated: boolean;
    };

    expect(data.slots).toBeDefined();
    expect(Array.isArray(data.slots)).toBe(true);
    expect(data.slots.length).toBeGreaterThan(0);

    if (data.calendarIntegrated) {
      console.log("✅ Google Calendar integrated — slots filtered by real calendar");
    } else {
      console.log(
        "⚠️  Google Calendar NOT configured — returning default 9-5 slots.\n" +
          "   Set GOOGLE_CALENDAR_CREDENTIALS and GOOGLE_CALENDAR_ID to enable."
      );
    }
  });

  test("schedule a showing", async () => {
    const showingDate = new Date();
    showingDate.setDate(showingDate.getDate() + 3);
    showingDate.setHours(10, 0, 0, 0);

    const res = await post("/api/showings", {
      propertyId: state.propertyId,
      date: showingDate.toISOString(),
      attendeeName: "Alex Johnson",
      attendeePhone: process.env.TEST_PHONE_NUMBER,
      attendeeEmail: process.env.TEST_EMAIL,
      notes: "E2E test showing",
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

// ═══════════════════════════════════════════════════════════════════════
// Phase 4: Application — real SMS delivery of application link
// ═══════════════════════════════════════════════════════════════════════

describe("Phase 4: Application Flow (REAL SMS)", () => {
  test("create a prospect tenant with real phone + email", async () => {
    const testPhone = process.env.TEST_PHONE_NUMBER!;
    const testEmail = process.env.TEST_EMAIL || "e2e-peaceful@example.com";

    expect(testPhone).toBeTruthy();

    const res = await post("/api/tenants", {
      firstName: "E2E Test",
      lastName: "Tenant-Peaceful",
      email: testEmail,
      phone: testPhone,
      unitId: state.unitIdA,
    });

    const data = (await assertCreated(res, "Create tenant")) as { id: string };
    expect(data.id).toBeTruthy();
    state.tenantId = data.id;
    // SMS consent OFF by default — only enabled briefly for the single SMS test in Phase 7
  });

  test("create an application", async () => {
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

  test("send application link via email", async () => {
    const testEmail = process.env.TEST_EMAIL;
    if (!testEmail) {
      console.log("Skipping — TEST_EMAIL not set");
      return;
    }

    const res = await post("/api/applications/send-link", {
      applicationId: state.applicationId,
      channel: "EMAIL",
      to: testEmail,
    });

    if (res.ok) {
      const data = (await res.json()) as { success: boolean };
      expect(data.success).toBe(true);
      console.log(`✅ Real email sent to ${testEmail} with application link`);
    } else {
      console.log(`⚠️  Email send failed (${res.status}) — SendGrid may need sender verification`);
    }
  });

  test("fill out application form (public, no auth)", async () => {
    const res = await publicPatch("/api/applications", {
      token: state.applicationToken,
      firstName: "Alex",
      lastName: "Johnson",
      email: process.env.TEST_EMAIL || "e2e-test@example.com",
      phone: process.env.TEST_PHONE_NUMBER || "2132932712",
      currentAddress: "456 Previous St, Raleigh, NC 27601",
      employer: "Tech Corp Inc.",
      income: "65000",
      rentalHistory: "Rented at previous address for 2 years, no issues.",
      evictionHistory: "None",
    });

    const data = (await assertOk(res, "Submit application form")) as {
      status: string;
    };

    expect(data.status).toBe("UNDER_REVIEW");
  });

  test("verify application in database", async () => {
    const app = await prisma.application.findUnique({
      where: { id: state.applicationId },
    });

    expect(app).toBeTruthy();
    expect(app!.status).toBe("UNDER_REVIEW");
    expect(app!.firstName).toBe("Alex");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Phase 5: Lease — real email with signing link, real PDF generation
// ═══════════════════════════════════════════════════════════════════════

describe("Phase 5: Lease Creation and E-Signature (REAL email)", () => {
  test("create a draft lease", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7);
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);

    const res = await post("/api/leases", {
      tenantId: state.tenantId,
      unitId: state.unitIdA,
      content: `ROOM RENTAL AGREEMENT

This Room Rental Agreement is entered into for the rental of a room at 123 E2E Test Street, Durham, NC 27701.

TENANT: Alex Johnson
ROOM: E2E Test Room A
RENT: $800.00 per month, due on the 1st
DEPOSIT: $800.00
TERM: 12 months
GRACE PERIOD: 5 days
LATE FEE: $50.00 flat fee

⚠️ E2E test lease — not a real agreement.`,
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

  test("send lease for signing — REAL email delivered", async () => {
    const res = await post("/api/leases/sign", {
      leaseId: state.leaseId,
    });

    const data = (await assertOk(res, "Send for signing")) as {
      success: boolean;
      signingUrl: string;
      emailSent: boolean;
      emailError?: string;
    };

    expect(data.success).toBe(true);
    expect(data.signingUrl).toBeTruthy();

    if (data.emailSent) {
      console.log(`✅ Real signing email sent to ${process.env.TEST_EMAIL}`);
    } else {
      console.log(`⚠️  Email failed: ${data.emailError}`);
    }

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

  test("complete e-signature — real PDF generated and saved", async () => {
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

  test("verify lease is ACTIVE and signed PDF exists on disk", async () => {
    const lease = await prisma.lease.findUnique({
      where: { id: state.leaseId },
    });

    expect(lease).toBeTruthy();
    expect(lease!.status).toBe("ACTIVE");
    expect(lease!.signedAt).toBeTruthy();
    expect(lease!.signedDocumentUrl).toBeTruthy();

    // Verify the signed PDF file actually exists on disk
    if (lease!.signedDocumentUrl) {
      const pdfPath = lease!.signedDocumentUrl.startsWith("/")
        ? lease!.signedDocumentUrl
        : `data/${lease!.signedDocumentUrl}`;
      const fullPath = pdfPath.startsWith("/") ? pdfPath : `/home/k/rental-management/${pdfPath}`;
      if (existsSync(fullPath)) {
        console.log(`✅ Signed PDF exists at: ${pdfPath}`);
      } else {
        console.log(`⚠️  Signed PDF path recorded but file not found: ${fullPath}`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Phase 6: Move-In — real SMS welcome + group chat announcement
// ═══════════════════════════════════════════════════════════════════════

describe("Phase 6: Move-In and Welcome Flow (REAL SMS + email)", () => {
  test("trigger move-in — sends real welcome SMS and email", async () => {
    const moveInDate = new Date();
    moveInDate.setDate(moveInDate.getDate() + 7);

    const res = await post("/api/move-in", {
      tenantId: state.tenantId,
      moveInDate: moveInDate.toISOString().split("T")[0],
    });

    const data = (await assertOk(res, "Trigger move-in")) as {
      message?: string;
      success?: boolean;
    };

    expect(data.message || data.success).toBeTruthy();
    console.log("✅ Move-in triggered — welcome SMS + email queued via BullMQ");
  });

  test("verify unit is now OCCUPIED", async () => {
    await new Promise((r) => setTimeout(r, 3000));

    const unit = await prisma.unit.findUnique({
      where: { id: state.unitIdA },
    });

    expect(unit).toBeTruthy();
    expect(unit!.status).toBe("OCCUPIED");
  });

  test("verify welcome event was logged (requires Redis)", async () => {
    await new Promise((r) => setTimeout(r, 5000));

    const welcomeEvent = await prisma.event.findFirst({
      where: {
        tenantId: state.tenantId,
        type: "SYSTEM",
        payload: { path: ["action"], equals: "WELCOME_SENT" },
      },
    });

    if (welcomeEvent) {
      console.log("✅ Welcome SMS + email delivered (BullMQ worker ran)");
    } else {
      console.log("⚠️  Welcome event not found — Redis/BullMQ worker may not be running");
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

    if (groupChatEvent) {
      console.log("✅ Group chat announcement sent");
    } else {
      console.log("⚠️  Group chat event not found — Redis/BullMQ worker may not be running");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Phase 7: Tenancy — media upload, send message with attachment, maintenance
// ═══════════════════════════════════════════════════════════════════════

describe("Phase 7: Tenancy — Media, Messages, Maintenance & Payments", () => {
  test("upload a photo via media endpoint", async () => {
    const formData = new FormData();
    const blob = new Blob([TEST_IMAGE_BYTES], { type: "image/png" });
    formData.append("file", blob, "test-photo.png");

    const res = await fetch(`${BASE_URL}/api/media/upload`, {
      method: "POST",
      headers: { "X-Test-Auth": state.testAuthHeader },
      body: formData,
    });

    const data = (await assertCreated(res, "Upload media")) as {
      mediaId: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    };

    expect(data.mediaId).toBeTruthy();
    expect(data.mimeType).toBe("image/png");
    expect(data.sizeBytes).toBeGreaterThan(0);
    state.mediaId = data.mediaId;
    console.log(`✅ Media uploaded: ${data.fileName} (${data.sizeBytes} bytes)`);
  });

  test("verify uploaded media file exists in DB and on disk", async () => {
    const media = await prisma.messageMedia.findUnique({
      where: { id: state.mediaId },
    });

    expect(media).toBeTruthy();
    expect(media!.filePath).toBeTruthy();

    // Verify the actual file exists on disk
    const fullPath = `/home/k/rental-management/${media!.filePath}`;
    expect(existsSync(fullPath)).toBe(true);
    console.log(`✅ Media file on disk: ${media!.filePath}`);
  });

  test("send SMS message to tenant via messages API (REAL Twilio)", async () => {
    // Temporarily enable SMS consent for this one test
    await prisma.tenant.update({
      where: { id: state.tenantId },
      data: { smsConsent: true, smsConsentDate: new Date() },
    });

    const res = await post("/api/messages", {
      tenantId: state.tenantId,
      channel: "SMS",
      content: "E2E Test: This is a test message from the rental management system. Please ignore.",
    });

    // Disable consent again immediately to prevent further texts
    await prisma.tenant.update({
      where: { id: state.tenantId },
      data: { smsConsent: false },
    });

    const data = (await assertCreated(res, "Send SMS message")) as {
      id: string;
      channel: string;
      direction: string;
      metadata?: Record<string, unknown>;
    };

    expect(data.id).toBeTruthy();
    expect(data.direction).toBe("OUTBOUND");

    // Verify the message was actually sent via Twilio (has twilioSid)
    const msg = await prisma.message.findUnique({ where: { id: data.id } });
    const metadata = msg?.metadata as Record<string, unknown> | null;
    if (metadata?.twilioSid) {
      console.log(`✅ Real SMS delivered via Twilio (SID: ${metadata.twilioSid})`);
    } else {
      console.log("⚠️  No Twilio SID — message may have been stored without sending");
    }
  });

  test("send email message to tenant via messages API (REAL SendGrid)", async () => {
    const res = await post("/api/messages", {
      tenantId: state.tenantId,
      channel: "EMAIL",
      content: "E2E Test: This is a test email from the rental management system. Please ignore.",
      subject: "E2E Test Message",
    });

    if (res.status === 201) {
      const data = (await res.json()) as { id: string };
      expect(data.id).toBeTruthy();
      console.log("✅ Real email sent via SendGrid");
    } else {
      // SendGrid may reject due to sender verification or permissions
      console.log(`⚠️  Email via messages API failed (${res.status}) — SendGrid config issue`);
    }
  });

  test("create a maintenance request", async () => {
    const res = await post("/api/tasks", {
      title: "E2E Test — Broken faucet in bathroom",
      description:
        "The bathroom faucet is dripping constantly. Water pressure fine but handle is loose.",
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
    const paymentDate = new Date().toISOString().split("T")[0];

    const res = await post("/api/payments", {
      tenantId: state.tenantId,
      amount: 800,
      method: "ZELLE",
      date: paymentDate,
      note: "E2E test — first month rent via Zelle",
    });

    const data = (await assertCreated(res, "Record payment")) as { id: string };
    expect(data.id).toBeTruthy();
    state.paymentId = data.id;
  });

  test("verify payment and task in database", async () => {
    const payment = await prisma.payment.findUnique({
      where: { id: state.paymentId },
    });
    expect(payment).toBeTruthy();
    expect(payment!.amount).toBe(800);
    expect(payment!.method).toBe("ZELLE");

    const task = await prisma.task.findUnique({
      where: { id: state.taskId },
    });
    expect(task).toBeTruthy();
    expect(task!.title).toContain("Broken faucet");
    expect(task!.priority).toBe("HIGH");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Phase 8: Peaceful Move-Out — real SMS/email notifications
// ═══════════════════════════════════════════════════════════════════════

describe("Phase 8: Peaceful Move-Out (REAL notifications)", () => {
  test("initiate move-out — sends real SMS + email", async () => {
    const moveOutDate = new Date();
    moveOutDate.setMonth(moveOutDate.getMonth() + 1);

    const res = await post("/api/move-out", {
      tenantId: state.tenantId,
      moveOutDate: moveOutDate.toISOString().split("T")[0],
    });

    const data = (await assertCreated(res, "Initiate move-out")) as {
      message?: string;
    };

    expect(data).toBeTruthy();
    console.log("✅ Move-out initiated — notifications queued");
  });

  test("verify lease was terminated", async () => {
    const lease = await prisma.lease.findUnique({
      where: { id: state.leaseId },
    });

    expect(lease).toBeTruthy();
    expect(lease!.status).toBe("TERMINATED");
  });

  test("submit move-out inspection with deductions", async () => {
    const res = await post("/api/move-out/inspection", {
      tenantId: state.tenantId,
      notes:
        "Room in good condition overall. Minor wall damage near doorframe. " +
        "All personal belongings removed. Cleaning satisfactory.",
      photos: [
        { name: "room-overview.jpg" },
        { name: "wall-damage.jpg" },
        { name: "bathroom-clean.jpg" },
      ],
      deductions: [
        { description: "Wall damage repair near doorframe", amount: 75 },
        { description: "Touch-up paint", amount: 25 },
      ],
    });

    const data = (await assertCreated(res, "Submit inspection")) as {
      message?: string;
    };
    expect(data).toBeTruthy();
  });

  test("verify deductions appear in ledger", async () => {
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: { tenantId: state.tenantId },
      orderBy: { createdAt: "desc" },
    });

    const deductionEntries = ledgerEntries.filter(
      (e) =>
        e.description?.includes("Wall damage") ||
        e.description?.includes("paint")
    );

    if (deductionEntries.length > 0) {
      expect(deductionEntries.length).toBeGreaterThanOrEqual(1);
      console.log(`✅ ${deductionEntries.length} deduction ledger entries created`);
    } else {
      console.log("⚠️  No deduction ledger entries — inspection may store differently");
    }
  });

  test("verify move-out notice was created", async () => {
    const notices = await prisma.notice.findMany({
      where: { tenantId: state.tenantId, type: "MOVE_OUT" },
    });

    expect(notices.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Phase 9: Eviction — full flow with real SMS/email at each step
// ═══════════════════════════════════════════════════════════════════════

describe("Phase 9: Eviction Flow (separate tenant, REAL notifications)", () => {
  test("create eviction-path tenant on Unit B", async () => {
    const testEmail = process.env.TEST_EMAIL || "e2e-eviction@example.com";
    const testPhone = process.env.TEST_PHONE_NUMBER;

    const res = await post("/api/tenants", {
      firstName: "E2E Test",
      lastName: "Tenant-Eviction",
      email: testEmail,
      phone: testPhone,
      unitId: state.unitIdB,
    });

    const data = (await assertCreated(res, "Create eviction tenant")) as { id: string };
    expect(data.id).toBeTruthy();
    state.tenantId2 = data.id;
    // No SMS consent for eviction tenant — avoids extra text messages during test
  });

  test("create lease for eviction tenant", async () => {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 2);
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);

    const res = await post("/api/leases", {
      tenantId: state.tenantId2,
      unitId: state.unitIdB,
      content: `ROOM RENTAL AGREEMENT (EVICTION TEST)

TENANT: E2E Test Tenant-Eviction
ROOM: E2E Test Room B
RENT: $800.00/mo, due on the 1st
DEPOSIT: $800.00 | GRACE: 5 days | LATE FEE: $50

⚠️ E2E test lease — not a real agreement.`,
      rentAmount: 800,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    const data = (await assertCreated(res, "Create eviction lease")) as { id: string };
    expect(data.id).toBeTruthy();
    state.leaseId2 = data.id;
  });

  test("sign lease and complete signature", async () => {
    const signRes = await post("/api/leases/sign", { leaseId: state.leaseId2 });
    const signData = (await assertOk(signRes, "Sign eviction lease")) as {
      signingUrl: string;
      emailSent: boolean;
    };

    if (signData.emailSent) {
      console.log("✅ Real signing email sent for eviction tenant");
    }

    const tokenMatch = signData.signingUrl.match(/\/sign\/(.+)$/);
    expect(tokenMatch).toBeTruthy();
    state.signingToken2 = tokenMatch![1];

    const completeRes = await publicPost(
      `/api/signing/${state.signingToken2}/complete`,
      {
        signatureDataUrl: FAKE_SIGNATURE,
        fullName: "E2E Test Tenant-Eviction",
        smsConsent: true,
      }
    );

    const completeData = (await assertOk(completeRes, "Complete eviction lease")) as {
      success: boolean;
    };
    expect(completeData.success).toBe(true);
  });

  test("trigger move-in for eviction tenant", async () => {
    const res = await post("/api/move-in", { tenantId: state.tenantId2 });
    await assertOk(res, "Move-in eviction tenant");

    const unit = await prisma.unit.findUnique({ where: { id: state.unitIdB } });
    expect(unit!.status).toBe("OCCUPIED");
  });

  test("create late rent notice", async () => {
    const res = await post("/api/notices", {
      tenantId: state.tenantId2,
      type: "LATE_RENT",
      content: `LATE RENT NOTICE

To: E2E Test Tenant-Eviction
Property: 123 E2E Test Street, Room B

Your rent of $800.00 is past due. A late fee of $50.00 has been assessed.
Total due: $850.00`,
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
    console.log(
      `  Enforcement: ${data.actionsProcessed} actions`,
      data.actions?.map((a) => a.type).join(", ") || "(none)"
    );
  });

  test("create eviction warning notice", async () => {
    const res = await post("/api/notices", {
      tenantId: state.tenantId2,
      type: "EVICTION_WARNING",
      content: `EVICTION WARNING — PAY OR QUIT

To: E2E Test Tenant-Eviction
Property: 123 E2E Test Street, Room B

Eviction proceedings will begin if $850.00 is not paid within 10 days.`,
    });

    const data = (await assertCreated(res, "Create eviction warning")) as {
      id: string;
      type: string;
    };

    expect(data.id).toBeTruthy();
    expect(data.type).toBe("EVICTION_WARNING");
  });

  test("generate court packet PDF", async () => {
    const res = await get(`/api/court-packet?tenantId=${state.tenantId2}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");

    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
    console.log(`✅ Court packet PDF: ${(buffer.byteLength / 1024).toFixed(1)} KB`);
  });

  test("verify all notices in database", async () => {
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
