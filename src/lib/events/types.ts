import { EventType } from "@/generated/prisma/client";

// ─── Typed Payloads per Event Type ──────────────────────────────────────────

export interface MessageEventPayload {
  messageId: string;
  channel: "SMS" | "EMAIL" | "FACEBOOK";
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  from?: string;
  to?: string;
}

export interface PaymentEventPayload {
  paymentId: string;
  amount: number;
  method: "ZELLE" | "VENMO" | "CASHAPP" | "PAYPAL" | "CASH" | "CHECK";
  date: string;
  note?: string;
}

export interface NoticeEventPayload {
  noticeId: string;
  noticeType: "LATE_RENT" | "LEASE_VIOLATION" | "EVICTION_WARNING" | "DEPOSIT_DISPOSITION" | "MOVE_OUT";
  sentVia?: "SMS" | "EMAIL" | "MAIL";
  content?: string;
}

export interface UploadEventPayload {
  fileName: string;
  fileType: string;
  fileUrl: string;
  context: string;
  sizeBytes?: number;
}

export interface ViolationEventPayload {
  violationType: string;
  description: string;
  feeAmount?: number;
  deadline?: string;
  resolved?: boolean;
}

export interface InspectionEventPayload {
  inspectionType: "MOVE_IN" | "MOVE_OUT" | "ROUTINE";
  notes?: string;
  photos?: string[];
  deductions?: Array<{ description: string; amount: number }>;
}

export interface SystemEventPayload {
  action: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface LeaseEventPayload {
  leaseId: string;
  action: "CREATED" | "SIGNED" | "RENEWED" | "TERMINATED" | "EXPIRED";
  version?: number;
  signerName?: string;
  signerEmail?: string;
  ipAddress?: string;
}

export interface ApplicationEventPayload {
  applicationId: string;
  action: "SUBMITTED" | "REVIEWED" | "APPROVED" | "REJECTED";
  reviewNotes?: string;
}

export interface ShowingEventPayload {
  showingId: string;
  action: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
  date: string;
  attendeeName?: string;
}

export interface CleaningEventPayload {
  assignmentId: string;
  action: "ASSIGNED" | "SUBMITTED" | "VALIDATED" | "FAILED" | "OVERDUE";
  photoCount?: number;
  feeApplied?: number;
}

export interface MaintenanceEventPayload {
  maintenanceType: "AIR_FILTER" | "GENERAL";
  action: "FILTER_CHANGED" | "CONFIG_CREATED" | "CONFIG_REMOVED";
  configId?: string;
  filterCount?: number;
  description?: string;
}

// ─── Discriminated Union ────────────────────────────────────────────────────

export type EventPayload =
  | { type: "MESSAGE"; data: MessageEventPayload }
  | { type: "PAYMENT"; data: PaymentEventPayload }
  | { type: "NOTICE"; data: NoticeEventPayload }
  | { type: "UPLOAD"; data: UploadEventPayload }
  | { type: "VIOLATION"; data: ViolationEventPayload }
  | { type: "INSPECTION"; data: InspectionEventPayload }
  | { type: "SYSTEM"; data: SystemEventPayload }
  | { type: "LEASE"; data: LeaseEventPayload }
  | { type: "APPLICATION"; data: ApplicationEventPayload }
  | { type: "SHOWING"; data: ShowingEventPayload }
  | { type: "CLEANING"; data: CleaningEventPayload }
  | { type: "MAINTENANCE"; data: MaintenanceEventPayload };

// ─── Helper: Extract payload data type for a given event type ───────────────

export type PayloadDataForType<T extends EventType> = Extract<
  EventPayload,
  { type: T }
>["data"];

// ─── Create Event Input ─────────────────────────────────────────────────────

export interface CreateEventInput<T extends EventType = EventType> {
  type: T;
  payload: PayloadDataForType<T>;
  tenantId?: string;
  propertyId?: string;
}

// ─── Event Query Filters ────────────────────────────────────────────────────

export interface EventQueryFilters {
  tenantId?: string;
  propertyId?: string;
  type?: EventType;
  types?: EventType[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}
