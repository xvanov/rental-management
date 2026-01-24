import { Calendar } from "lucide-react";

export default function CalendarPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
      <p className="text-muted-foreground mt-1">
        Schedule and manage property showings.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
        <Calendar className="size-12 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">No upcoming showings</p>
        <p className="text-sm text-muted-foreground">
          Scheduled showings and appointments will appear here.
        </p>
      </div>
    </div>
  );
}
