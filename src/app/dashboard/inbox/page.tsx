import { Inbox } from "lucide-react";

export default function InboxPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
      <p className="text-muted-foreground mt-1">
        Unified communications across all channels.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
        <Inbox className="size-12 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">No messages yet</p>
        <p className="text-sm text-muted-foreground">
          Messages from SMS, email, and Facebook will appear here.
        </p>
      </div>
    </div>
  );
}
