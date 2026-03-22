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
  Megaphone,
  Clock,
  Receipt,
  ScrollText,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { PlatformBadges } from "@/components/listings/platform-badges";
import { CreateListingDialog } from "@/components/listings/create-listing-dialog";
import { PublishDialog } from "@/components/listings/publish-dialog";
import { PropertyRulesEditor } from "@/components/property/property-rules-editor";
import { PropertyTimeline } from "@/components/property/property-timeline";

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

interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  status: string;
  platforms: Array<{
    platform: string;
    status?: string;
    externalId?: string;
    postedAt?: string;
    adCampaignId?: string;
    adStatus?: string;
    adBudget?: number;
    adDays?: number;
  }> | null;
  postedAt: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  availableDate: string | null;
  unitId: string | null;
  unit: { name: string } | null;
  photos: string[] | null;
  adCampaignId: string | null;
  adBudget: number | null;
  adDurationDays: number | null;
  createdAt: string;
}

interface TenantHistory {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  moveInDate: string | null;
  moveOutDate: string | null;
  moveOutReason: string | null;
  unit: { name: string } | null;
  leases: Array<{ status: string; startDate: string; endDate: string | null }>;
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
  const [listings, setListings] = useState<Listing[]>([]);
  const [tenantHistory, setTenantHistory] = useState<TenantHistory[]>([]);
  const [createListingOpen, setCreateListingOpen] = useState(false);
  const [editListing, setEditListing] = useState<Listing | null>(null);
  const [publishListing, setPublishListing] = useState<Listing | null>(null);

  const fetchProperty = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties?id=${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
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

  const fetchListings = useCallback(async () => {
    try {
      const res = await fetch(`/api/listings?propertyId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setListings(data.filter((l: Listing) => l.status !== "REMOVED"));
      }
    } catch {}
  }, [id]);

  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties/${id}/tenants`);
      if (res.ok) setTenantHistory(await res.json());
    } catch {}
  }, [id]);

  useEffect(() => {
    fetchProperty();
    fetchListings();
    fetchTenants();
  }, [fetchProperty, fetchListings, fetchTenants]);

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

  const handleListingAction = async (
    listingId: string,
    action: "FILLED" | "REMOVED"
  ) => {
    try {
      if (action === "REMOVED") {
        await fetch(`/api/listings?id=${listingId}`, { method: "DELETE" });
      } else {
        await fetch("/api/listings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: listingId, status: action }),
        });
      }
      fetchListings();
    } catch {}
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
  const activeListingsCount = listings.filter(
    (l) => l.status === "POSTED"
  ).length;

  const currentTenants = tenantHistory.filter((t) => t.active);
  const pastTenants = tenantHistory.filter((t) => !t.active);

  const totalRent = property.units.reduce(
    (sum, u) => sum + (u.rentAmount ?? 0),
    0
  );

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
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Listings</CardTitle>
            <Megaphone className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeListingsCount}</div>
            <p className="text-xs text-muted-foreground">
              posted listings
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="overview" className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">
            <Home className="mr-2 size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="listings">
            <Megaphone className="mr-2 size-4" />
            Listings
          </TabsTrigger>
          <TabsTrigger value="tenants">
            <Users className="mr-2 size-4" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="financials">
            <Receipt className="mr-2 size-4" />
            Financials
          </TabsTrigger>
          <TabsTrigger value="rules">
            <ScrollText className="mr-2 size-4" />
            Rules
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Clock className="mr-2 size-4" />
            Timeline
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="mt-4">
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
                            setUnitForm({
                              ...unitForm,
                              rentAmount: e.target.value,
                            })
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
                          <span className="text-muted-foreground">
                            Tenant:{" "}
                          </span>
                          {unit.tenants
                            .map((t) => `${t.firstName} ${t.lastName}`)
                            .join(", ")}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No tenant
                        </p>
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
        </TabsContent>

        {/* Listings Tab */}
        <TabsContent value="listings">
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Listings</h2>
              <Button size="sm" onClick={() => setCreateListingOpen(true)}>
                <Plus className="mr-2 size-4" />
                Create Listing
              </Button>
            </div>

            {listings.length === 0 ? (
              <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
                <Megaphone className="size-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No listings yet</p>
                <p className="text-xs text-muted-foreground">
                  Create a listing to advertise your vacant units.
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Platforms</TableHead>
                      <TableHead>Ad</TableHead>
                      <TableHead>Posted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listings.map((listing) => (
                      <TableRow key={listing.id}>
                        <TableCell className="font-medium">
                          <div>{listing.title}</div>
                          {listing.unit && (
                            <span className="text-xs text-muted-foreground">
                              {listing.unit.name}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>${listing.price.toLocaleString()}</TableCell>
                        <TableCell>
                          <ListingStatusBadge status={listing.status} />
                        </TableCell>
                        <TableCell>
                          <PlatformBadges platforms={listing.platforms} />
                        </TableCell>
                        <TableCell>
                          {listing.adCampaignId ? (() => {
                            const adEntry = listing.platforms?.find(
                              (p) => p.platform === "FACEBOOK" && p.adCampaignId
                            );
                            const adStatus = adEntry?.adStatus ?? "ACTIVE";
                            return (
                              <div className="text-xs">
                                <Badge
                                  variant={adStatus === "PAUSED" ? "outline" : "default"}
                                  className={adStatus === "ACTIVE" ? "bg-blue-600" : ""}
                                >
                                  {adStatus === "PAUSED" ? "Paused" : "Live"} ${listing.adBudget}/day
                                </Badge>
                                <div className="mt-1 text-muted-foreground">
                                  {listing.adDurationDays}d
                                </div>
                              </div>
                            );
                          })() : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {listing.postedAt
                            ? new Date(listing.postedAt).toLocaleDateString()
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {(listing.status === "DRAFT" || listing.status === "POSTED") && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditListing(listing)}
                              >
                                Edit
                              </Button>
                            )}
                            {listing.status === "DRAFT" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPublishListing(listing)}
                                >
                                  Publish
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() =>
                                    handleListingAction(listing.id, "REMOVED")
                                  }
                                >
                                  Delete
                                </Button>
                              </>
                            )}
                            {listing.status === "POSTED" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleListingAction(listing.id, "FILLED")
                                  }
                                >
                                  Mark Filled
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() =>
                                    handleListingAction(listing.id, "REMOVED")
                                  }
                                >
                                  Remove
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <CreateListingDialog
              propertyId={id}
              units={property.units}
              open={createListingOpen}
              onOpenChange={setCreateListingOpen}
              onCreated={fetchListings}
            />

            {editListing && (
              <CreateListingDialog
                propertyId={id}
                units={property.units}
                open={!!editListing}
                onOpenChange={(open) => {
                  if (!open) setEditListing(null);
                }}
                onCreated={fetchListings}
                editListing={editListing}
              />
            )}

            {publishListing && (
              <PublishDialog
                listing={{
                  id: publishListing.id,
                  title: publishListing.title,
                  property: {
                    city: property.city,
                    state: property.state,
                  },
                }}
                open={!!publishListing}
                onOpenChange={(open) => {
                  if (!open) setPublishListing(null);
                }}
                onPublished={fetchListings}
              />
            )}
          </div>
        </TabsContent>

        {/* Tenants Tab */}
        <TabsContent value="tenants">
          <div className="mt-4 space-y-8">
            {/* Current Tenants */}
            <div>
              <h2 className="text-xl font-semibold">Current Tenants</h2>
              {currentTenants.length === 0 ? (
                <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
                  <Users className="size-8 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">
                    No current tenants
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Active tenants will appear here.
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Move-In</TableHead>
                        <TableHead>Lease Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentTenants.map((tenant) => (
                        <TableRow key={tenant.id}>
                          <TableCell className="font-medium">
                            {tenant.firstName} {tenant.lastName}
                          </TableCell>
                          <TableCell>
                            {tenant.unit?.name ?? "-"}
                          </TableCell>
                          <TableCell>
                            {tenant.moveInDate
                              ? new Date(
                                  tenant.moveInDate
                                ).toLocaleDateString()
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {tenant.leases.length > 0 ? (
                              <Badge
                                variant={
                                  tenant.leases[0].status === "ACTIVE"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {tenant.leases[0].status}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Past Tenants */}
            <div>
              <h2 className="text-xl font-semibold">Past Tenants</h2>
              {pastTenants.length === 0 ? (
                <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
                  <Users className="size-8 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">No past tenants</p>
                  <p className="text-xs text-muted-foreground">
                    Former tenants will appear here.
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Move-In</TableHead>
                        <TableHead>Move-Out</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Lease Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pastTenants.map((tenant) => (
                        <TableRow key={tenant.id}>
                          <TableCell className="font-medium">
                            {tenant.firstName} {tenant.lastName}
                          </TableCell>
                          <TableCell>
                            {tenant.unit?.name ?? "-"}
                          </TableCell>
                          <TableCell>
                            {tenant.moveInDate
                              ? new Date(
                                  tenant.moveInDate
                                ).toLocaleDateString()
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {tenant.moveOutDate
                              ? new Date(
                                  tenant.moveOutDate
                                ).toLocaleDateString()
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {tenant.moveOutReason === "evicted" ? (
                              <Badge variant="destructive">Evicted</Badge>
                            ) : tenant.moveOutReason === "voluntary" ? (
                              <Badge variant="secondary">Voluntary</Badge>
                            ) : tenant.moveOutReason === "lease_ended" ? (
                              <Badge variant="outline">Lease Ended</Badge>
                            ) : tenant.moveOutReason ? (
                              <Badge variant="outline">{tenant.moveOutReason}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {tenant.leases.length > 0 ? (
                              <Badge
                                variant={
                                  tenant.leases[0].status === "ACTIVE"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {tenant.leases[0].status}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Financials Tab */}
        <TabsContent value="financials">
          <div className="mt-4">
            <h2 className="text-xl font-semibold">Rent by Unit</h2>
            <Card className="mt-4">
              <CardContent className="pt-6">
                {property.units.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <DollarSign className="size-8 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">No units yet</p>
                    <p className="text-xs text-muted-foreground">
                      Add units to see financial details.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Unit</TableHead>
                        <TableHead>Rent Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {property.units.map((unit) => (
                        <TableRow key={unit.id}>
                          <TableCell className="font-medium">
                            {unit.name}
                          </TableCell>
                          <TableCell>
                            {unit.rentAmount
                              ? `$${unit.rentAmount.toLocaleString()}`
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusConfig[unit.status].variant}>
                              {statusConfig[unit.status].label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold">
                        <TableCell>Total</TableCell>
                        <TableCell>${totalRent.toLocaleString()}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Rules Tab */}
        <TabsContent value="rules">
          <div className="mt-4">
            <PropertyRulesEditor propertyId={id} />
          </div>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline">
          <div className="mt-4">
            <PropertyTimeline propertyId={id} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
