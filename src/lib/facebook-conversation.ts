import { prisma } from "@/lib/db";
import { ConversationStage } from "@/generated/prisma/client";
import { getLanguageModel, isAIConfigured } from "@/lib/ai";
import { generateObject } from "ai";
import { z } from "zod";
import {
  getAvailableSlotsForOrg,
  getCalendarProvider,
} from "@/lib/calendar/provider";
import { createEvent } from "@/lib/events";
import { getQueue } from "@/lib/jobs";

// ─── Types ───────────────────────────────────────────────────────────────────

const ConversationActionSchema = z.object({
  responseText: z.string().describe("The message to send back to the prospect"),
  nextStage: z.enum([
    "INITIAL_INQUIRY",
    "ANSWERING_QUESTIONS",
    "PROPOSING_TIMES",
    "AWAITING_SELECTION",
    "CONFIRMING_BOOKING",
    "SHOWING_BOOKED",
    "DECLINED",
    "STALE",
  ]).describe("The next conversation stage"),
  extractedName: z.string().optional().describe("Prospect's name if mentioned"),
  extractedPhone: z.string().optional().describe("Prospect's phone if mentioned"),
  extractedEmail: z.string().optional().describe("Prospect's email if mentioned"),
  selectedSlotIndex: z.number().optional().describe("0-based index of the selected time slot"),
  wantsToSchedule: z.boolean().optional().describe("Whether the prospect wants to schedule a showing"),
  declined: z.boolean().optional().describe("Whether the prospect declined or is not interested"),
  requestsHuman: z.boolean().optional().describe(
    "True if the prospect explicitly asked to speak with a human/real person/agent/manager, or if the message requires human judgment the AI cannot handle. When true, the bot will hand off and stop replying."
  ),
});

type ConversationAction = z.infer<typeof ConversationActionSchema>;

// ─── Main Handler ────────────────────────────────────────────────────────────

/**
 * Handle an incoming Messenger message within the conversation state machine.
 * Finds or creates a conversation, runs AI, executes actions, returns response text.
 */
export async function handleConversationMessage(
  senderPsid: string,
  incomingText: string,
  _messageId: string
): Promise<string> {
  // Defense-in-depth: if any conversation for this sender is in human-takeover,
  // stay silent. (The webhook route also checks this upstream.)
  const takeoverCheck = await prisma.facebookConversation.findFirst({
    where: { senderPsid, humanTakeover: true },
    select: { id: true },
  });
  if (takeoverCheck) {
    return "";
  }

  // Check if this sender already has an active conversation
  const existingConversation = await prisma.facebookConversation.findFirst({
    where: {
      senderPsid,
      stage: { notIn: ["STALE", "DECLINED"] },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  // Find the listing: prefer the one linked to existing conversation, else most recent POSTED
  const activeListing = await prisma.listing.findFirst({
    where: existingConversation?.listingId
      ? { id: existingConversation.listingId }
      : { status: "POSTED", facebookPostId: { not: null } },
    orderBy: { postedAt: "desc" },
    include: {
      property: {
        select: {
          id: true, address: true, city: true, state: true, zip: true,
          organizationId: true,
          profile: true,
        },
      },
    },
  });

  if (!activeListing) {
    return "Thanks for your interest! We don't have any active listings right now, but check back soon.";
  }

  // Find or create conversation for this sender + property
  let conversation = await prisma.facebookConversation.findUnique({
    where: {
      senderPsid_propertyId: {
        senderPsid,
        propertyId: activeListing.propertyId,
      },
    },
  });

  if (!conversation) {
    conversation = await prisma.facebookConversation.create({
      data: {
        senderPsid,
        propertyId: activeListing.propertyId,
        listingId: activeListing.id,
        stage: "INITIAL_INQUIRY",
      },
    });
  }

  // If conversation is in a terminal state, don't continue
  if (conversation.stage === "SHOWING_BOOKED") {
    return "Your showing is already booked! We'll see you then. If you need to reschedule, just let us know.";
  }
  if (conversation.stage === "DECLINED") {
    return "Thanks for your time! If you change your mind, feel free to message us again.";
  }

  // Fetch recent messages for context
  const recentMessages = await prisma.message.findMany({
    where: {
      channel: "FACEBOOK",
      metadata: { path: ["senderId"], equals: senderPsid },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Also get outbound messages to this sender
  const outboundMessages = await prisma.message.findMany({
    where: {
      channel: "FACEBOOK",
      direction: "OUTBOUND",
      metadata: { path: ["recipientId"], equals: senderPsid },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Merge and sort chronologically
  const allMessages = [...recentMessages, ...outboundMessages]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(-20);

  const conversationHistory = allMessages.map((m) => ({
    role: m.direction === "INBOUND" ? "prospect" : "agent",
    content: m.content,
  }));

  // Get available slots if we're at or approaching the scheduling stage
  let availableSlots: { start: Date; end: Date }[] = [];
  let slotsText = "";
  const schedulingStages: ConversationStage[] = [
    "PROPOSING_TIMES",
    "AWAITING_SELECTION",
    "CONFIRMING_BOOKING",
    "ANSWERING_QUESTIONS",
    "INITIAL_INQUIRY",
  ];

  if (schedulingStages.includes(conversation.stage)) {
    const now = new Date();
    const fiveDaysOut = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    availableSlots = await getAvailableSlotsForOrg(
      activeListing.property.organizationId,
      now,
      fiveDaysOut
    );

    // Pick up to 5 well-distributed slots
    const selectedSlots = selectDistributedSlots(availableSlots, 5);
    availableSlots = selectedSlots;

    if (selectedSlots.length > 0) {
      slotsText = selectedSlots
        .map((s, i) => `${i + 1}. ${formatSlot(s.start, s.end)}`)
        .join("\n");
    }
  }

  // Build AI prompt
  const action = await getAIResponse(
    conversation.stage,
    incomingText,
    conversationHistory,
    activeListing,
    slotsText,
    conversation
  );

  // Execute actions based on AI response
  const responseText = await executeAction(
    action,
    conversation,
    activeListing,
    senderPsid,
    availableSlots
  );

  return responseText;
}

// ─── AI Response Generation ──────────────────────────────────────────────────

async function getAIResponse(
  currentStage: ConversationStage,
  incomingText: string,
  history: { role: string; content: string }[],
  listing: {
    title: string;
    description: string;
    price: number;
    metadata: unknown;
    property: {
      address: string; city: string; state: string; zip: string;
      profile?: {
        amenities?: unknown; petPolicy?: string | null; petDeposit?: number | null;
        smokingAllowed?: boolean; parkingSpaces?: number | null;
        laundry?: string | null; description?: string | null;
      } | null;
    };
  },
  slotsText: string,
  conversation: { prospectName: string | null; prospectPhone: string | null; prospectEmail: string | null }
): Promise<ConversationAction> {
  if (!isAIConfigured()) {
    return getFallbackAction(currentStage, slotsText);
  }

  const model = getLanguageModel();
  if (!model) {
    return getFallbackAction(currentStage, slotsText);
  }

  const profile = listing.property.profile;
  const profileInfo = profile ? [
    profile.amenities ? `Amenities: ${(profile.amenities as string[]).join(", ")}` : null,
    profile.petPolicy ? `Pet Policy: ${profile.petPolicy}${profile.petDeposit ? ` ($${profile.petDeposit} deposit)` : ""}` : null,
    `Smoking: ${profile.smokingAllowed ? "Allowed" : "Not allowed"}`,
    profile.parkingSpaces != null ? `Parking: ${profile.parkingSpaces} spaces` : null,
    profile.laundry ? `Laundry: ${profile.laundry.replace("_", " ")}` : null,
    profile.description ? `Additional info: ${profile.description}` : null,
  ].filter(Boolean).join("\n") : "";

  const propertyInfo = `
Property: ${listing.title}
Address: ${listing.property.address}, ${listing.property.city}, ${listing.property.state} ${listing.property.zip}
Price: $${listing.price}/month
Description: ${listing.description}
${listing.metadata ? `Details: ${JSON.stringify(listing.metadata)}` : ""}
${profileInfo}`.trim();

  const stageInstructions = getStageInstructions(currentStage, slotsText, conversation);

  const historyText = history.length > 0
    ? history.map((m) => `${m.role}: ${m.content}`).join("\n")
    : "(First message from prospect)";

  const result = await generateObject({
    model,
    schema: ConversationActionSchema,
    system: `You are a friendly, professional property manager assistant responding to rental inquiries on Facebook Messenger.
You represent a property management company. Be warm, helpful, and concise (2-4 sentences per response).
Never make up information about the property. Only use facts from the listing data provided.
Your goal is to answer questions and guide the prospect toward scheduling a showing.

On the VERY FIRST reply (stage INITIAL_INQUIRY), always open by referencing the specific property: price, address, and any standout detail (beds/baths, pets, date available). Do NOT send a generic "thanks for your interest" — the prospect came from an ad for THIS property and wants confirmation they reached the right place.

Actively steer toward collecting an email or phone number so you can follow up if Messenger's 24-hour window closes. Ask for it naturally, not aggressively.

Set requestsHuman=true if the prospect explicitly asks to talk to a person/human/manager/agent, says the bot isn't helping, or asks something you genuinely can't answer from the property data (complex legal questions, unusual circumstances, disputes). When requestsHuman is true, write a short handoff message ("A team member will get back to you shortly.") as the responseText — that's the last thing the bot will say.

${propertyInfo}

Current conversation stage: ${currentStage}
${stageInstructions}

Known prospect info:
- Name: ${conversation.prospectName ?? "unknown"}
- Phone: ${conversation.prospectPhone ?? "unknown"}
- Email: ${conversation.prospectEmail ?? "unknown"}`,
    prompt: `Conversation history:
${historyText}

New message from prospect: "${incomingText}"

Respond appropriately and determine the next stage.`,
  });

  return result.object;
}

function getStageInstructions(
  stage: ConversationStage,
  slotsText: string,
  conversation: { prospectName: string | null }
): string {
  switch (stage) {
    case "INITIAL_INQUIRY":
      return `This is a new inquiry. Welcome them, answer their question, and gently steer toward scheduling a showing.
If they ask about scheduling right away, move to PROPOSING_TIMES.
${slotsText ? `Available showing times:\n${slotsText}` : ""}`;

    case "ANSWERING_QUESTIONS":
      return `The prospect is asking questions. Answer using the property info. After answering, ask if they'd like to schedule a showing.
If they want to schedule, move to PROPOSING_TIMES.
${slotsText ? `Available showing times:\n${slotsText}` : ""}`;

    case "PROPOSING_TIMES":
      return `Present available showing times. Ask which works best.
${slotsText ? `Available times:\n${slotsText}\nPresent these times and ask the prospect to pick one (by number).` : "No calendar configured — ask them for their preferred time."}
Move to AWAITING_SELECTION after presenting.`;

    case "AWAITING_SELECTION":
      return `The prospect should be selecting a time. Parse their selection.
${slotsText ? `The times offered were:\n${slotsText}` : ""}
Set selectedSlotIndex to the 0-based index of their choice (e.g., if they say "2" or "the second one", set selectedSlotIndex to 1).
If unclear, ask them to clarify. Move to CONFIRMING_BOOKING once selected.`;

    case "CONFIRMING_BOOKING":
      return `Confirm the booking details. If we don't have their name, ask for it.
${conversation.prospectName ? `We have their name: ${conversation.prospectName}` : "Ask for their name to complete the booking."}
Once confirmed, move to SHOWING_BOOKED.`;

    default:
      return "";
  }
}

function getFallbackAction(stage: ConversationStage, slotsText: string): ConversationAction {
  switch (stage) {
    case "INITIAL_INQUIRY":
      return {
        responseText: "Thanks for your interest! I'd love to tell you more about this property. Would you like to schedule a showing?",
        nextStage: "ANSWERING_QUESTIONS",
      };
    case "ANSWERING_QUESTIONS":
      if (slotsText) {
        return {
          responseText: `Great question! I'd be happy to show you the place in person. Here are some available times:\n\n${slotsText}\n\nWhich works best for you?`,
          nextStage: "AWAITING_SELECTION",
        };
      }
      return {
        responseText: "I'd be happy to help! Would you like to schedule a showing? What times work best for you?",
        nextStage: "PROPOSING_TIMES",
      };
    case "PROPOSING_TIMES":
      return {
        responseText: slotsText
          ? `Here are available showing times:\n\n${slotsText}\n\nJust reply with the number that works best!`
          : "What day and time work best for you to see the place?",
        nextStage: "AWAITING_SELECTION",
      };
    default:
      return {
        responseText: "Thanks for your message! Let me help you with that.",
        nextStage: stage,
      };
  }
}

// ─── Action Execution ────────────────────────────────────────────────────────

async function executeAction(
  action: ConversationAction,
  conversation: { id: string; stage: ConversationStage; propertyId: string; prospectName: string | null },
  listing: { id: string; property: { id: string; address: string; city: string; state: string; organizationId: string } },
  senderPsid: string,
  availableSlots: { start: Date; end: Date }[]
): Promise<string> {
  // Extract contact info if provided
  const updates: Record<string, unknown> = {
    stage: action.nextStage,
    messageCount: { increment: 1 },
    lastMessageAt: new Date(),
  };

  if (action.extractedName) updates.prospectName = action.extractedName;
  if (action.extractedPhone) updates.prospectPhone = action.extractedPhone;
  if (action.extractedEmail) updates.prospectEmail = action.extractedEmail;

  // Escape hatch: prospect asked for a human (or AI flagged it). Flip
  // humanTakeover so the webhook stops invoking the bot on future messages.
  // The current responseText (a short handoff message) will still be sent.
  if (action.requestsHuman) {
    updates.humanTakeover = true;
  }

  // Handle showing booking
  if (action.nextStage === "SHOWING_BOOKED") {
    const result = await bookShowing(
      conversation,
      listing,
      senderPsid,
      action,
      availableSlots
    );
    if (result.showingId) {
      updates.showingId = result.showingId;
    }
  }

  // Handle time selection - store proposed slots
  if (action.nextStage === "PROPOSING_TIMES" || action.nextStage === "AWAITING_SELECTION") {
    if (availableSlots.length > 0) {
      updates.proposedSlots = availableSlots.map((s) => ({
        start: s.start.toISOString(),
        end: s.end.toISOString(),
      }));
    }
  }

  // Update conversation
  await prisma.facebookConversation.update({
    where: { id: conversation.id },
    data: updates,
  });

  return action.responseText;
}

async function bookShowing(
  conversation: { id: string; propertyId: string; prospectName: string | null },
  listing: { id: string; property: { id: string; address: string; city: string; state: string; organizationId: string } },
  senderPsid: string,
  action: ConversationAction,
  availableSlots: { start: Date; end: Date }[]
): Promise<{ showingId: string | null }> {
  // Determine the showing time
  let showingStart: Date;
  let showingEnd: Date;

  // Try to use a selected slot from proposed slots
  const convo = await prisma.facebookConversation.findUnique({
    where: { id: conversation.id },
  });

  const proposedSlots = (convo?.proposedSlots as Array<{ start: string; end: string }>) ?? [];

  if (action.selectedSlotIndex != null && proposedSlots.length > 0) {
    const idx = Math.min(action.selectedSlotIndex, proposedSlots.length - 1);
    showingStart = new Date(proposedSlots[idx].start);
    showingEnd = new Date(proposedSlots[idx].end);
  } else if (action.selectedSlotIndex != null && availableSlots.length > 0) {
    const idx = Math.min(action.selectedSlotIndex, availableSlots.length - 1);
    showingStart = availableSlots[idx].start;
    showingEnd = availableSlots[idx].end;
  } else {
    // Fallback: pick the next available slot
    if (availableSlots.length > 0) {
      showingStart = availableSlots[0].start;
      showingEnd = availableSlots[0].end;
    } else {
      // No slots available - use tomorrow at 10am as default
      showingStart = new Date();
      showingStart.setDate(showingStart.getDate() + 1);
      showingStart.setHours(10, 0, 0, 0);
      showingEnd = new Date(showingStart.getTime() + 30 * 60 * 1000);
    }
  }

  const prospectName = action.extractedName ?? conversation.prospectName ?? "Facebook Prospect";

  // Create Showing record
  const showing = await prisma.showing.create({
    data: {
      propertyId: conversation.propertyId,
      date: showingStart,
      attendeeName: prospectName,
      attendeePhone: action.extractedPhone ?? null,
      attendeeEmail: action.extractedEmail ?? null,
      status: "SCHEDULED",
      notes: `Booked via Facebook Messenger (PSID: ${senderPsid})`,
    },
  });

  // Mirror the showing onto the org's calendar provider. For Internal this
  // is a no-op (the Showing row itself blocks the slot); for Google it
  // creates an event.
  try {
    const provider = await getCalendarProvider(listing.property.organizationId);
    if (await provider.isConfigured()) {
      const location = `${listing.property.address}, ${listing.property.city}, ${listing.property.state}`;
      await provider.createEvent({
        summary: `Showing: ${listing.property.address} — ${prospectName}`,
        description: `Property showing booked via Facebook Messenger.\nProspect: ${prospectName}\nPSID: ${senderPsid}`,
        startTime: showingStart,
        endTime: showingEnd,
        attendeeEmail: action.extractedEmail,
        location,
      });
    }
  } catch (err) {
    console.error("Failed to create calendar event:", err);
  }

  // Log showing event
  await createEvent({
    type: "SHOWING",
    payload: {
      showingId: showing.id,
      action: "SCHEDULED",
      date: showingStart.toISOString(),
      attendeeName: prospectName,
    },
    propertyId: conversation.propertyId,
  });

  // Schedule reminder (best-effort)
  try {
    const reminderTime = new Date(showingStart.getTime() - 60 * 60 * 1000);
    if (reminderTime > new Date()) {
      const delay = reminderTime.getTime() - Date.now();
      const showingQueue = getQueue("showings");
      await showingQueue.add(
        "showing-reminder",
        {
          showingId: showing.id,
          propertyId: conversation.propertyId,
          attendeeName: prospectName,
          attendeePhone: action.extractedPhone,
          date: showingStart.toISOString(),
        },
        { delay, jobId: `reminder-${showing.id}` }
      );
    }
  } catch {
    // Queue may not be configured — non-fatal
  }

  return { showingId: showing.id };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Select well-distributed slots across the available range.
 */
function selectDistributedSlots(
  slots: { start: Date; end: Date }[],
  count: number
): { start: Date; end: Date }[] {
  if (slots.length <= count) return slots;

  // Group by day
  const byDay = new Map<string, { start: Date; end: Date }[]>();
  for (const slot of slots) {
    const day = slot.start.toISOString().split("T")[0];
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(slot);
  }

  const selected: { start: Date; end: Date }[] = [];
  const days = Array.from(byDay.keys()).sort();
  const targetHours = [10, 14, 11, 16, 9]; // Varied times for diversity

  // Pick one slot per day at varied times, cycling through days
  for (let round = 0; selected.length < count && round < targetHours.length; round++) {
    const target = targetHours[round];
    for (const day of days) {
      if (selected.length >= count) break;
      const daySlots = byDay.get(day)!;
      // Find the slot closest to the target hour that hasn't been selected
      const available = daySlots.filter(
        (s) => !selected.some((sel) => sel.start.getTime() === s.start.getTime())
      );
      if (available.length === 0) continue;
      const best = available.reduce((b, s) =>
        Math.abs(s.start.getHours() - target) < Math.abs(b.start.getHours() - target) ? s : b
      );
      selected.push(best);
    }
  }

  return selected.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function formatSlot(start: Date, end: Date): string {
  const dayName = start.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const endTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dayName}, ${monthDay} at ${startTime}–${endTime}`;
}
