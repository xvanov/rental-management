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

type AdType = "MESSENGER" | "MARKETPLACE_LINK";

export function PublishDialog({
  listing,
  open,
  onOpenChange,
  onPublished,
}: PublishDialogProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set()
  );
  const [runAd, setRunAd] = useState(false);
  const [adType, setAdType] = useState<AdType>("MESSENGER");
  const [marketplaceUrl, setMarketplaceUrl] = useState("");
  const [startPaused, setStartPaused] = useState(true);
  const [adBudget, setAdBudget] = useState("5");
  const [adDays, setAdDays] = useState("7");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    if (runAd && adType === "MARKETPLACE_LINK" && !marketplaceUrl.trim()) {
      setError("Marketplace URL is required for a Marketplace Link ad.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        platforms: Array.from(selectedPlatforms),
      };
      if (selectedPlatforms.has("FACEBOOK") && runAd) {
        body.adOptions = {
          dailyBudget: Number(adBudget),
          days: Number(adDays),
          startPaused,
          adType,
          ...(adType === "MARKETPLACE_LINK"
            ? { marketplaceUrl: marketplaceUrl.trim() }
            : {}),
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
      setRunAd(false);
      setMarketplaceUrl("");
      onPublished();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setLoading(false);
    }
  }

  const location = listing.property
    ? `${listing.property.city}, ${listing.property.state}`
    : "";

  const totalAdCost = runAd ? Number(adBudget) * Number(adDays) : 0;

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
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={runAd}
                  onChange={() => setRunAd(!runAd)}
                  className="size-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium">
                  Run a Facebook ad
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                {runAd
                  ? "Your ad will be created in Ads Manager."
                  : "Without an ad, the listing posts to your page only (free)."}
              </p>

              {runAd && (
                <div className="grid gap-4 mt-2">
                  <div className="grid gap-2">
                    <Label>Ad type</Label>
                    <div className="grid gap-2">
                      <label className="flex items-start gap-2 cursor-pointer rounded-md border p-2 hover:bg-accent/50">
                        <input
                          type="radio"
                          name="adType"
                          value="MESSENGER"
                          checked={adType === "MESSENGER"}
                          onChange={() => setAdType("MESSENGER")}
                          className="mt-1 size-4"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            Messenger chatbot{" "}
                            <span className="text-xs font-normal text-muted-foreground">
                              (recommended)
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Tapping the ad opens Messenger. The AI chatbot replies, answers questions, and books showings on your Google Calendar. View threads under Conversations.
                          </div>
                        </div>
                      </label>
                      <label className="flex items-start gap-2 cursor-pointer rounded-md border p-2 hover:bg-accent/50">
                        <input
                          type="radio"
                          name="adType"
                          value="MARKETPLACE_LINK"
                          checked={adType === "MARKETPLACE_LINK"}
                          onChange={() => setAdType("MARKETPLACE_LINK")}
                          className="mt-1 size-4"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            Marketplace link
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Tapping the ad opens a Facebook Marketplace item. Replies happen there manually. Requires a Marketplace URL (post the listing to Marketplace yourself from a personal profile first).
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {adType === "MARKETPLACE_LINK" && (
                    <div className="grid gap-2">
                      <Label htmlFor="marketplace-url">Marketplace URL</Label>
                      <Input
                        id="marketplace-url"
                        type="url"
                        placeholder="https://facebook.com/marketplace/item/..."
                        value={marketplaceUrl}
                        onChange={(e) => setMarketplaceUrl(e.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Post to Facebook Marketplace manually from a personal profile (Meta blocks rental posts from Pages since Jan 2025), then paste the item URL here.
                      </p>
                    </div>
                  )}

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
                      <Label htmlFor="ad-days">Duration (days)</Label>
                      <Input
                        id="ad-days"
                        type="number"
                        min={1}
                        max={30}
                        value={adDays}
                        onChange={(e) => setAdDays(e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 text-sm text-muted-foreground">
                      Total ad spend:{" "}
                      <span className="font-medium text-foreground">
                        ${totalAdCost}
                      </span>{" "}
                      over {adDays} days
                    </div>
                    <label className="col-span-2 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={startPaused}
                        onChange={() => setStartPaused(!startPaused)}
                        className="size-4 rounded border-gray-300"
                      />
                      <span className="text-sm">
                        Start paused
                        <span className="text-xs text-muted-foreground ml-1">
                          (review in Ads Manager before going live)
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button
              type="submit"
              disabled={loading || selectedPlatforms.size === 0}
            >
              {loading
                ? "Publishing..."
                : runAd
                  ? startPaused
                    ? `Publish + Create ${adType === "MESSENGER" ? "Messenger" : "Marketplace"} Ad (paused, $${totalAdCost})`
                    : `Publish + Run ${adType === "MESSENGER" ? "Messenger" : "Marketplace"} Ad ($${totalAdCost})`
                  : "Publish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
