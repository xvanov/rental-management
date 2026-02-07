"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  FileText,
  Plus,
  Search,
  FilePlus2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRangePicker } from "@/components/ui/date-range-picker";

interface Lease {
  id: string;
  status: string;
  content: string;
  rentAmount: number | null;
  version: number;
  startDate: string;
  endDate: string | null;
  signedAt: string | null;
  createdAt: string;
  tenant: { id: string; firstName: string; lastName: string };
  unit: { name: string; property: { id: string; address: string } };
  template: { id: string; name: string } | null;
  _count: { clauses: number };
}

interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  unitId: string | null;
  unit?: {
    id: string;
    name: string;
    property: { id: string; address: string };
  } | null;
}

interface Unit {
  id: string;
  name: string;
  propertyId: string;
  rentAmount: number | null;
  property?: { address: string };
}

interface Template {
  id: string;
  name: string;
}

export default function LeasesPage() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Generate form state
  const [genTemplateId, setGenTemplateId] = useState("");
  const [genTenantId, setGenTenantId] = useState("");
  const [genUnitId, setGenUnitId] = useState("");
  const [genDateRange, setGenDateRange] = useState<DateRange | undefined>();
  const [genRentAmount, setGenRentAmount] = useState("");
  const [genSecurityDeposit, setGenSecurityDeposit] = useState("");
  const [genLessorName, setGenLessorName] = useState("");
  const [genError, setGenError] = useState<string | null>(null);

  const fetchLeases = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/leases?${params.toString()}`);
      if (res.ok) {
        setLeases(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch leases:", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchFormData = useCallback(async () => {
    try {
      const [tenantsRes, templatesRes] = await Promise.all([
        fetch("/api/tenants"),
        fetch("/api/lease-templates"),
      ]);
      if (tenantsRes.ok) setTenants(await tenantsRes.json());
      if (templatesRes.ok) setTemplates(await templatesRes.json());
    } catch (error) {
      console.error("Failed to fetch form data:", error);
    }
  }, []);

  const fetchUnits = useCallback(async () => {
    try {
      const res = await fetch("/api/properties");
      if (res.ok) {
        const properties = await res.json();
        const allUnits: Unit[] = [];
        for (const prop of properties) {
          for (const unit of prop.units || []) {
            allUnits.push({ ...unit, property: { address: prop.address } });
          }
        }
        setUnits(allUnits);
      }
    } catch (error) {
      console.error("Failed to fetch units:", error);
    }
  }, []);

  useEffect(() => {
    fetchLeases();
    fetchFormData();
    fetchUnits();
  }, [fetchLeases, fetchFormData, fetchUnits]);

  // Get selected tenant details for display
  const selectedTenant = useMemo(() => {
    if (!genTenantId) return null;
    return tenants.find(t => t.id === genTenantId) || null;
  }, [genTenantId, tenants]);

  // Group and sort tenants by property address, then alphabetically by name
  const tenantsGroupedByProperty = useMemo(() => {
    const grouped = new Map<string, Tenant[]>();
    const noProperty: Tenant[] = [];

    for (const tenant of tenants) {
      if (tenant.unit?.property?.address) {
        const address = tenant.unit.property.address;
        if (!grouped.has(address)) {
          grouped.set(address, []);
        }
        grouped.get(address)!.push(tenant);
      } else {
        noProperty.push(tenant);
      }
    }

    // Sort tenants within each group alphabetically
    const sortTenants = (a: Tenant, b: Tenant) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    };

    // Sort property addresses and build result
    const sortedAddresses = Array.from(grouped.keys()).sort();
    const result: { address: string; tenants: Tenant[] }[] = [];

    for (const address of sortedAddresses) {
      result.push({
        address,
        tenants: grouped.get(address)!.sort(sortTenants),
      });
    }

    // Add tenants without property at the end
    if (noProperty.length > 0) {
      result.push({
        address: "No Property Assigned",
        tenants: noProperty.sort(sortTenants),
      });
    }

    return result;
  }, [tenants]);

  const handleGenerate = async () => {
    if (!genTemplateId || !genTenantId || !genUnitId || !genDateRange?.from || !genRentAmount || !genSecurityDeposit || !genLessorName) return;

    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/leases/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: genTemplateId,
          tenantId: genTenantId,
          unitId: genUnitId,
          startDate: format(genDateRange.from, "yyyy-MM-dd"),
          endDate: genDateRange.to ? format(genDateRange.to, "yyyy-MM-dd") : undefined,
          rentAmount: genRentAmount,
          securityDeposit: genSecurityDeposit,
          lessorName: genLessorName,
        }),
      });
      if (res.ok) {
        setGenerateDialogOpen(false);
        setGenTemplateId("");
        setGenTenantId("");
        setGenUnitId("");
        setGenDateRange(undefined);
        setGenRentAmount("");
        setGenSecurityDeposit("");
        setGenLessorName("");
        setGenError(null);
        fetchLeases();
      } else {
        const data = await res.json();
        setGenError(data.error || "Failed to generate lease");
      }
    } catch (error) {
      console.error("Failed to generate lease:", error);
      setGenError("Failed to generate lease. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "default" as const;
      case "DRAFT":
        return "secondary" as const;
      case "PENDING_SIGNATURE":
        return "outline" as const;
      case "EXPIRED":
      case "TERMINATED":
        return "destructive" as const;
      default:
        return "secondary" as const;
    }
  };

  const filteredLeases = leases.filter((lease) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const tenantName = `${lease.tenant.firstName} ${lease.tenant.lastName}`.toLowerCase();
    return (
      tenantName.includes(searchLower) ||
      lease.unit.name.toLowerCase().includes(searchLower) ||
      lease.unit.property.address.toLowerCase().includes(searchLower)
    );
  });

  const stats = {
    total: leases.length,
    active: leases.filter((l) => l.status === "ACTIVE").length,
    draft: leases.filter((l) => l.status === "DRAFT").length,
    pending: leases.filter((l) => l.status === "PENDING_SIGNATURE").length,
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading leases...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leases</h1>
          <p className="text-muted-foreground">
            Manage lease agreements and templates
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/leases/templates">
              <FileText className="mr-2 h-4 w-4" />
              Templates
            </Link>
          </Button>
          <Dialog open={generateDialogOpen} onOpenChange={(open) => {
            setGenerateDialogOpen(open);
            if (!open) setGenError(null);
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Generate Lease
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Generate Lease from Template</DialogTitle>
                <DialogDescription>
                  Select a template, tenant, and unit to generate a new lease. The tenant will fill in their name and sign when they receive it.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Template</Label>
                  <Select value={genTemplateId} onValueChange={setGenTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Send to Tenant</Label>
                  <Select value={genTenantId} onValueChange={setGenTenantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tenant to send lease to" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenantsGroupedByProperty.map((group) => (
                        <SelectGroup key={group.address}>
                          <SelectLabel className="text-xs text-muted-foreground">
                            {group.address}
                          </SelectLabel>
                          {group.tenants.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.firstName} {t.lastName}
                              {t.unit && (
                                <span className="text-muted-foreground ml-1">
                                  ({t.unit.name})
                                </span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTenant && !selectedTenant.email && (
                    <p className="text-xs text-destructive mt-1">
                      Warning: This tenant has no email address for e-signing
                    </p>
                  )}
                </div>
                <div>
                  <Label>Unit</Label>
                  <Select value={genUnitId} onValueChange={setGenUnitId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} - {u.property?.address}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Lessor Name <span className="text-destructive">*</span></Label>
                  <Input
                    type="text"
                    placeholder="Name of the lessor/landlord"
                    value={genLessorName}
                    onChange={(e) => setGenLessorName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Lease Term <span className="text-destructive">*</span></Label>
                  <DateRangePicker
                    value={genDateRange}
                    onChange={setGenDateRange}
                    placeholder="Select start and end dates"
                    fromLabel="Start"
                    toLabel="End"
                  />
                </div>
                <div>
                  <Label>Monthly Rent <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Monthly rent amount"
                    value={genRentAmount}
                    onChange={(e) => setGenRentAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Security Deposit <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Security deposit amount"
                    value={genSecurityDeposit}
                    onChange={(e) => setGenSecurityDeposit(e.target.value)}
                  />
                </div>
                {genError && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {genError}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={handleGenerate}
                  disabled={
                    !genTemplateId ||
                    !genTenantId ||
                    !genUnitId ||
                    !genDateRange?.from ||
                    !genRentAmount ||
                    !genSecurityDeposit ||
                    !genLessorName ||
                    generating
                  }
                >
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  {generating ? "Generating..." : "Generate Lease"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Leases
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Drafts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.draft}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Signature
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by tenant, unit, or address..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="PENDING_SIGNATURE">Pending Signature</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
            <SelectItem value="TERMINATED">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Leases Table */}
      {filteredLeases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed rounded-lg">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No leases found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Generate a lease from a template to get started
          </p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rent</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Template</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeases.map((lease) => (
                <TableRow key={lease.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/tenants/${lease.tenant.id}`}
                      className="font-medium hover:underline"
                    >
                      {lease.tenant.firstName} {lease.tenant.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{lease.unit.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {lease.unit.property.address}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(lease.status)}>
                      {lease.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {lease.rentAmount
                      ? `$${lease.rentAmount.toFixed(2)}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {new Date(lease.startDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell>v{lease.version}</TableCell>
                  <TableCell>
                    {lease.template ? (
                      <span className="text-sm">{lease.template.name}</span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/dashboard/leases/${lease.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
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
