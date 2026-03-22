"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  DollarSign,
  Settings,
  FileText,
  Calendar,
  Wrench,
  Sparkles,
  Home,
  UserPlus,
  Bell,
  type LucideIcon,
} from "lucide-react";

interface TimelineEvent {
  id: string;
  type: string;
  payload: Record<string, string | undefined>;
  createdAt: string;
}

const EVENT_ICONS: Record<string, LucideIcon> = {
  MESSAGE: MessageSquare,
  PAYMENT: DollarSign,
  SYSTEM: Settings,
  LEASE: FileText,
  SHOWING: Calendar,
  MAINTENANCE: Wrench,
  CLEANING: Sparkles,
  PROPERTY: Home,
  TENANT: UserPlus,
  NOTIFICATION: Bell,
};

const EVENT_TYPES = [
  "ALL",
  "MESSAGE",
  "PAYMENT",
  "SYSTEM",
  "LEASE",
  "SHOWING",
  "MAINTENANCE",
  "CLEANING",
  "PROPERTY",
  "TENANT",
] as const;

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function getEventDescription(event: TimelineEvent): string {
  const p = event.payload;
  return p?.action || p?.description || p?.content || event.type;
}

export function PropertyTimeline({ propertyId }: { propertyId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [hasMore, setHasMore] = useState(true);

  async function fetchEvents(offset = 0, append = false) {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams({
        limit: "20",
        offset: String(offset),
      });
      if (filter !== "ALL") {
        params.set("type", filter);
      }
      const res = await fetch(
        `/api/properties/${propertyId}/timeline?${params}`
      );
      if (res.ok) {
        const data: TimelineEvent[] = await res.json();
        if (append) {
          setEvents((prev) => [...prev, ...data]);
        } else {
          setEvents(data);
        }
        setHasMore(data.length === 20);
      }
    } catch (err) {
      console.error("Failed to fetch timeline:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    setEvents([]);
    setHasMore(true);
    fetchEvents(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, filter]);

  function handleLoadMore() {
    fetchEvents(events.length, true);
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Timeline</h3>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type === "ALL" ? "All Events" : type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-4">
          Loading timeline...
        </div>
      ) : events.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">
          No events found.
        </div>
      ) : (
        <div className="grid gap-2">
          {events.map((event) => {
            const Icon = EVENT_ICONS[event.type] ?? Settings;
            return (
              <Card key={event.id} className="py-3">
                <CardContent className="flex items-start gap-3 px-4">
                  <div className="mt-0.5 text-muted-foreground">
                    <Icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {event.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(event.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm truncate">
                      {getEventDescription(event)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {hasMore && events.length > 0 && (
        <Button
          variant="outline"
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="w-full"
        >
          {loadingMore ? "Loading..." : "Load More"}
        </Button>
      )}
    </div>
  );
}
