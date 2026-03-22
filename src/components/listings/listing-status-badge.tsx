"use client";

import { Badge } from "@/components/ui/badge";

const statusConfig: Record<
  string,
  { variant: "default" | "outline" | "secondary" | "destructive"; label: string; className?: string }
> = {
  DRAFT: { variant: "outline", label: "Draft" },
  POSTED: { variant: "default", label: "Posted", className: "bg-green-600" },
  FILLED: { variant: "secondary", label: "Filled" },
  EXPIRED: { variant: "destructive", label: "Expired" },
  REMOVED: { variant: "outline", label: "Removed", className: "opacity-50" },
};

export function ListingStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? {
    variant: "outline" as const,
    label: status,
  };

  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
