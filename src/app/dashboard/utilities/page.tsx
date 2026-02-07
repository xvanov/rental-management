"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  Zap,
  Plus,
  DollarSign,
  Clock,
  CheckCircle2,
  Droplets,
  Flame,
  Wifi,
  Trash2,
  Home,
  Building2,
  ExternalLink,
  Phone,
  Pencil,
  ArrowUpDown,
  Calculator,
} from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  UtilityProviderDialog,
  DURHAM_WATER_CONFIG,
  DUKE_ENERGY_CONFIG,
  ENBRIDGE_GAS_CONFIG,
  WAKE_ELECTRIC_CONFIG,
  GRAHAM_UTILITIES_CONFIG,
  SMUD_CONFIG,
  SPECTRUM_CONFIG,
  XFINITY_CONFIG,
} from "@/components/utilities/UtilityProviderDialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PropertyInfo {
  id: string;
  address: string;
  city: string;
  state: string;
}

interface UtilityProvider {
  id: string;
  name: string;
  type: string;
  description: string | null;
  website: string | null;
  phone: string | null;
}

interface UtilityBill {
  id: string;
  propertyId: string;
  provider: string;
  type: string;
  amount: number;
  billingStart: string;
  billingEnd: string;
  period: string;
  allocated: boolean;
  note: string | null;
  createdAt: string;
  property: PropertyInfo;
}

interface TenantSplit {
  tenantId: string;
  name: string;
  unit: string;
  weight: number;
  totalOwed: number;
}

interface TenantSplitData {
  period: string;
  grandTotal: number;
  tenantSummary: TenantSplit[];
}

// Dynamic tenant shares interfaces
interface TenantUtilityShare {
  tenantId: string;
  tenantName: string;
  unitName: string;
  occupantCount: number;
  moveInDate: string | null;
  moveOutDate: string | null;
  sharePercentage: number;
  proRatedFactor: number;
  calculatedAmount: number;
  bills: Array<{
    billId: string;
    provider: string;
    type: string;
    totalAmount: number;
    tenantShare: number;
  }>;
}

interface PropertyUtilitySummary {
  propertyId: string;
  propertyAddress: string;
  period: string;
  totalBillAmount: number;
  totalOccupants: number;
  tenantShares: TenantUtilityShare[];
  bills: Array<{
    id: string;
    provider: string;
    type: string;
    amount: number;
    billingStart: string;
    billingEnd: string;
  }>;
}

interface TenantSharesResponse {
  period: string;
  properties: PropertyUtilitySummary[];
}


interface SummaryData {
  overview: {
    totalBills: number;
    totalAmount: number;
    allocatedAmount: number;
    pendingAmount: number;
    months: number;
  };
  byPeriod: Array<{
    period: string;
    total: number;
    allocated: number;
    pending: number;
  }>;
  byType: Array<{
    type: string;
    total: number;
    count: number;
  }>;
  byProperty: Array<{
    propertyId: string;
    address: string;
    total: number;
    count: number;
    byType: Record<string, number>;
  }>;
  byTenant: Array<{
    tenantId: string;
    name: string;
    unit: string;
    total: number;
    count: number;
  }>;
}

const UTILITY_ICONS: Record<string, React.ReactNode> = {
  electric: <Zap className="h-4 w-4" />,
  gas: <Flame className="h-4 w-4" />,
  water: <Droplets className="h-4 w-4" />,
  internet: <Wifi className="h-4 w-4" />,
  trash: <Trash2 className="h-4 w-4" />,
  sewer: <Droplets className="h-4 w-4" />,
};

const UTILITY_COLORS: Record<string, string> = {
  electric: "text-yellow-600",
  gas: "text-orange-500",
  water: "text-blue-500",
  internet: "text-purple-500",
  trash: "text-gray-500",
  sewer: "text-cyan-600",
};

// Provider configuration for the list
interface ProviderConfig {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

const UTILITY_PROVIDERS: ProviderConfig[] = [
  {
    id: "durham-water",
    name: "Durham Water",
    icon: <Droplets className="h-5 w-5" />,
    color: "text-blue-500",
    description: "Water & sewer services",
  },
  {
    id: "duke-energy",
    name: "Duke Energy",
    icon: <Zap className="h-5 w-5" />,
    color: "text-yellow-500",
    description: "Electric service",
  },
  {
    id: "enbridge-gas",
    name: "Enbridge Gas",
    icon: <Flame className="h-5 w-5" />,
    color: "text-orange-500",
    description: "Natural gas service",
  },
  {
    id: "wake-electric",
    name: "Wake Electric",
    icon: <Zap className="h-5 w-5" />,
    color: "text-amber-500",
    description: "Electric cooperative",
  },
  {
    id: "graham-utilities",
    name: "Graham Utilities",
    icon: <Droplets className="h-5 w-5" />,
    color: "text-cyan-500",
    description: "Water, sewer & refuse (City of Graham)",
  },
  {
    id: "smud",
    name: "SMUD",
    icon: <Zap className="h-5 w-5" />,
    color: "text-purple-500",
    description: "Sacramento electric utility",
  },
  {
    id: "spectrum",
    name: "Spectrum",
    icon: <Wifi className="h-5 w-5" />,
    color: "text-blue-600",
    description: "Internet service",
  },
  {
    id: "xfinity",
    name: "Xfinity",
    icon: <Wifi className="h-5 w-5" />,
    color: "text-purple-600",
    description: "Internet service (Comcast)",
  },
];

// Get current period as YYYY-MM
const getCurrentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export default function UtilitiesPage() {
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [properties, setProperties] = useState<PropertyInfo[]>([]);
  const [providers, setProviders] = useState<UtilityProvider[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [tenantSplits, setTenantSplits] = useState<TenantSplitData | null>(null);
  const [tenantShares, setTenantShares] = useState<TenantSharesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterProperty, setFilterProperty] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<string>(getCurrentPeriod());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<UtilityBill | null>(null);
  const [activeProviderDialog, setActiveProviderDialog] = useState<string | null>(null);

  // Sorting state
  const [billsSort, setBillsSort] = useState<{ column: string; direction: "asc" | "desc" }>({
    column: "billingEnd",
    direction: "desc",
  });

  // Form state for adding bills
  const [formPropertyId, setFormPropertyId] = useState("");
  const [formProviderId, setFormProviderId] = useState("");
  const [formManualType, setFormManualType] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formBillingDateRange, setFormBillingDateRange] = useState<DateRange | undefined>();

  // Edit form state
  const [editAmount, setEditAmount] = useState("");
  const [editPeriod, setEditPeriod] = useState("");
  const [editNote, setEditNote] = useState("");

  // Check if Manual entry is selected
  const isManualEntry = formProviderId === "manual";

  // Get the selected provider's type (or manual type if Manual is selected)
  const selectedProvider = providers.find((p) => p.id === formProviderId);
  const formType = isManualEntry ? formManualType : (selectedProvider?.type || "");

  // Group properties by state -> city
  const groupedProperties = useMemo(() => {
    const groups: Record<string, Record<string, PropertyInfo[]>> = {};
    for (const prop of properties) {
      if (!groups[prop.state]) groups[prop.state] = {};
      if (!groups[prop.state][prop.city]) groups[prop.state][prop.city] = [];
      groups[prop.state][prop.city].push(prop);
    }
    // Sort addresses within each city
    for (const state of Object.keys(groups)) {
      for (const city of Object.keys(groups[state])) {
        groups[state][city].sort((a, b) => a.address.localeCompare(b.address));
      }
    }
    return groups;
  }, [properties]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterProperty && filterProperty !== "all") {
        params.set("propertyId", filterProperty);
      }
      if (filterPeriod) {
        params.set("period", filterPeriod);
      }

      const [billsRes, propsRes, summaryRes, providersRes] = await Promise.all([
        fetch(`/api/utilities?${params.toString()}`),
        fetch("/api/properties"),
        fetch(`/api/utilities/summary?${params.toString()}`),
        fetch("/api/utilities/providers"),
      ]);

      if (billsRes.ok) {
        const data = await billsRes.json();
        setBills(data.bills);
      }
      if (propsRes.ok) {
        const data = await propsRes.json();
        setProperties(data.properties || data);
      }
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
      }
      if (providersRes.ok) {
        const data = await providersRes.json();
        setProviders(data.providers);
      }

      // Fetch tenant splits if a property is selected
      if (filterProperty && filterProperty !== "all") {
        const splitsParams = new URLSearchParams();
        splitsParams.set("propertyId", filterProperty);
        if (filterPeriod) splitsParams.set("period", filterPeriod);

        const splitsRes = await fetch(`/api/utilities/tenant-splits?${splitsParams.toString()}`);
        if (splitsRes.ok) {
          const data = await splitsRes.json();
          setTenantSplits(data);
        }
      } else {
        setTenantSplits(null);
      }

      // Fetch dynamic tenant shares (for Tenant Charges tab)
      const sharesParams = new URLSearchParams();
      if (filterProperty && filterProperty !== "all") {
        sharesParams.set("propertyId", filterProperty);
      }
      if (filterPeriod) {
        sharesParams.set("period", filterPeriod);
      }
      const sharesRes = await fetch(`/api/utilities/tenant-shares?${sharesParams.toString()}`);
      if (sharesRes.ok) {
        const data = await sharesRes.json();
        setTenantShares(data);
      }
    } catch (error) {
      console.error("Failed to fetch utilities data:", error);
    } finally {
      setLoading(false);
    }
  }, [filterProperty, filterPeriod]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle bill editing
  const openEditDialog = (bill: UtilityBill) => {
    setEditingBill(bill);
    setEditAmount(bill.amount.toString());
    setEditPeriod(bill.period);
    setEditNote(bill.note || "");
    setEditDialogOpen(true);
  };

  const handleEditBill = async () => {
    if (!editingBill) return;

    try {
      const res = await fetch("/api/utilities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingBill.id,
          amount: parseFloat(editAmount),
          period: editPeriod,
          note: editNote.trim() || null,
        }),
      });

      if (res.ok) {
        setEditDialogOpen(false);
        setEditingBill(null);
        fetchData();
      }
    } catch (error) {
      console.error("Failed to update bill:", error);
    }
  };

  // Sorting helper
  const sortBills = (billsToSort: UtilityBill[]) => {
    return [...billsToSort].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (billsSort.column) {
        case "period":
          aVal = a.period;
          bVal = b.period;
          break;
        case "property":
          aVal = a.property.address;
          bVal = b.property.address;
          break;
        case "provider":
          aVal = a.provider;
          bVal = b.provider;
          break;
        case "type":
          aVal = a.type;
          bVal = b.type;
          break;
        case "amount":
          aVal = a.amount;
          bVal = b.amount;
          break;
        case "billingEnd":
        default:
          aVal = new Date(a.billingEnd).getTime();
          bVal = new Date(b.billingEnd).getTime();
      }

      if (aVal < bVal) return billsSort.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return billsSort.direction === "asc" ? 1 : -1;
      return 0;
    });
  };

  const toggleSort = (column: string) => {
    setBillsSort((prev) => ({
      column,
      direction: prev.column === column && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleAddBill = async () => {
    if (!formPropertyId || !formProviderId || !formType || !formAmount || !formBillingDateRange?.from || !formBillingDateRange?.to) {
      return;
    }

    // For manual entries, require a note
    if (isManualEntry && !formNote.trim()) {
      return;
    }

    const provider = isManualEntry ? null : providers.find((p) => p.id === formProviderId);
    if (!isManualEntry && !provider) return;

    try {
      const res = await fetch("/api/utilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: formPropertyId,
          provider: isManualEntry ? "Manual" : provider!.name,
          type: formType,
          amount: formAmount,
          billingStart: format(formBillingDateRange.from, "yyyy-MM-dd"),
          billingEnd: format(formBillingDateRange.to, "yyyy-MM-dd"),
          note: formNote.trim() || null,
        }),
      });

      if (res.ok) {
        setAddDialogOpen(false);
        resetForm();
        fetchData();
      }
    } catch (error) {
      console.error("Failed to add utility bill:", error);
    }
  };

  const resetForm = () => {
    setFormPropertyId("");
    setFormProviderId("");
    setFormManualType("");
    setFormNote("");
    setFormAmount("");
    setFormBillingDateRange(undefined);
  };


  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const formatPeriod = (period: string) => {
    const [year, month] = period.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">Utilities</h2>
        </div>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Provider Dialogs */}
      <UtilityProviderDialog
        config={DURHAM_WATER_CONFIG}
        open={activeProviderDialog === "durham-water"}
        onOpenChange={(open) => setActiveProviderDialog(open ? "durham-water" : null)}
        onImportComplete={fetchData}
      />
      <UtilityProviderDialog
        config={DUKE_ENERGY_CONFIG}
        open={activeProviderDialog === "duke-energy"}
        onOpenChange={(open) => setActiveProviderDialog(open ? "duke-energy" : null)}
        onImportComplete={fetchData}
      />
      <UtilityProviderDialog
        config={ENBRIDGE_GAS_CONFIG}
        open={activeProviderDialog === "enbridge-gas"}
        onOpenChange={(open) => setActiveProviderDialog(open ? "enbridge-gas" : null)}
        onImportComplete={fetchData}
      />
      <UtilityProviderDialog
        config={WAKE_ELECTRIC_CONFIG}
        open={activeProviderDialog === "wake-electric"}
        onOpenChange={(open) => setActiveProviderDialog(open ? "wake-electric" : null)}
        onImportComplete={fetchData}
      />
      <UtilityProviderDialog
        config={GRAHAM_UTILITIES_CONFIG}
        open={activeProviderDialog === "graham-utilities"}
        onOpenChange={(open) => setActiveProviderDialog(open ? "graham-utilities" : null)}
        onImportComplete={fetchData}
      />
      <UtilityProviderDialog
        config={SMUD_CONFIG}
        open={activeProviderDialog === "smud"}
        onOpenChange={(open) => setActiveProviderDialog(open ? "smud" : null)}
        onImportComplete={fetchData}
      />
      <UtilityProviderDialog
        config={SPECTRUM_CONFIG}
        open={activeProviderDialog === "spectrum"}
        onOpenChange={(open) => setActiveProviderDialog(open ? "spectrum" : null)}
        onImportComplete={fetchData}
      />
      <UtilityProviderDialog
        config={XFINITY_CONFIG}
        open={activeProviderDialog === "xfinity"}
        onOpenChange={(open) => setActiveProviderDialog(open ? "xfinity" : null)}
        onImportComplete={fetchData}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Utilities</h2>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="w-[150px]"
          />
          <Select value={filterProperty} onValueChange={setFilterProperty}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Properties</SelectItem>
              {Object.entries(groupedProperties).sort().map(([state, cities]) => (
                <SelectGroup key={state}>
                  <SelectLabel className="text-xs text-muted-foreground font-semibold">{state}</SelectLabel>
                  {Object.entries(cities).sort().map(([city, props]) => (
                    props.map((prop) => (
                      <SelectItem key={prop.id} value={prop.id} className="pl-4">
                        {prop.address}, {city}
                      </SelectItem>
                    ))
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Bill
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Utility Bill</DialogTitle>
                <DialogDescription>
                  Enter the utility bill details. After adding, you can allocate the cost to tenants.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="property">Property</Label>
                  <Select value={formPropertyId} onValueChange={setFormPropertyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select property" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(groupedProperties).sort().map(([state, cities]) => (
                        <SelectGroup key={state}>
                          <SelectLabel className="text-xs text-muted-foreground font-semibold">{state}</SelectLabel>
                          {Object.entries(cities).sort().map(([city, props]) => (
                            props.map((prop) => (
                              <SelectItem key={prop.id} value={prop.id} className="pl-4">
                                {prop.address}, {city}
                              </SelectItem>
                            ))
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Select value={formProviderId} onValueChange={(val) => {
                      setFormProviderId(val);
                      if (val !== "manual") setFormManualType("");
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual" className="font-medium text-orange-600">
                          Manual (Custom Entry)
                        </SelectItem>
                        <SelectGroup>
                          <SelectLabel className="text-xs text-muted-foreground">Providers</SelectLabel>
                          {providers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="type">Type</Label>
                    {isManualEntry ? (
                      <Select value={formManualType} onValueChange={setFormManualType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="electric">Electric</SelectItem>
                          <SelectItem value="gas">Gas</SelectItem>
                          <SelectItem value="water">Water</SelectItem>
                          <SelectItem value="internet">Internet</SelectItem>
                          <SelectItem value="trash">Trash</SelectItem>
                          <SelectItem value="sewer">Sewer</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center h-10 px-3 rounded-md border bg-muted text-muted-foreground capitalize">
                        {formType || "Auto-detected"}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                  />
                </div>
                {isManualEntry && (
                  <div className="grid gap-2">
                    <Label htmlFor="note">Note <span className="text-red-500">*</span></Label>
                    <Textarea
                      id="note"
                      placeholder="Explain what this charge is for..."
                      value={formNote}
                      onChange={(e) => setFormNote(e.target.value)}
                      rows={2}
                    />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>Billing Period</Label>
                  <DateRangePicker
                    value={formBillingDateRange}
                    onChange={setFormBillingDateRange}
                    placeholder="Select billing period"
                    fromLabel="Start"
                    toLabel="End"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddBill}
                  disabled={!formPropertyId || !formProviderId || !formType || !formAmount || !formBillingDateRange?.from || !formBillingDateRange?.to || (isManualEntry && !formNote.trim())}
                >
                  Add Bill
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Bill Dialog */}
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Utility Bill</DialogTitle>
                <DialogDescription>
                  Modify the bill details. Changes will be saved immediately.
                </DialogDescription>
              </DialogHeader>
              {editingBill && (
                <div className="grid gap-4 py-4">
                  <div className="text-sm text-muted-foreground">
                    <strong>{editingBill.provider}</strong> - {editingBill.property.address}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="editAmount">Amount</Label>
                      <Input
                        id="editAmount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="editPeriod">Period</Label>
                      <Input
                        id="editPeriod"
                        type="month"
                        value={editPeriod}
                        onChange={(e) => setEditPeriod(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="editNote">Note</Label>
                    <Textarea
                      id="editNote"
                      placeholder="Optional note..."
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleEditBill} disabled={!editAmount || parseFloat(editAmount) <= 0}>
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tenant Split Card - Show when property is selected */}
      {tenantSplits && tenantSplits.tenantSummary.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Tenant Bill Split - {formatPeriod(tenantSplits.period)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tenantSplits.tenantSummary.map((tenant) => (
                <div key={tenant.tenantId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{tenant.name}</div>
                    <div className="text-sm text-muted-foreground">{tenant.unit}</div>
                    <div className="text-xs text-muted-foreground">
                      Weight: {(tenant.weight * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-lg font-bold">
                    {formatCurrency(tenant.totalOwed)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t flex justify-between items-center">
              <span className="text-muted-foreground">Total for period:</span>
              <span className="text-xl font-bold">{formatCurrency(tenantSplits.grandTotal)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bills</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.overview.totalAmount ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.overview.totalBills ?? 0} bills in last {summary?.overview.months ?? 6} months
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Allocated</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(summary?.overview.allocatedAmount ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Split among tenants
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(summary?.overview.pendingAmount ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Not yet allocated
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg/Month</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(
                summary?.overview.months && summary.overview.months > 0
                  ? summary.overview.totalAmount / summary.overview.months
                  : 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Average monthly cost
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Property Utility Cards */}
      {summary?.byProperty && summary.byProperty.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Home className="h-5 w-5" />
            Utilities by Property
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {summary.byProperty.map((prop) => (
              <Card key={prop.propertyId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">{prop.address}</CardTitle>
                  <div className="text-2xl font-bold">{formatCurrency(prop.total)}</div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(prop.byType).map(([type, amount]) => (
                      <div key={type} className="flex items-center justify-between text-sm">
                        <div className={`flex items-center gap-2 ${UTILITY_COLORS[type] || "text-gray-500"}`}>
                          {UTILITY_ICONS[type] || <Zap className="h-4 w-4" />}
                          <span className="capitalize">{type}</span>
                        </div>
                        <span className="font-medium">{formatCurrency(amount)}</span>
                      </div>
                    ))}
                    {Object.keys(prop.byType).length === 0 && (
                      <p className="text-sm text-muted-foreground">No utility bills recorded</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="summary">Monthly Summary</TabsTrigger>
          <TabsTrigger value="tenants">Tenant Charges</TabsTrigger>
        </TabsList>

        {/* Providers Tab */}
        <TabsContent value="providers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Utility Providers
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Import Bills</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((provider) => {
                    const providerSlug = provider.name.toLowerCase().replace(/\s+/g, "-");
                    const hasImporter = UTILITY_PROVIDERS.some((p) => p.id === providerSlug);
                    return (
                      <TableRow key={provider.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-muted ${UTILITY_COLORS[provider.type] || "text-gray-500"}`}>
                              {UTILITY_ICONS[provider.type] || <Zap className="h-4 w-4" />}
                            </div>
                            <div>
                              <div className="font-medium">{provider.name}</div>
                              {provider.description && (
                                <div className="text-sm text-muted-foreground">{provider.description}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {provider.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {provider.phone ? (
                            <a
                              href={`tel:${provider.phone.replace(/[^0-9+]/g, "")}`}
                              className="flex items-center gap-2 text-sm hover:underline"
                            >
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              {provider.phone}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {provider.website ? (
                            <a
                              href={provider.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Visit Site
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {hasImporter ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setActiveProviderDialog(providerSlug)}
                            >
                              Import
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">Manual only</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bills Tab */}
        <TabsContent value="bills" className="space-y-4">
          {bills.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <Zap className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No utility bills found for {formatPeriod(filterPeriod)}</p>
                <p className="text-sm text-muted-foreground">Add a bill or change the period filter</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Button variant="ghost" size="sm" onClick={() => toggleSort("period")} className="h-8 px-2">
                          Period
                          <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" onClick={() => toggleSort("property")} className="h-8 px-2">
                          Property
                          <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" onClick={() => toggleSort("provider")} className="h-8 px-2">
                          Provider
                          <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" onClick={() => toggleSort("type")} className="h-8 px-2">
                          Type
                          <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>Billing Period</TableHead>
                      <TableHead className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => toggleSort("amount")} className="h-8 px-2">
                          Amount
                          <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortBills(bills).map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell className="font-medium">
                          {formatPeriod(bill.period)}
                        </TableCell>
                        <TableCell>{bill.property.address}</TableCell>
                        <TableCell>
                          {bill.provider}
                          {bill.note && (
                            <div className="text-xs text-muted-foreground mt-1 max-w-[150px] truncate" title={bill.note}>
                              {bill.note}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {bill.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(bill.billingStart)} - {formatDate(bill.billingEnd)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(bill.amount)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditDialog(bill)}
                            title="Edit bill"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Monthly Summary Tab */}
        <TabsContent value="summary" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* By Period */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly Totals</CardTitle>
              </CardHeader>
              <CardContent>
                {summary?.byPeriod && summary.byPeriod.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Allocated</TableHead>
                        <TableHead className="text-right">Pending</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.byPeriod.map((row) => (
                        <TableRow key={row.period}>
                          <TableCell className="font-medium">
                            {formatPeriod(row.period)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.total)}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatCurrency(row.allocated)}
                          </TableCell>
                          <TableCell className="text-right text-amber-600">
                            {row.pending > 0 ? formatCurrency(row.pending) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No data available</p>
                )}
              </CardContent>
            </Card>

            {/* By Type */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By Utility Type</CardTitle>
              </CardHeader>
              <CardContent>
                {summary?.byType && summary.byType.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Bills</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.byType.map((row) => (
                        <TableRow key={row.type}>
                          <TableCell className="font-medium capitalize">
                            {row.type}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.count}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No data available</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* By Property */}
          {summary?.byProperty && summary.byProperty.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By Property</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead className="text-right">Bills</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Avg/Bill</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.byProperty.map((row) => (
                      <TableRow key={row.propertyId}>
                        <TableCell className="font-medium">
                          {row.address}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.count}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.total)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(row.total / row.count)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tenant Charges Tab */}
        <TabsContent value="tenants" className="space-y-4">
          {tenantShares?.properties && tenantShares.properties.length > 0 ? (
            <>
              {tenantShares.properties.map((property) => (
                <Card key={property.propertyId}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Home className="h-5 w-5" />
                        {property.propertyAddress}
                      </CardTitle>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">
                          Total Bills: {formatCurrency(property.totalBillAmount)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {property.totalOccupants} occupant{property.totalOccupants !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {property.tenantShares.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tenant</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead className="text-center">Occupants</TableHead>
                            <TableHead className="text-right">Share %</TableHead>
                            <TableHead className="text-right">Pro-rated</TableHead>
                            <TableHead className="text-right">Amount Due</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {property.tenantShares.map((tenant) => (
                            <TableRow key={tenant.tenantId}>
                              <TableCell className="font-medium">
                                {tenant.tenantName}
                              </TableCell>
                              <TableCell>{tenant.unitName}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">
                                  {tenant.occupantCount} {tenant.occupantCount === 1 ? "person" : "people"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {(tenant.sharePercentage * 100).toFixed(1)}%
                              </TableCell>
                              <TableCell className="text-right">
                                {tenant.proRatedFactor < 1 ? (
                                  <Badge variant="outline" className="text-amber-600">
                                    {(tenant.proRatedFactor * 100).toFixed(0)}%
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">100%</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-bold text-lg">
                                {formatCurrency(tenant.calculatedAmount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No active tenants at this property
                      </p>
                    )}

                    {/* Bill breakdown */}
                    {property.bills.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm font-medium mb-2">Bills included:</p>
                        <div className="flex flex-wrap gap-2">
                          {property.bills.map((bill) => (
                            <Badge key={bill.id} variant="outline" className="text-xs">
                              {bill.provider} ({bill.type}): {formatCurrency(bill.amount)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {/* Grand total across all properties */}
              {tenantShares.properties.length > 1 && (
                <Card>
                  <CardContent className="py-4">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Total across all properties:</span>
                      <span className="text-xl font-bold">
                        {formatCurrency(
                          tenantShares.properties.reduce((sum, p) => sum + p.totalBillAmount, 0)
                        )}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <Calculator className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No tenant utility charges for {formatPeriod(filterPeriod)}</p>
                <p className="text-sm text-muted-foreground">
                  Add utility bills to see automatic tenant splits based on occupant count
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
