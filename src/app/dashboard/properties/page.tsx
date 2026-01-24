import { Building2 } from "lucide-react";

export default function PropertiesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
      <p className="text-muted-foreground mt-1">
        Manage your properties and units.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
        <Building2 className="size-12 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">No properties yet</p>
        <p className="text-sm text-muted-foreground">
          Add your first property to get started.
        </p>
      </div>
    </div>
  );
}
