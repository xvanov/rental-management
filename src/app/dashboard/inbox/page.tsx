"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Inbox,
  MessageSquare,
  Mail,
  Phone,
  Send,
  ArrowLeft,
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

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<string>("SMS");
  const [sending, setSending] = useState(false);
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
        fetchMessages(selectedTenantId);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
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
                {selectedConversation.unit && (
                  <Badge variant="outline" className="text-xs">
                    {selectedConversation.unit.name}
                  </Badge>
                )}
              </div>

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
