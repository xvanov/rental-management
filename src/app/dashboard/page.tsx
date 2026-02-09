"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Users,
  Mail,
  DollarSign,
  CalendarClock,
  AlertTriangle,
  ClipboardList,
  MessageSquare,
  CreditCard,
  Plus,
  TrendingUp,
  Home,
  ArrowRight,
  Clock,
  CheckSquare,
  Check,
  AlertCircle,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DashboardData {
  metrics: {
    propertyCount: number;
    unitCount: number;
    occupiedUnits: number;
    occupancyRate: number;
    activeTenants: number;
    monthlyRevenue: number;
    outstandingBalance: number;
    unreadMessages: number;
  };
  actionItems: Array<{
    type: string;
    label: string;
    count: number;
    href: string;
    priority: "high" | "medium" | "low";
  }>;
  upcomingShowings: Array<{
    id: string;
    date: string;
    attendeeName: string;
    attendeePhone: string;
    status: string;
    property: string;
  }>;
  enforcementDeadlines: Array<{
    id: string;
    type: string;
    status: string;
    tenantName: string;
    createdAt: string;
  }>;
  recentEvents: Array<{
    id: string;
    type: string;
    tenantName: string | null;
    createdAt: string;
    payload: Record<string, unknown>;
  }>;
  propertySummaries: Array<{
    id: string;
    address: string;
    city: string;
    state: string;
    totalUnits: number;
    occupiedUnits: number;
    occupancyRate: number;
    tenantCount: number;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    source: string;
    dueDate: string | null;
    property: string | null;
    propertyId: string | null;
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/dashboard");
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Loading...</p>
        </div>
      </div>
    );
  }

  const metrics = data?.metrics ?? {
    propertyCount: 0,
    unitCount: 0,
    occupiedUnits: 0,
    occupancyRate: 0,
    activeTenants: 0,
    monthlyRevenue: 0,
    outstandingBalance: 0,
    unreadMessages: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your rental operations.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.occupancyRate}%</div>
            <p className="text-xs text-muted-foreground">
              {metrics.occupiedUnits} of {metrics.unitCount} units occupied
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics.monthlyRevenue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              From {metrics.activeTenants} active tenants
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.outstandingBalance > 0 ? "text-destructive" : ""}`}>
              ${metrics.outstandingBalance.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all tenants
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Properties</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.propertyCount}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.unitCount} total units
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action Items + Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Action Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Action Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.actionItems && data.actionItems.length > 0 ? (
              <div className="space-y-3">
                {data.actionItems.map((item, idx) => (
                  <Link
                    key={idx}
                    href={item.href}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <ActionItemIcon type={item.type} />
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          item.priority === "high"
                            ? "destructive"
                            : item.priority === "medium"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {item.count}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ClipboardList className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No action items. You&apos;re all caught up!
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-1">
              <Link href="/dashboard/inbox">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Send Message
                </Button>
              </Link>
              <Link href="/dashboard/payments">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <CreditCard className="h-4 w-4" />
                  Log Payment
                </Button>
              </Link>
              <Link href="/dashboard/calendar">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Create Showing
                </Button>
              </Link>
              <Link href="/dashboard/applications">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <ClipboardList className="h-4 w-4" />
                  New Application Link
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* To-Do List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            To-Do
          </CardTitle>
          <Link href="/dashboard/tasks">
            <Button variant="ghost" size="sm" className="gap-1">
              View All
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {data?.tasks && data.tasks.length > 0 ? (
            <div className="space-y-2">
              {data.tasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <TaskPriorityDot priority={task.priority} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {task.title}
                      </span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {task.source === "AIR_FILTER"
                          ? "Air Filter"
                          : task.source.charAt(0) +
                            task.source.slice(1).toLowerCase()}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {task.property && (
                        <span className="text-xs text-muted-foreground truncate">
                          {task.property}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          Due{" "}
                          {new Date(task.dueDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 shrink-0"
                    onClick={async () => {
                      await fetch("/api/tasks", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          id: task.id,
                          status: "COMPLETED",
                        }),
                      });
                      // Re-fetch dashboard
                      const res = await fetch("/api/dashboard");
                      if (res.ok) setData(await res.json());
                    }}
                    title="Complete"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckSquare className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No pending tasks. You&apos;re all caught up!
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enforcement Deadlines + Upcoming Showings */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Enforcement Deadlines */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Enforcement Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.enforcementDeadlines && data.enforcementDeadlines.length > 0 ? (
              <div className="space-y-3">
                {data.enforcementDeadlines.map((notice) => (
                  <Link
                    key={notice.id}
                    href="/dashboard/enforcement"
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">{notice.tenantName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatNoticeType(notice.type)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={notice.status === "SENT" ? "destructive" : "secondary"}
                      >
                        {notice.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(notice.createdAt)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No active enforcement deadlines.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Showings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Upcoming Showings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.upcomingShowings && data.upcomingShowings.length > 0 ? (
              <div className="space-y-3">
                {data.upcomingShowings.map((showing) => (
                  <Link
                    key={showing.id}
                    href="/dashboard/calendar"
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">{showing.attendeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {showing.property}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">{formatDate(showing.date)}</p>
                      <Badge variant="secondary" className="mt-1">
                        {showing.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CalendarClock className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No upcoming showings scheduled.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Event Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.recentEvents && data.recentEvents.length > 0 ? (
            <div className="space-y-3">
              {data.recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <EventTypeIcon type={event.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {event.type}
                      </Badge>
                      {event.tenantName && (
                        <span className="text-sm font-medium truncate">
                          {event.tenantName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {getEventDescription(event)}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(event.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Clock className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No recent activity.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Property Summary Cards */}
      {data?.propertySummaries && data.propertySummaries.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Home className="h-5 w-5" />
            Properties
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.propertySummaries.map((property) => (
              <Link key={property.id} href={`/dashboard/properties/${property.id}`}>
                <Card className="hover:bg-accent/50 transition-colors">
                  <CardContent className="pt-6">
                    <p className="font-medium truncate">{property.address}</p>
                    <p className="text-xs text-muted-foreground">
                      {property.city}, {property.state}
                    </p>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold">{property.occupancyRate}%</p>
                        <p className="text-xs text-muted-foreground">Occupancy</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{property.totalUnits}</p>
                        <p className="text-xs text-muted-foreground">Units</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{property.tenantCount}</p>
                        <p className="text-xs text-muted-foreground">Tenants</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────

function ActionItemIcon({ type }: { type: string }) {
  switch (type) {
    case "messages":
      return <Mail className="h-4 w-4 text-blue-500" />;
    case "applications":
      return <ClipboardList className="h-4 w-4 text-purple-500" />;
    case "enforcement":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "showings":
      return <CalendarClock className="h-4 w-4 text-green-500" />;
    case "payments":
      return <DollarSign className="h-4 w-4 text-red-500" />;
    case "tasks":
      return <CheckSquare className="h-4 w-4 text-indigo-500" />;
    default:
      return <Users className="h-4 w-4 text-muted-foreground" />;
  }
}

function EventTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "MESSAGE":
      return <MessageSquare className="h-4 w-4 text-blue-500 mt-0.5" />;
    case "PAYMENT":
      return <CreditCard className="h-4 w-4 text-green-500 mt-0.5" />;
    case "NOTICE":
      return <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />;
    case "SYSTEM":
      return <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />;
  }
}

function TaskPriorityDot({ priority }: { priority: string }) {
  switch (priority) {
    case "URGENT":
      return <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />;
    case "HIGH":
      return <ArrowUp className="h-4 w-4 text-orange-500 shrink-0" />;
    case "MEDIUM":
      return <ArrowRight className="h-4 w-4 text-blue-500 shrink-0" />;
    case "LOW":
      return <ArrowDown className="h-4 w-4 text-gray-400 shrink-0" />;
    default:
      return null;
  }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function formatNoticeType(type: string): string {
  return type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getEventDescription(event: { type: string; payload: Record<string, unknown> }): string {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "MESSAGE": {
      const direction = payload.direction === "INBOUND" ? "received" : "sent";
      const channel = String(payload.channel ?? "").toLowerCase();
      return `Message ${direction} via ${channel}`;
    }
    case "PAYMENT": {
      const amount = payload.amount as number;
      const method = String(payload.method ?? "").toLowerCase();
      return `Payment of $${amount?.toLocaleString()} via ${method}`;
    }
    case "NOTICE": {
      const noticeType = String(payload.noticeType ?? "").replace(/_/g, " ").toLowerCase();
      return `${noticeType} notice`;
    }
    case "SYSTEM": {
      return String(payload.description ?? payload.action ?? "System event");
    }
    default:
      return event.type.toLowerCase().replace(/_/g, " ");
  }
}
