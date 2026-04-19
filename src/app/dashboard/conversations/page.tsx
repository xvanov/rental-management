"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Bot, User2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Conversation {
  id: string;
  senderPsid: string;
  stage: string;
  prospectName: string | null;
  prospectPhone: string | null;
  prospectEmail: string | null;
  messageCount: number;
  lastMessageAt: string;
  humanTakeover: boolean;
  showingId: string | null;
  adId: string | null;
  listing: { id: string; title: string; price: number } | null;
  property: { id: string; address: string; city: string; state: string };
}

const STAGE_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  INITIAL_INQUIRY: { label: "New inquiry", variant: "default" },
  ANSWERING_QUESTIONS: { label: "Q&A", variant: "secondary" },
  PROPOSING_TIMES: { label: "Proposing times", variant: "secondary" },
  AWAITING_SELECTION: { label: "Awaiting pick", variant: "secondary" },
  CONFIRMING_BOOKING: { label: "Confirming", variant: "secondary" },
  SHOWING_BOOKED: { label: "Showing booked", variant: "default" },
  DECLINED: { label: "Declined", variant: "outline" },
  STALE: { label: "Stale", variant: "outline" },
};

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const stats = {
    total: conversations.length,
    active: conversations.filter(
      (c) => !["SHOWING_BOOKED", "DECLINED", "STALE"].includes(c.stage)
    ).length,
    booked: conversations.filter((c) => c.stage === "SHOWING_BOOKED").length,
    humanDriven: conversations.filter((c) => c.humanTakeover).length,
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conversations</h1>
          <p className="text-sm text-muted-foreground">
            Facebook Messenger threads from click-to-Messenger ads and Page DMs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total threads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Showings booked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.booked}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Human-driven
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.humanDriven}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent threads</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <MessageSquare className="size-8 text-muted-foreground" />
              <div className="text-sm font-medium">No conversations yet</div>
              <div className="text-xs text-muted-foreground max-w-sm">
                Create a click-to-Messenger ad from a listing and prospects
                will show up here.
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Listing</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Msgs</TableHead>
                  <TableHead>Last msg</TableHead>
                  <TableHead>Mode</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversations.map((c) => {
                  const stage = STAGE_LABELS[c.stage] ?? {
                    label: c.stage,
                    variant: "outline" as const,
                  };
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-accent/50"
                    >
                      <TableCell>
                        <Link
                          href={`/dashboard/conversations/${c.id}`}
                          className="block"
                        >
                          <div className="font-medium">
                            {c.prospectName ?? "Unknown prospect"}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            PSID {c.senderPsid.slice(0, 10)}…
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {c.listing ? (
                          <Link
                            href={`/dashboard/listings/${c.listing.id}`}
                            className="text-sm hover:underline"
                          >
                            {c.listing.title}
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {c.property.address}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={stage.variant}>{stage.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {c.prospectPhone && (
                            <div>📱 {c.prospectPhone}</div>
                          )}
                          {c.prospectEmail && (
                            <div>✉️ {c.prospectEmail}</div>
                          )}
                          {!c.prospectPhone && !c.prospectEmail && (
                            <div className="text-muted-foreground">—</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{c.messageCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(c.lastMessageAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {c.humanTakeover ? (
                          <Badge variant="outline" className="gap-1">
                            <User2 className="size-3" /> Human
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Bot className="size-3" /> Bot
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
