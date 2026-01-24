"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Inbox,
  MessageSquare,
  Mail,
  Phone,
  Send,
  ArrowLeft,
  Sparkles,
  Loader2,
  Check,
  X,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Conversation {
  tenantId: string;
  tenantName: string;
  phone: string | null;
  email: string | null;
  unit: {
    id: string;
    name: string;
    property: { id: string; address: string } | null;
  } | null;
  lastMessage: {
    id: string;
    channel: string;
    direction: string;
    content: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  totalMessages: number;
}

interface Message {
  id: string;
  tenantId: string;
  channel: string;
  direction: string;
  content: string;
  read: boolean;
  createdAt: string;
  tenant: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
  } | null;
}

interface Classification {
  category: string;
  confidence: number;
  summary: string;
}

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel) {
    case "SMS":
      return <Phone className="size-3" />;
    case "EMAIL":
      return <Mail className="size-3" />;
    case "FACEBOOK":
      return <MessageSquare className="size-3" />;
    default:
      return <MessageSquare className="size-3" />;
  }
}

function ChannelBadge({ channel }: { channel: string }) {
  const variant = channel === "SMS" ? "default" : channel === "EMAIL" ? "secondary" : "outline";
  return (
    <Badge variant={variant} className="gap-1 text-xs">
      <ChannelIcon channel={channel} />
      {channel}
    </Badge>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const labels: Record<string, string> = {
    inquiry: "Inquiry",
    complaint: "Complaint",
    payment_confirmation: "Payment",
    maintenance_request: "Maintenance",
    lease_question: "Lease",
    move_in_out: "Move In/Out",
    general: "General",
  };
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    inquiry: "secondary",
    complaint: "destructive",
    payment_confirmation: "default",
    maintenance_request: "outline",
    lease_question: "secondary",
    move_in_out: "outline",
    general: "secondary",
  };
  return (
    <Badge variant={variants[category] ?? "secondary"} className="gap-1 text-xs">
      <Tag className="size-3" />
      {labels[category] ?? category}
    </Badge>
  );
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<string>("SMS");
  const [sending, setSending] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState("");
  const [showDraftApproval, setShowDraftApproval] = useState(false);
  const [classification, setClassification] = useState<Classification | null>(null);
  const [classifying, setClassifying] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messages");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (tenantId: string) => {
    setMessagesLoading(true);
    setClassification(null);
    try {
      const res = await fetch(`/api/messages?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }

      // Mark messages as read
      await fetch("/api/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });

      // Refresh conversations to update unread counts
      fetchConversations();
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    } finally {
      setMessagesLoading(false);
    }
  }, [fetchConversations]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (selectedTenantId) {
      fetchMessages(selectedTenantId);
    }
  }, [selectedTenantId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedTenantId) return;

    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenantId,
          channel: selectedChannel,
          content: newMessage.trim(),
        }),
      });

      if (res.ok) {
        setNewMessage("");
        setShowDraftApproval(false);
        setAiDraft("");
        fetchMessages(selectedTenantId);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  };

  const handleSuggestReply = async () => {
    if (!selectedTenantId) return;

    setDraftLoading(true);
    setAiDraft("");
    setShowDraftApproval(false);

    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedTenantId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("AI draft error:", errorData.error);
        setDraftLoading(false);
        return;
      }

      // Stream the response
      const reader = res.body?.getReader();
      if (!reader) {
        setDraftLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let draft = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        draft += chunk;
        setAiDraft(draft);
      }

      setShowDraftApproval(true);
    } catch (error) {
      console.error("Failed to generate AI draft:", error);
    } finally {
      setDraftLoading(false);
    }
  };

  const handleApproveDraft = () => {
    setNewMessage(aiDraft);
    setShowDraftApproval(false);
    setAiDraft("");
  };

  const handleRejectDraft = () => {
    setShowDraftApproval(false);
    setAiDraft("");
  };

  const handleClassifyLatest = async () => {
    if (!selectedTenantId || messages.length === 0) return;

    // Find the latest inbound message
    const latestInbound = [...messages].reverse().find((m) => m.direction === "INBOUND");
    if (!latestInbound) return;

    setClassifying(true);
    try {
      const res = await fetch("/api/ai/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: latestInbound.id,
          content: latestInbound.content,
          tenantId: selectedTenantId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setClassification(data);
      }
    } catch (error) {
      console.error("Failed to classify message:", error);
    } finally {
      setClassifying(false);
    }
  };

  const selectedConversation = conversations.find(
    (c) => c.tenantId === selectedTenantId
  );

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
        <p className="text-muted-foreground mt-1">
          Unified communications across all channels.
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden rounded-lg border">
        {/* Conversation List */}
        <div className={`w-full border-r md:w-80 md:block ${selectedTenantId ? "hidden" : "block"}`}>
          <div className="border-b p-3">
            <h2 className="text-sm font-semibold">Conversations</h2>
          </div>
          <ScrollArea className="h-[calc(100%-3rem)]">
            {loading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8">
                <Inbox className="size-10 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No conversations</p>
                <p className="text-xs text-muted-foreground">
                  Messages will appear here when tenants communicate.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {conversations.map((conv) => (
                  <button
                    key={conv.tenantId}
                    onClick={() => setSelectedTenantId(conv.tenantId)}
                    className={`w-full p-3 text-left transition-colors hover:bg-muted/50 ${
                      selectedTenantId === conv.tenantId ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {conv.tenantName}
                          </span>
                          {conv.unreadCount > 0 && (
                            <Badge variant="destructive" className="size-5 justify-center rounded-full p-0 text-xs">
                              {conv.unreadCount}
                            </Badge>
                          )}
                        </div>
                        {conv.unit && (
                          <p className="truncate text-xs text-muted-foreground">
                            {conv.unit.name} - {conv.unit.property?.address}
                          </p>
                        )}
                        {conv.lastMessage && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <ChannelIcon channel={conv.lastMessage.channel} />
                            <p className="truncate text-xs text-muted-foreground">
                              {conv.lastMessage.direction === "OUTBOUND" && "You: "}
                              {conv.lastMessage.content}
                            </p>
                          </div>
                        )}
                      </div>
                      {conv.lastMessage && (
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatTime(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Message Thread */}
        <div className={`flex flex-1 flex-col ${!selectedTenantId ? "hidden md:flex" : "flex"}`}>
          {selectedTenantId && selectedConversation ? (
            <>
              {/* Conversation Header */}
              <div className="flex items-center gap-3 border-b p-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setSelectedTenantId(null)}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">
                    {selectedConversation.tenantName}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {selectedConversation.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" />
                        {selectedConversation.phone}
                      </span>
                    )}
                    {selectedConversation.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="size-3" />
                        {selectedConversation.email}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {classification && (
                    <CategoryBadge category={classification.category} />
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClassifyLatest}
                    disabled={classifying || messages.length === 0}
                    className="gap-1.5"
                  >
                    {classifying ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Tag className="size-3" />
                    )}
                    Classify
                  </Button>
                  {selectedConversation.unit && (
                    <Badge variant="outline" className="text-xs">
                      {selectedConversation.unit.name}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Classification result */}
              {classification && (
                <div className="border-b bg-muted/30 px-4 py-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Tag className="size-3" />
                    <span className="font-medium">AI Classification:</span>
                    <CategoryBadge category={classification.category} />
                    <span>({Math.round(classification.confidence * 100)}% confidence)</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{classification.summary}</p>
                </div>
              )}

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {messagesLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <p className="text-sm text-muted-foreground">Loading messages...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8">
                    <MessageSquare className="size-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      No messages in this conversation yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${
                          msg.direction === "OUTBOUND" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <Card
                          className={`max-w-[75%] px-3 py-2 ${
                            msg.direction === "OUTBOUND"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <ChannelBadge channel={msg.channel} />
                            <span className="text-xs opacity-70">
                              {formatTime(msg.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </Card>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* AI Draft Approval */}
              {(draftLoading || showDraftApproval) && (
                <div className="border-t bg-muted/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="size-4 text-primary" />
                    <span className="text-sm font-medium">AI Suggested Reply</span>
                    {draftLoading && <Loader2 className="size-3 animate-spin" />}
                  </div>
                  <div className="rounded-md border bg-background p-3 text-sm whitespace-pre-wrap">
                    {aiDraft || "Generating..."}
                  </div>
                  {showDraftApproval && (
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleApproveDraft}
                        className="gap-1.5"
                      >
                        <Check className="size-3" />
                        Use This Reply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRejectDraft}
                        className="gap-1.5"
                      >
                        <X className="size-3" />
                        Discard
                      </Button>
                      <p className="ml-auto text-xs text-muted-foreground">
                        Review before sending - edit in compose area if needed.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Compose Area */}
              <div className="border-t p-3">
                <div className="flex items-end gap-2">
                  <Select
                    value={selectedChannel}
                    onValueChange={setSelectedChannel}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SMS">
                        <span className="flex items-center gap-1.5">
                          <Phone className="size-3" /> SMS
                        </span>
                      </SelectItem>
                      <SelectItem value="EMAIL">
                        <span className="flex items-center gap-1.5">
                          <Mail className="size-3" /> Email
                        </span>
                      </SelectItem>
                      <SelectItem value="FACEBOOK">
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="size-3" /> Facebook
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex flex-1 flex-col gap-1">
                    <Textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="min-h-[2.5rem] max-h-32 resize-none"
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleSuggestReply}
                    disabled={draftLoading || messages.length === 0}
                    title="Suggest AI Reply"
                  >
                    {draftLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sending}
                  >
                    <Send className="size-4" />
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {selectedConversation.phone
                    ? "Channel will default to SMS when phone is available."
                    : "Select a channel to send your message."}
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8">
              <Inbox className="size-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">Select a conversation</p>
              <p className="text-sm text-muted-foreground">
                Choose a conversation from the list to view messages.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
