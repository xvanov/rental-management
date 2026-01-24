import { ShieldAlert } from "lucide-react";

export default function EnforcementPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Enforcement</h1>
      <p className="text-muted-foreground mt-1">
        Manage notices, violations, and compliance.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
        <ShieldAlert className="size-12 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">No active enforcement</p>
        <p className="text-sm text-muted-foreground">
          Violation notices and enforcement actions will appear here.
        </p>
      </div>
    </div>
  );
}
