"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Home,
  MapPin,
  Plus,
  Wrench,
  Users,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
}

interface Unit {
  id: string;
  name: string;
  status: "VACANT" | "OCCUPIED" | "MAINTENANCE";
  rentAmount: number | null;
  tenants: Tenant[];
}

interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  jurisdiction: string;
  createdAt: string;
  units: Unit[];
}

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  VACANT: { label: "Vacant", variant: "secondary" },
  OCCUPIED: { label: "Occupied", variant: "default" },
  MAINTENANCE: { label: "Maintenance", variant: "destructive" },
};

export default function PropertyDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addUnitOpen, setAddUnitOpen] = useState(false);
  const [editUnitId, setEditUnitId] = useState<string | null>(null);
  const [creatingUnit, setCreatingUnit] = useState(false);
  const [unitForm, setUnitForm] = useState({ name: "", rentAmount: "" });
  const [editForm, setEditForm] = useState({
    name: "",
    status: "",
    rentAmount: "",
  });

  const fetchProperty = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties?id=${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      // API returns array, find the specific property
      const prop = Array.isArray(data)
        ? data.find((p: Property) => p.id === id)
        : data;
      if (!prop) throw new Error("Property not found");
      setProperty(prop);
      setError(null);
    } catch {
      setError("Failed to load property");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProperty();
  }, [fetchProperty]);

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUnit(true);
    try {
      const res = await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: unitForm.name,
          propertyId: id,
          rentAmount: unitForm.rentAmount || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create unit");
      }
      setUnitForm({ name: "", rentAmount: "" });
      setAddUnitOpen(false);
      fetchProperty();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create unit");
    } finally {
      setCreatingUnit(false);
    }
  };

  const handleEditUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUnitId) return;
    try {
      const res = await fetch("/api/units", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editUnitId,
          name: editForm.name,
          status: editForm.status,
          rentAmount: editForm.rentAmount || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update unit");
      }
      setEditUnitId(null);
      fetchProperty();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update unit");
    }
  };

  const openEditDialog = (unit: Unit) => {
    setEditUnitId(unit.id);
    setEditForm({
      name: unit.name,
      status: unit.status,
      rentAmount: unit.rentAmount?.toString() ?? "",
    });
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Loading...</h1>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div>
        <Link
          href="/dashboard/properties"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Properties
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Property Not Found</h1>
        <p className="text-muted-foreground mt-1">
          {error || "This property could not be found."}
        </p>
      </div>
    );
  }

  const occupiedCount = property.units.filter(
    (u) => u.status === "OCCUPIED"
  ).length;
  const vacantCount = property.units.filter(
    (u) => u.status === "VACANT"
  ).length;
  const maintenanceCount = property.units.filter(
    (u) => u.status === "MAINTENANCE"
  ).length;
  const totalRevenue = property.units
    .filter((u) => u.status === "OCCUPIED" && u.rentAmount)
    .reduce((sum, u) => sum + (u.rentAmount ?? 0), 0);
  const occupancyRate =
    property.units.length > 0
      ? Math.round((occupiedCount / property.units.length) * 100)
      : 0;

  return (
    <div>
      <Link
        href="/dashboard/properties"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Properties
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {property.address}
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-1">
            <MapPin className="size-3" />
            {property.city}, {property.state} {property.zip} &middot;{" "}
            {property.jurisdiction}
          </p>
        </div>
      </div>

      {/* Property Stats */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Units</CardTitle>
            <Home className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{property.units.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{occupancyRate}%</div>
            <p className="text-xs text-muted-foreground">
              {occupiedCount} occupied, {vacantCount} vacant
              {maintenanceCount > 0 && `, ${maintenanceCount} maintenance`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalRevenue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              from occupied units
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
            <Wrench className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{maintenanceCount}</div>
            <p className="text-xs text-muted-foreground">
              units in maintenance
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Units Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Units</h2>
            <p className="text-sm text-muted-foreground">
              Manage rooms and units for this property.
            </p>
          </div>
          <Dialog open={addUnitOpen} onOpenChange={setAddUnitOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 size-4" />
                Add Unit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAddUnit}>
                <DialogHeader>
                  <DialogTitle>Add Unit</DialogTitle>
                  <DialogDescription>
                    Add a new room or unit to this property.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="unit-name">Unit Name</Label>
                    <Input
                      id="unit-name"
                      value={unitForm.name}
                      onChange={(e) =>
                        setUnitForm({ ...unitForm, name: e.target.value })
                      }
                      placeholder="Room A"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="unit-rent">Monthly Rent ($)</Label>
                    <Input
                      id="unit-rent"
                      type="number"
                      step="0.01"
                      min="0"
                      value={unitForm.rentAmount}
                      onChange={(e) =>
                        setUnitForm({ ...unitForm, rentAmount: e.target.value })
                      }
                      placeholder="750"
                    />
                  </div>
                </div>
                <DialogFooter className="mt-4">
                  <Button type="submit" disabled={creatingUnit}>
                    {creatingUnit ? "Adding..." : "Add Unit"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {property.units.length === 0 ? (
          <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
            <Building2 className="size-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No units yet</p>
            <p className="text-xs text-muted-foreground">
              Add rooms or units to this property.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {property.units.map((unit) => (
              <Card key={unit.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{unit.name}</CardTitle>
                    <Badge variant={statusConfig[unit.status].variant}>
                      {statusConfig[unit.status].label}
                    </Badge>
                  </div>
                  {unit.rentAmount && (
                    <CardDescription>
                      ${unit.rentAmount.toLocaleString()}/mo
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {unit.tenants.length > 0 ? (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Tenant: </span>
                      {unit.tenants
                        .map((t) => `${t.firstName} ${t.lastName}`)
                        .join(", ")}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No tenant</p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => openEditDialog(unit)}
                  >
                    Edit Unit
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Unit Dialog */}
      <Dialog
        open={editUnitId !== null}
        onOpenChange={(open) => {
          if (!open) setEditUnitId(null);
        }}
      >
        <DialogContent>
          <form onSubmit={handleEditUnit}>
            <DialogHeader>
              <DialogTitle>Edit Unit</DialogTitle>
              <DialogDescription>
                Update unit details and status.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Unit Name</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(value) =>
                    setEditForm({ ...editForm, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VACANT">Vacant</SelectItem>
                    <SelectItem value="OCCUPIED">Occupied</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-rent">Monthly Rent ($)</Label>
                <Input
                  id="edit-rent"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.rentAmount}
                  onChange={(e) =>
                    setEditForm({ ...editForm, rentAmount: e.target.value })
                  }
                  placeholder="750"
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
