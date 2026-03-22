"use client";

import { Badge } from "@/components/ui/badge";

interface PlatformEntry {
  platform: string;
  status?: string;
  externalId?: string;
  postedAt?: string;
}

const platformDisplayNames: Record<string, string> = {
  FACEBOOK: "FB",
  ROOMIES: "Roomies",
  ZILLOW: "Zillow",
  CRAIGSLIST: "CL",
  APARTMENTS_COM: "Apts.com",
  OTHER: "Other",
};

export function PlatformBadges({
  platforms,
}: {
  platforms: PlatformEntry[] | null;
}) {
  if (!platforms || platforms.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {platforms.map((entry) => (
        <Badge
          key={entry.platform}
          variant="outline"
          className="text-xs"
        >
          {platformDisplayNames[entry.platform] ?? entry.platform}
        </Badge>
      ))}
    </div>
  );
}
