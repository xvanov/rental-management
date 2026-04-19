"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, CheckCircle2, XCircle, Trash2, Loader2, Bot } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Provider = "INTERNAL" | "GOOGLE";
type ShowingHours = Record<string, { start: number; end: number }>;

interface ShowingSettings {
  calendarProvider: Provider;
  showingHours: ShowingHours;
  googleCalendarId: string | null;
  hasGoogleCredentials: boolean;
  providerConfigured: boolean;
}

interface Blackout {
  id: string;
  start: string;
  end: string;
  reason: string | null;
  createdAt: string;
}

const DAYS = [
  { key: "0", label: "Sunday" },
  { key: "1", label: "Monday" },
  { key: "2", label: "Tuesday" },
  { key: "3", label: "Wednesday" },
  { key: "4", label: "Thursday" },
  { key: "5", label: "Friday" },
  { key: "6", label: "Saturday" },
];

function formatHour(h: number): string {
  if (h === 0 || h === 24) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

interface Props {
  isAdmin: boolean;
}

export function ShowingAvailabilitySettings({ isAdmin }: Props) {
  const [settings, setSettings] = useState<ShowingSettings | null>(null);
  const [hours, setHours] = useState<ShowingHours>({});
  const [googleCalId, setGoogleCalId] = useState("");
  const [provider, setProvider] = useState<Provider>("INTERNAL");
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [newBlackoutStart, setNewBlackoutStart] = useState("");
  const [newBlackoutEnd, setNewBlackoutEnd] = useState("");
  const [newBlackoutReason, setNewBlackoutReason] = useState("");
  const [addingBlackout, setAddingBlackout] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [sRes, bRes] = await Promise.all([
        fetch("/api/showing-settings"),
        fetch("/api/showing-blackouts"),
      ]);
      if (sRes.ok) {
        const s: ShowingSettings = await sRes.json();
        setSettings(s);
        setHours(s.showingHours);
        setGoogleCalId(s.googleCalendarId ?? "");
        setProvider(s.calendarProvider);
      }
      if (bRes.ok) {
        setBlackouts(await bRes.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/showing-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarProvider: provider,
          showingHours: hours,
          googleCalendarId: googleCalId.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
      } else {
        await fetchAll();
      }
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddBlackout() {
    if (!newBlackoutStart || !newBlackoutEnd) return;
    setAddingBlackout(true);
    setError("");
    try {
      const res = await fetch("/api/showing-blackouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: new Date(newBlackoutStart).toISOString(),
          end: new Date(newBlackoutEnd).toISOString(),
          reason: newBlackoutReason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add blackout");
      } else {
        setNewBlackoutStart("");
        setNewBlackoutEnd("");
        setNewBlackoutReason("");
        await fetchAll();
      }
    } finally {
      setAddingBlackout(false);
    }
  }

  async function handleDeleteBlackout(id: string) {
    if (!confirm("Remove this blackout?")) return;
    const res = await fetch(`/api/showing-blackouts?id=${id}`, { method: "DELETE" });
    if (res.ok) await fetchAll();
  }

  function updateHour(day: string, field: "start" | "end", value: number) {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Loading showing availability...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="size-5" />
          Showing availability
        </CardTitle>
        <CardDescription>
          Control the hours the Messenger chatbot is allowed to offer for
          showings, and choose whether to track availability inside Rentus or
          sync with Google Calendar.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Provider selector */}
        <div className="grid gap-3">
          <Label>Calendar backend</Label>
          <div className="grid gap-2">
            <label className="flex items-start gap-2 cursor-pointer rounded-md border p-3 hover:bg-accent/50">
              <input
                type="radio"
                name="provider"
                value="INTERNAL"
                checked={provider === "INTERNAL"}
                onChange={() => setProvider("INTERNAL")}
                disabled={!isAdmin}
                className="mt-1 size-4"
              />
              <div className="flex-1">
                <div className="text-sm font-medium flex items-center gap-2">
                  <Bot className="size-4" /> Internal (recommended)
                </div>
                <div className="text-xs text-muted-foreground">
                  Availability lives inside Rentus. Booked showings and the
                  blackout ranges below are what the bot avoids. No external
                  dependencies.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer rounded-md border p-3 hover:bg-accent/50">
              <input
                type="radio"
                name="provider"
                value="GOOGLE"
                checked={provider === "GOOGLE"}
                onChange={() => setProvider("GOOGLE")}
                disabled={!isAdmin}
                className="mt-1 size-4"
              />
              <div className="flex-1">
                <div className="text-sm font-medium flex items-center gap-2">
                  Google Calendar
                  {provider === "GOOGLE" && settings?.providerConfigured ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="size-3" /> Connected
                    </Badge>
                  ) : provider === "GOOGLE" ? (
                    <Badge variant="outline" className="gap-1">
                      <XCircle className="size-3" /> Not configured
                    </Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  Sync availability with a Google Calendar. Requires the
                  GOOGLE_CALENDAR_CREDENTIALS env var (server-side) plus a
                  calendar ID shared with the service account.
                </div>
              </div>
            </label>
          </div>
        </div>

        {provider === "GOOGLE" && (
          <div className="grid gap-2">
            <Label htmlFor="google-cal-id">Google Calendar ID</Label>
            <Input
              id="google-cal-id"
              value={googleCalId}
              onChange={(e) => setGoogleCalId(e.target.value)}
              placeholder="abcd1234...@group.calendar.google.com"
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to fall back to the <code>GOOGLE_CALENDAR_ID</code>{" "}
              env var.{" "}
              {settings?.hasGoogleCredentials
                ? "Service account credentials detected."
                : "Service account credentials missing — set GOOGLE_CALENDAR_CREDENTIALS on the server."}
            </p>
          </div>
        )}

        {/* Hours editor */}
        <div className="grid gap-3">
          <Label>Showing hours by day</Label>
          <div className="grid gap-2 rounded-md border p-3">
            {DAYS.map((d) => {
              const h = hours[d.key] ?? { start: 0, end: 0 };
              const closed = h.end <= h.start;
              return (
                <div
                  key={d.key}
                  className="grid grid-cols-[80px_1fr_auto_1fr_auto] items-center gap-2 text-sm"
                >
                  <span className="font-medium">{d.label}</span>
                  <select
                    value={h.start}
                    onChange={(e) => updateHour(d.key, "start", Number(e.target.value))}
                    disabled={!isAdmin}
                    className="rounded border bg-transparent px-2 py-1 text-sm"
                  >
                    {Array.from({ length: 25 }, (_, i) => (
                      <option key={i} value={i}>
                        {formatHour(i)}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted-foreground">to</span>
                  <select
                    value={h.end}
                    onChange={(e) => updateHour(d.key, "end", Number(e.target.value))}
                    disabled={!isAdmin}
                    className="rounded border bg-transparent px-2 py-1 text-sm"
                  >
                    {Array.from({ length: 25 }, (_, i) => (
                      <option key={i} value={i}>
                        {formatHour(i)}
                      </option>
                    ))}
                  </select>
                  {closed && (
                    <span className="text-xs text-muted-foreground">
                      Closed
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Set both to the same hour (or end before start) to close the day
            entirely.
          </p>
        </div>

        {isAdmin && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        )}

        {/* Blackouts (Internal only — Google has its own events) */}
        {provider === "INTERNAL" && (
          <div className="grid gap-3 border-t pt-4">
            <div>
              <Label>Blackout times</Label>
              <p className="text-xs text-muted-foreground">
                Block specific ranges (vacation, personal obligations, etc.).
                The bot skips any slot that overlaps a blackout.
              </p>
            </div>

            {isAdmin && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 rounded-md border p-3">
                <div className="grid gap-1">
                  <Label htmlFor="bo-start" className="text-xs">Start</Label>
                  <Input
                    id="bo-start"
                    type="datetime-local"
                    value={newBlackoutStart}
                    onChange={(e) => setNewBlackoutStart(e.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="bo-end" className="text-xs">End</Label>
                  <Input
                    id="bo-end"
                    type="datetime-local"
                    value={newBlackoutEnd}
                    onChange={(e) => setNewBlackoutEnd(e.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="bo-reason" className="text-xs">Reason (optional)</Label>
                  <Input
                    id="bo-reason"
                    value={newBlackoutReason}
                    onChange={(e) => setNewBlackoutReason(e.target.value)}
                    placeholder="e.g. Out of town"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleAddBlackout}
                    disabled={
                      addingBlackout || !newBlackoutStart || !newBlackoutEnd
                    }
                    className="w-full"
                  >
                    Add blackout
                  </Button>
                </div>
              </div>
            )}

            {blackouts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No blackouts set.
              </p>
            ) : (
              <div className="grid gap-2">
                {blackouts.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">
                        {new Date(b.start).toLocaleString()} →{" "}
                        {new Date(b.end).toLocaleString()}
                      </div>
                      {b.reason && (
                        <div className="text-xs text-muted-foreground">
                          {b.reason}
                        </div>
                      )}
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteBlackout(b.id)}
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
