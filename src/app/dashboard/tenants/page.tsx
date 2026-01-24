"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users, Plus, Search, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TenantLease {
  id: string;
  status: string;
}

interface TenantPayment {
  id: string;
  amount: number;
  date: string;
}

interface TenantUnit {
  id: string;
  name: string;
  property: { id: string; address: string };
}

interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  createdAt: string;
  unit: TenantUnit | null;
  leases: TenantLease[];
  payments: TenantPayment[];
}

interface UnitOption {
  id: string;
  name: string;
  propertyAddress: string;
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    unitId: "",
  });

  const fetchTenants = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/tenants?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setTenants(data);
      setError(null);
    } catch {
      setError("Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, [search]);

  const fetchUnits = useCallback(async () => {
    try {
      const res = await fetch("/api/properties");
      if (!res.ok) return;
      const properties = await res.json();
      const unitOptions: UnitOption[] = [];
      for (const prop of properties) {
        for (const unit of prop.units) {
          if (unit.status === "VACANT") {
            unitOptions.push({
              id: unit.id,
              name: unit.name,
              propertyAddress: prop.address,
            });
          }
        }
      }
      setUnits(unitOptions);
    } catch {
      // Non-critical, ignore
    }
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  useEffect(() => {
    if (dialogOpen) {
      fetchUnits();
    }
  }, [dialogOpen, fetchUnits]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email || undefined,
          phone: form.phone || undefined,
          unitId: form.unitId || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create tenant");
      }
      setForm({ firstName: "", lastName: "", email: "", phone: "", unitId: "" });
      setDialogOpen(false);
      fetchTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tenant");
    } finally {
      setCreating(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    fetchTenants();
  };

  const activeLeasesCount = tenants.filter(
    (t) => t.leases.length > 0
  ).length;

  const assignedCount = tenants.filter((t) => t.unit !== null).length;

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
        <p className="text-muted-foreground mt-1">Loading tenants...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
          <p className="text-muted-foreground mt-1">
            View and manage your tenants.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" />
              Add Tenant
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>Add Tenant</DialogTitle>
                <DialogDescription>
                  Enter the tenant&apos;s details below.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 grid gap-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={form.firstName}
                      onChange={(e) =>
                        setForm({ ...form, firstName: e.target.value })
                      }
                      placeholder="John"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={form.lastName}
                      onChange={(e) =>
                        setForm({ ...form, lastName: e.target.value })
                      }
                      placeholder="Doe"
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="john@example.com"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    placeholder="(919) 555-1234"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="unitId">Assign to Unit</Label>
                  <Select
                    value={form.unitId}
                    onValueChange={(value) =>
                      setForm({ ...form, unitId: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a vacant unit (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name} - {unit.propertyAddress}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {error && (
                <p className="mt-2 text-sm text-destructive">{error}</p>
              )}
              <DialogFooter className="mt-4">
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Add Tenant"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Leases</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeLeasesCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assigned to Unit</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignedCount}</div>
            <p className="text-xs text-muted-foreground">
              of {tenants.length} tenants
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mt-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {/* Tenant Table */}
      {tenants.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <Users className="size-12 text-muted-foreground" />
          <p className="mt-4 text-lg font-medium">No tenants yet</p>
          <p className="text-sm text-muted-foreground">
            Add your first tenant to get started.
          </p>
        </div>
      ) : (
        <div className="mt-6 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Lease</TableHead>
                <TableHead>Last Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/tenants/${tenant.id}`}
                      className="font-medium hover:underline"
                    >
                      {tenant.firstName} {tenant.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {tenant.email && (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Mail className="size-3" />
                          {tenant.email}
                        </span>
                      )}
                      {tenant.phone && (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Phone className="size-3" />
                          {tenant.phone}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {tenant.unit ? (
                      <span className="text-sm">
                        {tenant.unit.name} - {tenant.unit.property.address}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Unassigned
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {tenant.leases.length > 0 ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">None</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {tenant.payments.length > 0 ? (
                      <span className="text-sm">
                        ${tenant.payments[0].amount.toLocaleString()} on{" "}
                        {new Date(tenant.payments[0].date).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No payments
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
