"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Plus, MapPin, Home } from "lucide-react";
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

interface Unit {
  id: string;
  name: string;
  status: "VACANT" | "OCCUPIED" | "MAINTENANCE";
  rentAmount: number | null;
  tenants: { id: string; firstName: string; lastName: string }[];
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

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    address: "",
    city: "",
    state: "",
    zip: "",
    jurisdiction: "",
  });

  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch("/api/properties");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setProperties(data);
      setError(null);
    } catch {
      setError("Failed to load properties");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create property");
      }
      setForm({ address: "", city: "", state: "", zip: "", jurisdiction: "" });
      setDialogOpen(false);
      fetchProperties();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create property");
    } finally {
      setCreating(false);
    }
  };

  const getOccupancyRate = (units: Unit[]) => {
    if (units.length === 0) return 0;
    const occupied = units.filter((u) => u.status === "OCCUPIED").length;
    return Math.round((occupied / units.length) * 100);
  };

  const getTotalRevenue = (units: Unit[]) => {
    return units
      .filter((u) => u.status === "OCCUPIED" && u.rentAmount)
      .reduce((sum, u) => sum + (u.rentAmount ?? 0), 0);
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
        <p className="text-muted-foreground mt-1">Loading properties...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
          <p className="text-muted-foreground mt-1">
            Manage your properties and units.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" />
              Add Property
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>Add Property</DialogTitle>
                <DialogDescription>
                  Enter the property details below.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="address">Street Address</Label>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    placeholder="123 Main St"
                    required
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={form.city}
                      onChange={(e) =>
                        setForm({ ...form, city: e.target.value })
                      }
                      placeholder="Durham"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={form.state}
                      onChange={(e) =>
                        setForm({ ...form, state: e.target.value })
                      }
                      placeholder="NC"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="zip">ZIP</Label>
                    <Input
                      id="zip"
                      value={form.zip}
                      onChange={(e) =>
                        setForm({ ...form, zip: e.target.value })
                      }
                      placeholder="27701"
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="jurisdiction">Jurisdiction</Label>
                  <Input
                    id="jurisdiction"
                    value={form.jurisdiction}
                    onChange={(e) =>
                      setForm({ ...form, jurisdiction: e.target.value })
                    }
                    placeholder="Durham County"
                    required
                  />
                </div>
              </div>
              {error && (
                <p className="mt-2 text-sm text-destructive">{error}</p>
              )}
              <DialogFooter className="mt-4">
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create Property"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {properties.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <Building2 className="size-12 text-muted-foreground" />
          <p className="mt-4 text-lg font-medium">No properties yet</p>
          <p className="text-sm text-muted-foreground">
            Add your first property to get started.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => (
            <Link
              key={property.id}
              href={`/dashboard/properties/${property.id}`}
            >
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{property.address}</CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {property.city}, {property.state} {property.zip}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Home className="size-4" />
                      <span>
                        {property.units.length}{" "}
                        {property.units.length === 1 ? "unit" : "units"}
                      </span>
                    </div>
                    <Badge variant="secondary">
                      {getOccupancyRate(property.units)}% occupied
                    </Badge>
                  </div>
                  {property.units.length > 0 && (
                    <div className="mt-3 flex items-center justify-between border-t pt-3">
                      <span className="text-sm text-muted-foreground">
                        Monthly Revenue
                      </span>
                      <span className="text-sm font-medium">
                        ${getTotalRevenue(property.units).toLocaleString()}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
