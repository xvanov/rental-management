"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Calendar,
  Clock,
  MapPin,
  User,
  Phone,
  Mail,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
}

interface TimeSlot {
  start: string;
  end: string;
}

export default function BookingPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [step, setStep] = useState<"select" | "details" | "confirmed">("select");
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
    return start;
  });
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchProperty = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties`);
      if (res.ok) {
        const data = await res.json();
        const found = data.find((p: Property) => p.id === propertyId);
        if (found) setProperty(found);
      }
    } catch (error) {
      console.error("Failed to fetch property:", error);
    }
  }, [propertyId]);

  const fetchSlots = useCallback(async () => {
    try {
      setLoading(true);
      const endDate = new Date(weekStart);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);

      const params = new URLSearchParams({
        propertyId,
        startDate: weekStart.toISOString(),
        endDate: endDate.toISOString(),
      });
      const res = await fetch(`/api/showings/availability?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots);
      }
    } catch (error) {
      console.error("Failed to fetch slots:", error);
    } finally {
      setLoading(false);
    }
  }, [propertyId, weekStart]);

  useEffect(() => {
    fetchProperty();
  }, [fetchProperty]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const navigateWeek = (direction: number) => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + direction * 7);
    setWeekStart(next);
    setSelectedDate(null);
    setSelectedSlot(null);
  };

  const getWeekDays = () => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const getSlotsForDate = (dateStr: string) => {
    return slots.filter((slot) => {
      const slotDate = new Date(slot.start);
      return slotDate.toDateString() === new Date(dateStr).toDateString();
    });
  };

  const isToday = (day: Date) => {
    const today = new Date();
    return day.toDateString() === today.toDateString();
  };

  const isPast = (day: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return day < today;
  };

  const handleSubmit = async () => {
    if (!selectedSlot || !formData.name) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/showings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          date: selectedSlot.start,
          attendeeName: formData.name,
          attendeePhone: formData.phone || null,
          attendeeEmail: formData.email || null,
        }),
      });

      if (res.ok) {
        setStep("confirmed");
      }
    } catch (error) {
      console.error("Failed to book showing:", error);
    } finally {
      setSubmitting(false);
    }
  };

  if (!property && !loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-lg font-medium">Property not found</p>
            <p className="text-sm text-muted-foreground mt-2">
              This booking link may be invalid or expired.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "confirmed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="mx-auto size-16 text-green-500" />
            <h2 className="mt-4 text-xl font-bold">Showing Booked!</h2>
            <p className="mt-2 text-muted-foreground">
              Your showing has been scheduled for:
            </p>
            <div className="mt-4 rounded-lg bg-muted p-4">
              <div className="flex items-center justify-center gap-2">
                <Calendar className="size-4" />
                <span className="font-medium">
                  {selectedSlot &&
                    new Date(selectedSlot.start).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-center gap-2">
                <Clock className="size-4" />
                <span>
                  {selectedSlot &&
                    new Date(selectedSlot.start).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-center gap-2">
                <MapPin className="size-4" />
                <span>{property?.address}</span>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {formData.phone
                ? "You'll receive an SMS confirmation 1 hour before your showing."
                : "Please arrive on time for your scheduled showing."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Schedule a Showing</h1>
          {property && (
            <p className="mt-1 flex items-center justify-center gap-1 text-muted-foreground">
              <MapPin className="size-4" />
              {property.address}, {property.city}, {property.state}
            </p>
          )}
        </div>

        {step === "select" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="size-5" />
                Select Date & Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Week Navigation */}
              <div className="flex items-center justify-between mb-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigateWeek(-1)}
                  disabled={isPast(weekStart)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-sm font-medium">
                  {getWeekDays()[0].toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  -{" "}
                  {getWeekDays()[6].toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigateWeek(1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              {/* Day Selection */}
              <div className="grid grid-cols-7 gap-1 mb-4">
                {getWeekDays().map((day) => {
                  const dateStr = day.toISOString();
                  const daySlots = getSlotsForDate(dateStr);
                  const past = isPast(day);
                  const selected = selectedDate === day.toDateString();
                  return (
                    <button
                      key={dateStr}
                      onClick={() => {
                        if (!past && daySlots.length > 0) {
                          setSelectedDate(day.toDateString());
                          setSelectedSlot(null);
                        }
                      }}
                      disabled={past || daySlots.length === 0}
                      className={`flex flex-col items-center rounded-lg p-2 text-center transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground"
                          : past || daySlots.length === 0
                            ? "opacity-40 cursor-not-allowed"
                            : "hover:bg-muted cursor-pointer"
                      } ${isToday(day) && !selected ? "ring-1 ring-primary" : ""}`}
                    >
                      <span className="text-xs">
                        {day.toLocaleDateString("en-US", { weekday: "short" })}
                      </span>
                      <span className="text-lg font-bold">{day.getDate()}</span>
                      <span className="text-[10px]">
                        {daySlots.length > 0
                          ? `${daySlots.length} slots`
                          : "Full"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Time Slots */}
              {selectedDate && (
                <div>
                  <h3 className="text-sm font-medium mb-2">Available Times</h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {getSlotsForDate(selectedDate).map((slot) => {
                      const time = new Date(slot.start).toLocaleTimeString(
                        "en-US",
                        { hour: "numeric", minute: "2-digit", hour12: true }
                      );
                      const isSelected = selectedSlot?.start === slot.start;
                      return (
                        <button
                          key={slot.start}
                          onClick={() => setSelectedSlot(slot)}
                          className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "hover:border-primary hover:bg-primary/5"
                          }`}
                        >
                          {time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedSlot && (
                <div className="mt-4 flex justify-end">
                  <Button onClick={() => setStep("details")}>
                    Continue
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === "details" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-5" />
                Your Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Selected time summary */}
              <div className="mb-6 rounded-lg bg-muted p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="size-4" />
                  <span>
                    {selectedSlot &&
                      new Date(selectedSlot.start).toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                  </span>
                  <Clock className="ml-2 size-4" />
                  <span>
                    {selectedSlot &&
                      new Date(selectedSlot.start).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                  </span>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto p-0 text-xs"
                  onClick={() => setStep("select")}
                >
                  Change time
                </Button>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">
                    Full Name <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="name"
                      className="pl-9"
                      placeholder="Your full name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">
                    Phone Number{" "}
                    <span className="text-xs text-muted-foreground">
                      (for SMS confirmation)
                    </span>
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      className="pl-9"
                      placeholder="(555) 123-4567"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData((f) => ({ ...f, phone: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      className="pl-9"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData((f) => ({ ...f, email: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep("select")}
                >
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!formData.name || submitting}
                  className="flex-1"
                >
                  {submitting ? "Booking..." : "Book Showing"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
