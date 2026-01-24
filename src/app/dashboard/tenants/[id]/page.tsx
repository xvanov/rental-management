"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Mail,
  Phone,
  Home,
  DollarSign,
  FileText,
  MessageSquare,
  Calendar,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TenantUnit {
  id: string;
  name: string;
  property: { id: string; address: string; city: string; state: string };
}

interface TenantLease {
  id: string;
  status: string;
  startDate: string;
  endDate: string | null;
  rentAmount: number;
  version: number;
  createdAt: string;
}

interface TenantPayment {
  id: string;
  amount: number;
  method: string;
  date: string;
  note: string | null;
  createdAt: string;
}

interface TenantMessage {
  id: string;
  channel: string;
  direction: string;
  content: string;
  read: boolean;
  createdAt: string;
}

interface TenantEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface TenantDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  createdAt: string;
  unit: TenantUnit | null;
  leases: TenantLease[];
  payments: TenantPayment[];
  messages: TenantMessage[];
}

const eventTypeConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  MESSAGE: { label: "Message", variant: "secondary" },
  PAYMENT: { label: "Payment", variant: "default" },
  NOTICE: { label: "Notice", variant: "destructive" },
  UPLOAD: { label: "Upload", variant: "outline" },
  VIOLATION: { label: "Violation", variant: "destructive" },
  INSPECTION: { label: "Inspection", variant: "outline" },
  SYSTEM: { label: "System", variant: "secondary" },
  LEASE: { label: "Lease", variant: "default" },
  APPLICATION: { label: "Application", variant: "outline" },
  SHOWING: { label: "Showing", variant: "secondary" },
  CLEANING: { label: "Cleaning", variant: "outline" },
};

const leaseStatusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  DRAFT: { label: "Draft", variant: "outline" },
  PENDING_SIGNATURE: { label: "Pending Signature", variant: "secondary" },
  ACTIVE: { label: "Active", variant: "default" },
  EXPIRED: { label: "Expired", variant: "destructive" },
  TERMINATED: { label: "Terminated", variant: "destructive" },
};

const paymentMethodLabels: Record<string, string> = {
  ZELLE: "Zelle",
  VENMO: "Venmo",
  CASHAPP: "Cash App",
  PAYPAL: "PayPal",
  CASH: "Cash",
  CHECK: "Check",
};

function getEventDescription(event: TenantEvent): string {
  const payload = event.payload;
  switch (event.type) {
    case "MESSAGE":
      return `${payload.direction === "INBOUND" ? "Received" : "Sent"} ${payload.channel} message`;
    case "PAYMENT":
      return `Payment of $${payload.amount} via ${paymentMethodLabels[payload.method as string] || payload.method}`;
    case "NOTICE":
      return `${payload.noticeType} notice sent`;
    case "LEASE":
      return `Lease ${(payload.action as string || "").toLowerCase()}`;
    case "VIOLATION":
      return `Violation: ${payload.description}`;
    case "SYSTEM":
      return payload.description as string || "System event";
    case "APPLICATION":
      return `Application ${(payload.action as string || "").toLowerCase()}`;
    default:
      return `${event.type.charAt(0) + event.type.slice(1).toLowerCase()} event`;
  }
}

export default function TenantDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [events, setEvents] = useState<TenantEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTenant = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants?id=${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setTenant(data);
      setError(null);
    } catch {
      setError("Failed to load tenant");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${id}/events`);
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events || []);
    } catch {
      // Non-critical
    }
  }, [id]);

  useEffect(() => {
    fetchTenant();
    fetchEvents();
  }, [fetchTenant, fetchEvents]);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Loading...</h1>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div>
        <Link
          href="/dashboard/tenants"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Tenants
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Tenant Not Found</h1>
        <p className="text-muted-foreground mt-1">
          {error || "This tenant could not be found."}
        </p>
      </div>
    );
  }

  const totalPaid = tenant.payments.reduce((sum, p) => sum + p.amount, 0);
  const activeLease = tenant.leases.find((l) => l.status === "ACTIVE");

  return (
    <div>
      <Link
        href="/dashboard/tenants"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Tenants
      </Link>

      {/* Tenant Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {tenant.firstName} {tenant.lastName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {tenant.email && (
              <span className="flex items-center gap-1">
                <Mail className="size-3" />
                {tenant.email}
              </span>
            )}
            {tenant.phone && (
              <span className="flex items-center gap-1">
                <Phone className="size-3" />
                {tenant.phone}
              </span>
            )}
            {tenant.unit && (
              <span className="flex items-center gap-1">
                <Home className="size-3" />
                {tenant.unit.name} - {tenant.unit.property.address}
              </span>
            )}
          </div>
        </div>
        <Badge variant={tenant.active ? "default" : "secondary"}>
          {tenant.active ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* Stat Cards */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lease Status</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activeLease ? "Active" : "None"}
            </div>
            {activeLease && (
              <p className="text-xs text-muted-foreground">
                ${activeLease.rentAmount.toLocaleString()}/mo
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalPaid.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {tenant.payments.length} payments
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages</CardTitle>
            <MessageSquare className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenant.messages.length}</div>
            <p className="text-xs text-muted-foreground">
              total communications
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Member Since</CardTitle>
            <Calendar className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Date(tenant.createdAt).toLocaleDateString(undefined, {
                month: "short",
                year: "numeric",
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="timeline" className="mt-8">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="leases">Leases</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-4">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
              <Users className="size-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No events yet</p>
              <p className="text-xs text-muted-foreground">
                Events will appear here as actions are taken.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-4 rounded-lg border p-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          eventTypeConfig[event.type]?.variant || "outline"
                        }
                      >
                        {eventTypeConfig[event.type]?.label || event.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">
                      {getEventDescription(event)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Leases Tab */}
        <TabsContent value="leases" className="mt-4">
          {tenant.leases.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
              <FileText className="size-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No leases</p>
              <p className="text-xs text-muted-foreground">
                Lease information will appear here.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Rent</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Version</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenant.leases.map((lease) => (
                    <TableRow key={lease.id}>
                      <TableCell>
                        <Badge
                          variant={
                            leaseStatusConfig[lease.status]?.variant || "outline"
                          }
                        >
                          {leaseStatusConfig[lease.status]?.label || lease.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        ${lease.rentAmount.toLocaleString()}/mo
                      </TableCell>
                      <TableCell>
                        {new Date(lease.startDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {lease.endDate
                          ? new Date(lease.endDate).toLocaleDateString()
                          : "Open-ended"}
                      </TableCell>
                      <TableCell>v{lease.version}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="mt-4">
          {tenant.payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
              <DollarSign className="size-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No payments</p>
              <p className="text-xs text-muted-foreground">
                Payment history will appear here.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenant.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {new Date(payment.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">
                        ${payment.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {paymentMethodLabels[payment.method] || payment.method}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {payment.note || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Communications Tab */}
        <TabsContent value="communications" className="mt-4">
          {tenant.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
              <MessageSquare className="size-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No messages</p>
              <p className="text-xs text-muted-foreground">
                Communication history will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tenant.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg border p-3 ${
                    message.direction === "OUTBOUND"
                      ? "ml-8 bg-muted/50"
                      : "mr-8"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {message.channel}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {message.direction === "INBOUND" ? "Received" : "Sent"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(message.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{message.content}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
