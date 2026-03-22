"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PublishDialogProps {
  listing: {
    id: string;
    title: string;
    property?: { city: string; state: string };
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: () => void;
}

const PLATFORMS = [
  { key: "FACEBOOK", label: "Facebook" },
  { key: "ROOMIES", label: "Roomies" },
  { key: "ZILLOW", label: "Zillow" },
  { key: "CRAIGSLIST", label: "Craigslist" },
  { key: "APARTMENTS_COM", label: "Apartments.com" },
  { key: "OTHER", label: "Other" },
] as const;

export function PublishDialog({
  listing,
  open,
  onOpenChange,
  onPublished,
}: PublishDialogProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set()
  );
  const [adBudget, setAdBudget] = useState("10");
  const [adDays, setAdDays] = useState("7");
  const [loading, setLoading] = useState(false);

  function togglePlatform(key: string) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedPlatforms.size === 0) return;

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        platforms: Array.from(selectedPlatforms),
      };
      if (selectedPlatforms.has("FACEBOOK") && adBudget) {
        body.adOptions = {
          dailyBudget: Number(adBudget),
          days: Number(adDays),
        };
      }
      const res = await fetch(`/api/listings/${listing.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to publish listing");
      }
      setSelectedPlatforms(new Set());
      onPublished();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to publish listing:", err);
    } finally {
      setLoading(false);
    }
  }

  const location = listing.property
    ? `${listing.property.city}, ${listing.property.state}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish Listing</DialogTitle>
          <DialogDescription>
            Publish &ldquo;{listing.title}&rdquo;
            {location ? ` in ${location}` : ""} to one or more platforms.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-3">
            <Label>Platforms</Label>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.has(key)}
                    onChange={() => togglePlatform(key)}
                    className="size-4 rounded border-gray-300"
                  />
                  <span className="text-sm">
                    {label}
                    {key !== "FACEBOOK" && (
                      <span className="text-xs text-muted-foreground ml-1">(track only)</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {selectedPlatforms.has("FACEBOOK") && (
            <div className="grid gap-3 rounded-md border p-3">
              <Label className="text-xs text-muted-foreground">
                Facebook Ad Options (optional)
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="ad-budget">Daily Budget ($)</Label>
                  <Input
                    id="ad-budget"
                    type="number"
                    min={1}
                    value={adBudget}
                    onChange={(e) => setAdBudget(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ad-days">Days</Label>
                  <Input
                    id="ad-days"
                    type="number"
                    min={1}
                    value={adDays}
                    onChange={(e) => setAdDays(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={loading || selectedPlatforms.size === 0}
            >
              {loading ? "Publishing..." : "Publish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
