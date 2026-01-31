"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Zap,
  Plus,
  DollarSign,
  ArrowRightLeft,
  Clock,
  CheckCircle2,
  Droplets,
  Flame,
  Wifi,
  Trash2,
  Home,
  ChevronRight,
  Building2,
} from "lucide-react";
import {
  UtilityProviderDialog,
  DURHAM_WATER_CONFIG,
  DUKE_ENERGY_CONFIG,
  ENBRIDGE_GAS_CONFIG,
  WAKE_ELECTRIC_CONFIG,
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
import {
  Select,
  SelectContent,
  SelectItem,
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
  createdAt: string;
  property: PropertyInfo;
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

const UTILITY_TYPES = [
  "Electric",
  "Gas",
  "Water",
  "Internet",
  "Trash",
  "Sewer",
  "Other",
];

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
];

export default function UtilitiesPage() {
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [properties, setProperties] = useState<PropertyInfo[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterProperty, setFilterProperty] = useState<string>("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [allocating, setAllocating] = useState<string | null>(null);
  const [activeProviderDialog, setActiveProviderDialog] = useState<string | null>(null);

  // Form state
  const [formPropertyId, setFormPropertyId] = useState("");
  const [formProvider, setFormProvider] = useState("");
  const [formType, setFormType] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formBillingStart, setFormBillingStart] = useState("");
  const [formBillingEnd, setFormBillingEnd] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterProperty && filterProperty !== "all") {
        params.set("propertyId", filterProperty);
      }

      const [billsRes, propsRes, summaryRes] = await Promise.all([
        fetch(`/api/utilities?${params.toString()}`),
        fetch("/api/properties"),
        fetch(`/api/utilities/summary?${params.toString()}`),
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
    } catch (error) {
      console.error("Failed to fetch utilities data:", error);
    } finally {
      setLoading(false);
    }
  }, [filterProperty]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddBill = async () => {
    if (!formPropertyId || !formProvider || !formType || !formAmount || !formBillingStart || !formBillingEnd) {
      return;
    }

    try {
      const res = await fetch("/api/utilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: formPropertyId,
          provider: formProvider,
          type: formType,
          amount: formAmount,
          billingStart: formBillingStart,
          billingEnd: formBillingEnd,
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

  const handleAllocate = async (billId: string) => {
    setAllocating(billId);
    try {
      const res = await fetch("/api/utilities/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billId }),
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to allocate bill");
      }
    } catch (error) {
      console.error("Failed to allocate utility bill:", error);
    } finally {
      setAllocating(null);
    }
  };

  const resetForm = () => {
    setFormPropertyId("");
    setFormProvider("");
    setFormType("");
    setFormAmount("");
    setFormBillingStart("");
    setFormBillingEnd("");
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

      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Utilities</h2>
        <div className="flex items-center gap-2">
          <Select value={filterProperty} onValueChange={setFilterProperty}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Properties</SelectItem>
              {properties.map((prop) => (
                <SelectItem key={prop.id} value={prop.id}>
                  {prop.address}
                </SelectItem>
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
                      {properties.map((prop) => (
                        <SelectItem key={prop.id} value={prop.id}>
                          {prop.address}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Input
                      id="provider"
                      placeholder="e.g., Duke Energy"
                      value={formProvider}
                      onChange={(e) => setFormProvider(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="type">Type</Label>
                    <Select value={formType} onValueChange={setFormType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {UTILITY_TYPES.map((t) => (
                          <SelectItem key={t} value={t.toLowerCase()}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="billingStart">Billing Start</Label>
                    <Input
                      id="billingStart"
                      type="date"
                      value={formBillingStart}
                      onChange={(e) => setFormBillingStart(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="billingEnd">Billing End</Label>
                    <Input
                      id="billingEnd"
                      type="date"
                      value={formBillingEnd}
                      onChange={(e) => setFormBillingEnd(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddBill}
                  disabled={!formPropertyId || !formProvider || !formType || !formAmount || !formBillingStart || !formBillingEnd}
                >
                  Add Bill
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

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
              <div className="divide-y">
                {UTILITY_PROVIDERS.map((provider) => (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setActiveProviderDialog(provider.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg bg-muted ${provider.color}`}>
                        {provider.icon}
                      </div>
                      <div>
                        <div className="font-medium">{provider.name}</div>
                        <div className="text-sm text-muted-foreground">{provider.description}</div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bills Tab */}
        <TabsContent value="bills" className="space-y-4">
          {bills.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <Zap className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No utility bills found</p>
                <p className="text-sm text-muted-foreground">Add a bill to get started</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Billing Period</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell className="font-medium">
                          {formatPeriod(bill.period)}
                        </TableCell>
                        <TableCell>{bill.property.address}</TableCell>
                        <TableCell>{bill.provider}</TableCell>
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
                          {bill.allocated ? (
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Allocated
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-600 border-amber-600">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!bill.allocated && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAllocate(bill.id)}
                              disabled={allocating === bill.id}
                            >
                              <ArrowRightLeft className="h-3 w-3 mr-1" />
                              {allocating === bill.id ? "Allocating..." : "Allocate"}
                            </Button>
                          )}
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
          {summary?.byTenant && summary.byTenant.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Utility Charges by Tenant</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Charges</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Avg/Charge</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.byTenant.map((row) => (
                      <TableRow key={row.tenantId}>
                        <TableCell className="font-medium">
                          {row.name}
                        </TableCell>
                        <TableCell>{row.unit}</TableCell>
                        <TableCell className="text-right">
                          {row.count}
                        </TableCell>
                        <TableCell className="text-right font-medium">
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
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <ArrowRightLeft className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No tenant utility charges found</p>
                <p className="text-sm text-muted-foreground">
                  Allocate utility bills to split costs among tenants
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
