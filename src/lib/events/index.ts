import { prisma } from "@/lib/db";
import { EventType, Prisma } from "@/generated/prisma/client";
import type { CreateEventInput, EventQueryFilters, PayloadDataForType } from "./types";

// ─── Create Event (Append-Only) ─────────────────────────────────────────────

/**
 * Creates an immutable event record. Events are append-only and cannot be
 * updated or deleted. This function is the ONLY way to create events,
 * ensuring all events are properly typed and validated.
 */
export async function createEvent<T extends EventType>(
  input: CreateEventInput<T>
) {
  const event = await prisma.event.create({
    data: {
      type: input.type,
      payload: input.payload as unknown as Prisma.InputJsonValue,
      tenantId: input.tenantId ?? null,
      propertyId: input.propertyId ?? null,
    },
  });

  return event;
}

// ─── Convenience Creators ────────────────────────────────────────────────────

export async function logMessageEvent(
  payload: PayloadDataForType<"MESSAGE">,
  opts?: { tenantId?: string; propertyId?: string }
) {
  return createEvent({
    type: "MESSAGE",
    payload,
    ...opts,
  });
}

export async function logPaymentEvent(
  payload: PayloadDataForType<"PAYMENT">,
  opts?: { tenantId?: string; propertyId?: string }
) {
  return createEvent({
    type: "PAYMENT",
    payload,
    ...opts,
  });
}

export async function logNoticeEvent(
  payload: PayloadDataForType<"NOTICE">,
  opts?: { tenantId?: string; propertyId?: string }
) {
  return createEvent({
    type: "NOTICE",
    payload,
    ...opts,
  });
}

export async function logSystemEvent(
  payload: PayloadDataForType<"SYSTEM">,
  opts?: { tenantId?: string; propertyId?: string }
) {
  return createEvent({
    type: "SYSTEM",
    payload,
    ...opts,
  });
}

// ─── Query Helpers ───────────────────────────────────────────────────────────

/**
 * Query events with flexible filters. Supports filtering by tenant, property,
 * event type(s), and date range. Results are always ordered by createdAt DESC.
 */
export async function queryEvents(filters: EventQueryFilters = {}) {
  const where: Prisma.EventWhereInput = {};

  if (filters.tenantId) {
    where.tenantId = filters.tenantId;
  }

  if (filters.propertyId) {
    where.propertyId = filters.propertyId;
  }

  if (filters.type) {
    where.type = filters.type;
  } else if (filters.types && filters.types.length > 0) {
    where.type = { in: filters.types };
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.createdAt.lte = filters.endDate;
    }
  }

  return prisma.event.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 50,
    skip: filters.offset ?? 0,
    include: {
      tenant: true,
      property: true,
    },
  });
}

/** Get all events for a specific tenant, ordered chronologically. */
export async function getEventsByTenant(
  tenantId: string,
  opts?: { limit?: number; offset?: number; type?: EventType }
) {
  return queryEvents({
    tenantId,
    type: opts?.type,
    limit: opts?.limit,
    offset: opts?.offset,
  });
}

/** Get all events for a specific property, ordered chronologically. */
export async function getEventsByProperty(
  propertyId: string,
  opts?: { limit?: number; offset?: number; type?: EventType }
) {
  return queryEvents({
    propertyId,
    type: opts?.type,
    limit: opts?.limit,
    offset: opts?.offset,
  });
}

/** Get events within a date range, optionally filtered by type. */
export async function getEventsByDateRange(
  startDate: Date,
  endDate: Date,
  opts?: { tenantId?: string; propertyId?: string; type?: EventType; limit?: number }
) {
  return queryEvents({
    startDate,
    endDate,
    tenantId: opts?.tenantId,
    propertyId: opts?.propertyId,
    type: opts?.type,
    limit: opts?.limit,
  });
}

/** Count events matching the given filters. */
export async function countEvents(filters: EventQueryFilters = {}) {
  const where: Prisma.EventWhereInput = {};

  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.propertyId) where.propertyId = filters.propertyId;
  if (filters.type) where.type = filters.type;
  else if (filters.types?.length) where.type = { in: filters.types };

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  return prisma.event.count({ where });
}

// ─── Append-Only Enforcement ─────────────────────────────────────────────────

/**
 * IMPORTANT: The Event model is designed to be immutable (append-only).
 * - No update operations are exposed
 * - No delete operations are exposed
 * - The schema has no `updatedAt` field
 * - All modifications to state should create NEW events rather than modify existing ones
 *
 * If you need to "correct" an event, create a new SYSTEM event referencing
 * the original event ID with a correction payload.
 */

// Re-export types for consumers
export type { CreateEventInput, EventQueryFilters, EventPayload, PayloadDataForType } from "./types";
