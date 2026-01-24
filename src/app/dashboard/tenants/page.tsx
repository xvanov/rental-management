import { Users } from "lucide-react";

export default function TenantsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
      <p className="text-muted-foreground mt-1">
        View and manage your tenants.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
        <Users className="size-12 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">No tenants yet</p>
        <p className="text-sm text-muted-foreground">
          Tenants will appear here once they are added.
        </p>
      </div>
    </div>
  );
}
