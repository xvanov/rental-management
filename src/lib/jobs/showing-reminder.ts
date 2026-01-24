import { getQueue, createWorker, type Job } from "@/lib/jobs";
import { prisma } from "@/lib/db";
import { sendSms } from "@/lib/integrations/twilio";
import { createEvent } from "@/lib/events";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ShowingReminderData {
  showingId: string;
  propertyId: string;
  attendeeName?: string | null;
  attendeePhone?: string | null;
  date: string;
}

export interface NoShowCheckData {
  showingId: string;
  propertyId: string;
}

// ─── Enqueue Jobs ───────────────────────────────────────────────────────────

/**
 * Schedule a showing reminder to be sent 1 hour before the showing.
 * Sends an SMS asking the attendee to confirm attendance.
 */
export async function enqueueShowingReminder(data: ShowingReminderData, delay: number) {
  const queue = getQueue("showings");
  await queue.add("showing-reminder", data, {
    delay,
    jobId: `reminder-${data.showingId}`,
  });
}

/**
 * Schedule a no-show check to run 15 minutes after the showing time.
 * If the showing is still SCHEDULED (not CONFIRMED), mark as NO_SHOW.
 */
export async function enqueueNoShowCheck(data: NoShowCheckData, delay: number) {
  const queue = getQueue("showings");
  await queue.add("no-show-check", data, {
    delay,
    jobId: `noshow-${data.showingId}`,
  });
}

// ─── Worker ─────────────────────────────────────────────────────────────────

let workerStarted = false;

export function startShowingWorker() {
  if (workerStarted) return;
  workerStarted = true;

  createWorker<ShowingReminderData | NoShowCheckData>(
    "showings",
    async (job: Job<ShowingReminderData | NoShowCheckData>) => {
      if (job.name === "showing-reminder") {
        await handleShowingReminder(job.data as ShowingReminderData);
      } else if (job.name === "no-show-check") {
        await handleNoShowCheck(job.data as NoShowCheckData);
      }
    }
  );
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleShowingReminder(data: ShowingReminderData) {
  const { showingId, propertyId, attendeePhone, attendeeName, date } = data;

  // Verify the showing still exists and is scheduled
  const showing = await prisma.showing.findUnique({
    where: { id: showingId },
    include: { property: { select: { address: true } } },
  });

  if (!showing || showing.status === "CANCELLED") {
    console.log(`[Showing Reminder] Showing ${showingId} cancelled or not found, skipping`);
    return;
  }

  // Send SMS confirmation request if phone is available
  if (attendeePhone) {
    const showingDate = new Date(date);
    const timeStr = showingDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const dateStr = showingDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    const message = `Hi${attendeeName ? ` ${attendeeName}` : ""}! Your showing at ${showing.property.address} is coming up at ${timeStr} on ${dateStr}. Reply YES to confirm or CANCEL to cancel.`;

    try {
      await sendSms({
        to: attendeePhone,
        body: message,
        propertyId,
      });
      console.log(`[Showing Reminder] Sent reminder SMS to ${attendeePhone} for showing ${showingId}`);
    } catch (error) {
      console.error(`[Showing Reminder] Failed to send SMS:`, error);
    }
  }

  // Schedule no-show check for 15 minutes after showing time
  const showingTime = new Date(date);
  const noShowCheckTime = new Date(showingTime.getTime() + 15 * 60 * 1000);
  const delay = Math.max(0, noShowCheckTime.getTime() - Date.now());

  await enqueueNoShowCheck({ showingId, propertyId }, delay);
}

async function handleNoShowCheck(data: NoShowCheckData) {
  const { showingId, propertyId } = data;

  const showing = await prisma.showing.findUnique({
    where: { id: showingId },
  });

  if (!showing) {
    console.log(`[No-Show Check] Showing ${showingId} not found`);
    return;
  }

  // If showing is still SCHEDULED (not confirmed), mark as NO_SHOW
  if (showing.status === "SCHEDULED") {
    await prisma.showing.update({
      where: { id: showingId },
      data: { status: "NO_SHOW" },
    });

    await createEvent({
      type: "SHOWING",
      payload: {
        showingId,
        action: "NO_SHOW",
        date: showing.date.toISOString(),
        attendeeName: showing.attendeeName || undefined,
      },
      propertyId,
    });

    console.log(`[No-Show Check] Marked showing ${showingId} as NO_SHOW (not confirmed)`);
  } else {
    console.log(`[No-Show Check] Showing ${showingId} has status ${showing.status}, no action needed`);
  }
}
