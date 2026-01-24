"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  User,
  Phone,
  Mail,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Property {
  id: string;
  address: string;
  city: string;
}

interface Showing {
  id: string;
  propertyId: string;
  date: string;
  attendeeName: string | null;
  attendeePhone: string | null;
  attendeeEmail: string | null;
  status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
  notes: string | null;
  property: Property;
}

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Check }
> = {
  SCHEDULED: { label: "Scheduled", variant: "secondary", icon: Clock },
  CONFIRMED: { label: "Confirmed", variant: "default", icon: Check },
  COMPLETED: { label: "Completed", variant: "outline", icon: Check },
  NO_SHOW: { label: "No Show", variant: "destructive", icon: AlertTriangle },
  CANCELLED: { label: "Cancelled", variant: "destructive", icon: X },
};

export default function CalendarPage() {
  const [showings, setShowings] = useState<Showing[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"week" | "month">("week");
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    propertyId: "",
    date: "",
    time: "",
    attendeeName: "",
    attendeePhone: "",
    attendeeEmail: "",
    notes: "",
  });

  const getDateRange = useCallback(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (view === "week") {
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      end.setDate(end.getDate() + (6 - day));
    } else {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [currentDate, view]);

  const fetchShowings = useCallback(async () => {
    try {
      const { start, end } = getDateRange();
      const params = new URLSearchParams({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      const res = await fetch(`/api/showings?${params}`);
      if (res.ok) {
        const data = await res.json();
        setShowings(data);
      }
    } catch (error) {
      console.error("Failed to fetch showings:", error);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  const fetchProperties = async () => {
    try {
      const res = await fetch("/api/properties");
      if (res.ok) {
        const data = await res.json();
        setProperties(data);
      }
    } catch (error) {
      console.error("Failed to fetch properties:", error);
    }
  };

  useEffect(() => {
    fetchShowings();
    fetchProperties();
  }, [fetchShowings]);

  const navigate = (direction: number) => {
    const next = new Date(currentDate);
    if (view === "week") {
      next.setDate(next.getDate() + direction * 7);
    } else {
      next.setMonth(next.getMonth() + direction);
    }
    setCurrentDate(next);
  };

  const handleCreate = async () => {
    if (!formData.propertyId || !formData.date || !formData.time) return;

    const dateTime = new Date(`${formData.date}T${formData.time}`);

    try {
      const res = await fetch("/api/showings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: formData.propertyId,
          date: dateTime.toISOString(),
          attendeeName: formData.attendeeName || null,
          attendeePhone: formData.attendeePhone || null,
          attendeeEmail: formData.attendeeEmail || null,
          notes: formData.notes || null,
        }),
      });

      if (res.ok) {
        setCreateOpen(false);
        setFormData({
          propertyId: "",
          date: "",
          time: "",
          attendeeName: "",
          attendeePhone: "",
          attendeeEmail: "",
          notes: "",
        });
        fetchShowings();
      }
    } catch (error) {
      console.error("Failed to create showing:", error);
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/showings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        fetchShowings();
      }
    } catch (error) {
      console.error("Failed to update showing:", error);
    }
  };

  const getWeekDays = () => {
    const { start } = getDateRange();
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const getMonthDays = () => {
    const { start, end } = getDateRange();
    const days: Date[] = [];
    // Start from the Sunday before the first day of the month
    const firstDay = new Date(start);
    firstDay.setDate(firstDay.getDate() - firstDay.getDay());
    // End on the Saturday after the last day of the month
    const lastDay = new Date(end);
    lastDay.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

    const current = new Date(firstDay);
    while (current <= lastDay) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  };

  const getShowingsForDay = (day: Date) => {
    return showings.filter((s) => {
      const showingDate = new Date(s.date);
      return (
        showingDate.getFullYear() === day.getFullYear() &&
        showingDate.getMonth() === day.getMonth() &&
        showingDate.getDate() === day.getDate()
      );
    });
  };

  const isToday = (day: Date) => {
    const today = new Date();
    return (
      day.getFullYear() === today.getFullYear() &&
      day.getMonth() === today.getMonth() &&
      day.getDate() === today.getDate()
    );
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const headerLabel = view === "week"
    ? `Week of ${getWeekDays()[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${getWeekDays()[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-muted-foreground mt-1">Loading showings...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground mt-1">
            Schedule and manage property showings.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" />
              New Showing
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Showing</DialogTitle>
              <DialogDescription>
                Create a new property showing appointment.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="property">Property</Label>
                <Select
                  value={formData.propertyId}
                  onValueChange={(val) =>
                    setFormData((f) => ({ ...f, propertyId: val }))
                  }
                >
                  <SelectTrigger id="property">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.address}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, date: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, time: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="attendeeName">Attendee Name</Label>
                <Input
                  id="attendeeName"
                  placeholder="John Doe"
                  value={formData.attendeeName}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, attendeeName: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="attendeePhone">Phone</Label>
                  <Input
                    id="attendeePhone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={formData.attendeePhone}
                    onChange={(e) =>
                      setFormData((f) => ({
                        ...f,
                        attendeePhone: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="attendeeEmail">Email</Label>
                  <Input
                    id="attendeeEmail"
                    type="email"
                    placeholder="john@example.com"
                    value={formData.attendeeEmail}
                    onChange={(e) =>
                      setFormData((f) => ({
                        ...f,
                        attendeeEmail: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  placeholder="Additional notes..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate}>Schedule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Calendar Controls */}
      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </Button>
          <span className="ml-2 text-lg font-semibold">{headerLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={view === "week" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("week")}
          >
            Week
          </Button>
          <Button
            variant={view === "month" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("month")}
          >
            Month
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      {view === "week" ? (
        <div className="mt-4 grid grid-cols-7 gap-2">
          {getWeekDays().map((day) => {
            const dayShowings = getShowingsForDay(day);
            return (
              <div
                key={day.toISOString()}
                className={`min-h-[200px] rounded-lg border p-2 ${
                  isToday(day) ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="mb-2 text-center">
                  <div className="text-xs text-muted-foreground">
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      isToday(day) ? "text-primary" : ""
                    }`}
                  >
                    {day.getDate()}
                  </div>
                </div>
                <div className="space-y-1">
                  {dayShowings.map((showing) => {
                    const config = statusConfig[showing.status];
                    return (
                      <div
                        key={showing.id}
                        className="rounded bg-muted p-1.5 text-xs cursor-pointer hover:bg-muted/80"
                        title={`${showing.attendeeName || "No name"} - ${showing.property.address}`}
                      >
                        <div className="font-medium truncate">
                          {formatTime(showing.date)}
                        </div>
                        <div className="truncate text-muted-foreground">
                          {showing.attendeeName || "Walk-in"}
                        </div>
                        <Badge
                          variant={config.variant}
                          className="mt-0.5 text-[10px] px-1 py-0"
                        >
                          {config.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-7 gap-px bg-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                className="bg-background p-2 text-center text-xs font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
            {getMonthDays().map((day) => {
              const dayShowings = getShowingsForDay(day);
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[100px] bg-background p-1 ${
                    !isCurrentMonth ? "opacity-40" : ""
                  } ${isToday(day) ? "ring-1 ring-primary" : ""}`}
                >
                  <div
                    className={`text-xs ${
                      isToday(day) ? "font-bold text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {day.getDate()}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {dayShowings.slice(0, 3).map((showing) => (
                      <div
                        key={showing.id}
                        className="truncate rounded bg-primary/10 px-1 text-[10px] text-primary"
                      >
                        {formatTime(showing.date)}{" "}
                        {showing.attendeeName?.split(" ")[0] || "Showing"}
                      </div>
                    ))}
                    {dayShowings.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">
                        +{dayShowings.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming Showings List */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">
          {view === "week" ? "This Week" : "This Month"}&apos;s Showings
        </h2>
        {showings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
            <CalendarIcon className="size-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">No showings scheduled</p>
            <p className="text-sm text-muted-foreground">
              Create a new showing to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {showings
              .filter((s) => s.status !== "CANCELLED")
              .map((showing) => {
                const config = statusConfig[showing.status];
                const StatusIcon = config.icon;
                const showingDate = new Date(showing.date);
                return (
                  <Card key={showing.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center rounded-lg bg-muted px-3 py-2">
                          <span className="text-xs text-muted-foreground">
                            {showingDate.toLocaleDateString("en-US", { weekday: "short" })}
                          </span>
                          <span className="text-lg font-bold">
                            {showingDate.getDate()}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {showingDate.toLocaleDateString("en-US", { month: "short" })}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Clock className="size-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {formatTime(showing.date)}
                            </span>
                            <Badge variant={config.variant} className="text-xs">
                              <StatusIcon className="mr-1 size-3" />
                              {config.label}
                            </Badge>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MapPin className="size-3" />
                              {showing.property.address}
                            </span>
                            {showing.attendeeName && (
                              <span className="flex items-center gap-1">
                                <User className="size-3" />
                                {showing.attendeeName}
                              </span>
                            )}
                            {showing.attendeePhone && (
                              <span className="flex items-center gap-1">
                                <Phone className="size-3" />
                                {showing.attendeePhone}
                              </span>
                            )}
                            {showing.attendeeEmail && (
                              <span className="flex items-center gap-1">
                                <Mail className="size-3" />
                                {showing.attendeeEmail}
                              </span>
                            )}
                          </div>
                          {showing.notes && (
                            <p className="mt-1 text-xs text-muted-foreground italic">
                              {showing.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {showing.status === "SCHEDULED" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleStatusUpdate(showing.id, "CONFIRMED")
                              }
                            >
                              <Check className="mr-1 size-3" />
                              Confirm
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleStatusUpdate(showing.id, "CANCELLED")
                              }
                            >
                              <X className="mr-1 size-3" />
                              Cancel
                            </Button>
                          </>
                        )}
                        {showing.status === "CONFIRMED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleStatusUpdate(showing.id, "COMPLETED")
                            }
                          >
                            <Check className="mr-1 size-3" />
                            Complete
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
