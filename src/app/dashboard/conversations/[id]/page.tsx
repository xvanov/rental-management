"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Bot, User2, Send, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

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
  adReferralRef: string | null;
  proposedSlots: Array<{ start: string; end: string }> | null;
  listing: { id: string; title: string; price: number } | null;
  property: { id: string; address: string; city: string; state: string };
}

interface Message {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

interface Showing {
  id: string;
  date: string;
  status: string;
  attendeeName: string | null;
  attendeePhone: string | null;
  attendeeEmail: string | null;
}

interface ThreadResponse {
  conversation: Conversation;
  messages: Message[];
  showing: Showing | null;
}

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<ThreadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [togglingMode, setTogglingMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchThread = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) {
        const json = (await res.json()) as ThreadResponse;
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch conversation:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  async function handleToggleMode() {
    if (!data) return;
    setTogglingMode(true);
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          humanTakeover: !data.conversation.humanTakeover,
        }),
      });
      if (res.ok) await fetchThread();
    } finally {
      setTogglingMode(false);
    }
  }

  async function handleSendReply() {
    const text = replyText.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        setReplyText("");
        await fetchThread();
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading...</div>
    );
  }
  if (!data) {
    return <div className="p-6 text-sm">Conversation not found.</div>;
  }

  const { conversation, messages, showing } = data;
  const { humanTakeover } = conversation;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/conversations"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {conversation.prospectName ?? "Unknown prospect"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {conversation.listing ? (
              <Link
                href={`/dashboard/listings/${conversation.listing.id}`}
                className="hover:underline"
              >
                {conversation.listing.title}
              </Link>
            ) : (
              `${conversation.property.address}, ${conversation.property.city}, ${conversation.property.state}`
            )}
          </p>
        </div>
        <Button
          variant={humanTakeover ? "default" : "outline"}
          onClick={handleToggleMode}
          disabled={togglingMode}
        >
          {humanTakeover ? (
            <>
              <Bot className="size-4" /> Resume bot
            </>
          ) : (
            <>
              <User2 className="size-4" /> Take over
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Thread */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Messages</span>
              <Badge variant={humanTakeover ? "outline" : "secondary"} className="gap-1">
                {humanTakeover ? (
                  <>
                    <User2 className="size-3" /> Human replying
                  </>
                ) : (
                  <>
                    <Bot className="size-3" /> Bot replying
                  </>
                )}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-2">
              {messages.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  No messages yet.
                </div>
              )}
              {messages.map((m) => {
                const isInbound = m.direction === "INBOUND";
                const isEcho =
                  m.metadata &&
                  typeof m.metadata === "object" &&
                  (m.metadata as { isEcho?: boolean }).isEcho === true;
                return (
                  <div
                    key={m.id}
                    className={`flex ${isInbound ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        isInbound
                          ? "bg-muted"
                          : isEcho
                            ? "bg-amber-100 dark:bg-amber-950 border border-amber-300"
                            : "bg-primary text-primary-foreground"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      <div
                        className={`mt-1 text-xs ${
                          isInbound
                            ? "text-muted-foreground"
                            : isEcho
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-primary-foreground/70"
                        }`}
                      >
                        {isInbound
                          ? "Prospect"
                          : isEcho
                            ? "Page inbox (human)"
                            : "Bot / you"}{" "}
                        · {new Date(m.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="mt-4 grid gap-2 border-t pt-4">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={
                  humanTakeover
                    ? "Type a reply as the Page. The bot is paused."
                    : "Type a reply. Sending will pause the bot."
                }
                rows={3}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Sending as the Page. {humanTakeover
                    ? "Bot is paused — toggle 'Resume bot' to hand control back."
                    : "Sending will automatically pause the bot."}
                </p>
                <Button
                  onClick={handleSendReply}
                  disabled={sending || !replyText.trim()}
                >
                  <Send className="size-4" /> Send
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar: prospect + showing + metadata */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prospect</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>{" "}
                {conversation.prospectName ?? (
                  <span className="text-muted-foreground">not captured</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Phone:</span>{" "}
                {conversation.prospectPhone ?? (
                  <span className="text-muted-foreground">not captured</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Email:</span>{" "}
                {conversation.prospectEmail ?? (
                  <span className="text-muted-foreground">not captured</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Messages:</span>{" "}
                {conversation.messageCount}
              </div>
              <div>
                <span className="text-muted-foreground">Stage:</span>{" "}
                <Badge variant="outline">{conversation.stage}</Badge>
              </div>
            </CardContent>
          </Card>

          {showing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="size-4" /> Booked showing
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                <div className="font-medium">
                  {new Date(showing.date).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  Status: {showing.status}
                </div>
                {showing.attendeeName && (
                  <div className="text-xs">Attendee: {showing.attendeeName}</div>
                )}
              </CardContent>
            </Card>
          )}

          {conversation.proposedSlots && conversation.proposedSlots.length > 0 && !showing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Proposed slots</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-1 text-xs">
                  {conversation.proposedSlots.map((s, i) => (
                    <li key={i}>
                      {i + 1}. {new Date(s.start).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {(conversation.adId || conversation.adReferralRef) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ad attribution</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-xs text-muted-foreground">
                {conversation.adId && <div>Ad ID: {conversation.adId}</div>}
                {conversation.adReferralRef && (
                  <div>Ref: {conversation.adReferralRef}</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
