"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  DollarSign,
  Download,
  Plus,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
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

interface TenantInfo {
  id: string;
  firstName: string;
  lastName: string;
  unit: {
    id: string;
    name: string;
    property: { id: string; address: string };
  } | null;
}

interface Payment {
  id: string;
  tenantId: string;
  amount: number;
  method: string;
  date: string;
  note: string | null;
  createdAt: string;
  tenant: TenantInfo;
}

interface LedgerEntry {
  id: string;
  tenantId: string;
  type: string;
  amount: number;
  description: string | null;
  period: string | null;
  balance: number;
  createdAt: string;
  tenant: TenantInfo;
}

const paymentMethodLabels: Record<string, string> = {
  ZELLE: "Zelle",
  VENMO: "Venmo",
  CASHAPP: "Cash App",
  PAYPAL: "PayPal",
  CASH: "Cash",
  CHECK: "Check",
};

const ledgerTypeLabels: Record<string, string> = {
  RENT: "Rent",
  LATE_FEE: "Late Fee",
  UTILITY: "Utility",
  DEPOSIT: "Deposit",
  CREDIT: "Credit",
  PAYMENT: "Payment",
  DEDUCTION: "Deduction",
};

const ledgerTypeBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  RENT: "default",
  LATE_FEE: "destructive",
  UTILITY: "secondary",
  DEPOSIT: "outline",
  CREDIT: "secondary",
  PAYMENT: "secondary",
  DEDUCTION: "destructive",
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("ledger");

  // Payment form state
  const [paymentForm, setPaymentForm] = useState({
    tenantId: "",
    amount: "",
    method: "ZELLE",
    date: new Date().toISOString().split("T")[0],
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const tenantFilter = selectedTenantFilter !== "all" ? `&tenantId=${selectedTenantFilter}` : "";

      const [paymentsRes, ledgerRes, tenantsRes] = await Promise.all([
        fetch(`/api/payments?limit=100${tenantFilter}`),
        fetch(`/api/ledger?limit=200${tenantFilter}`),
        fetch("/api/tenants"),
      ]);

      if (paymentsRes.ok) {
        const data = await paymentsRes.json();
        setPayments(data.payments || []);
      }

      if (ledgerRes.ok) {
        const data = await ledgerRes.json();
        setLedgerEntries(data.entries || []);
      }

      if (tenantsRes.ok) {
        const data = await tenantsRes.json();
        setTenants(
          (data || []).map((t: TenantInfo & { unit?: TenantInfo["unit"] }) => ({
            id: t.id,
            firstName: t.firstName,
            lastName: t.lastName,
            unit: t.unit,
          }))
        );
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedTenantFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRecordPayment = async () => {
    if (!paymentForm.tenantId || !paymentForm.amount || !paymentForm.date) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: paymentForm.tenantId,
          amount: parseFloat(paymentForm.amount),
          method: paymentForm.method,
          date: paymentForm.date,
          note: paymentForm.note || undefined,
        }),
      });

      if (res.ok) {
        setPaymentDialogOpen(false);
        setPaymentForm({
          tenantId: "",
          amount: "",
          method: "ZELLE",
          date: new Date().toISOString().split("T")[0],
          note: "",
        });
        fetchData();
      }
    } catch (error) {
      console.error("Failed to record payment:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateRent = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/ledger/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rent" }),
      });

      if (res.ok) {
        setGenerateDialogOpen(false);
        fetchData();
      }
    } catch (error) {
      console.error("Failed to generate rent:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyLateFees = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/ledger/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "late-fees" }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Failed to apply late fees:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCSV = async (tenantId: string) => {
    window.open(`/api/ledger/export?tenantId=${tenantId}&format=csv`, "_blank");
  };

  // Calculate summary stats
  const totalReceived = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalCharges = ledgerEntries
    .filter((e) => e.amount > 0)
    .reduce((sum, e) => sum + e.amount, 0);
  const totalCredits = ledgerEntries
    .filter((e) => e.amount < 0)
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  // Get current outstanding balance (sum of latest balance per tenant)
  const tenantBalances = new Map<string, number>();
  for (const entry of ledgerEntries) {
    tenantBalances.set(entry.tenantId, entry.balance);
  }
  const totalOutstanding = Array.from(tenantBalances.values())
    .filter((b) => b > 0)
    .reduce((sum, b) => sum + b, 0);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-muted-foreground mt-1">Loading payment data...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground mt-1">
            Track rent, deposits, and fees.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <RefreshCw className="mr-2 size-4" />
                Generate Rent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Monthly Rent Charges</DialogTitle>
                <DialogDescription>
                  This will create rent charge entries for all active tenants for
                  the current month. Tenants already charged will be skipped.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Button
                  onClick={handleApplyLateFees}
                  variant="destructive"
                  size="sm"
                  disabled={submitting}
                >
                  <AlertTriangle className="mr-2 size-4" />
                  Apply Late Fees
                </Button>
                <p className="text-sm text-muted-foreground">
                  Late fees will be applied to tenants who have not paid rent within the grace period defined in their lease.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleGenerateRent} disabled={submitting}>
                  Generate Rent Charges
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 size-4" />
                Record Payment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
                <DialogDescription>
                  Log a payment received from a tenant.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Tenant</Label>
                  <Select
                    value={paymentForm.tenantId}
                    onValueChange={(v) =>
                      setPaymentForm({ ...paymentForm, tenantId: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.firstName} {t.lastName}
                          {t.unit ? ` (${t.unit.name})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Amount ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={paymentForm.amount}
                      onChange={(e) =>
                        setPaymentForm({ ...paymentForm, amount: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Method</Label>
                    <Select
                      value={paymentForm.method}
                      onValueChange={(v) =>
                        setPaymentForm({ ...paymentForm, method: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(paymentMethodLabels).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={paymentForm.date}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, date: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Note (optional)</Label>
                  <Input
                    placeholder="e.g., January rent"
                    value={paymentForm.note}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, note: e.target.value })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleRecordPayment}
                  disabled={!paymentForm.tenantId || !paymentForm.amount || submitting}
                >
                  Record Payment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Received</CardTitle>
            <TrendingDown className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">{payments.length} payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Charges</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCharges.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">Rent, fees, utilities</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">Payments applied</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <CreditCard className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              ${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">
              {Array.from(tenantBalances.values()).filter((b) => b > 0).length} tenants with balance
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Filter */}
      <div className="mt-6 flex items-center gap-4">
        <Label className="text-sm font-medium">Filter by Tenant:</Label>
        <Select value={selectedTenantFilter} onValueChange={setSelectedTenantFilter}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="All tenants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tenants</SelectItem>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.firstName} {t.lastName}
                {t.unit ? ` (${t.unit.name})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedTenantFilter !== "all" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportCSV(selectedTenantFilter)}
          >
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Tabs: Ledger / Payments */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="mt-4">
          {ledgerEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
              <CreditCard className="size-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">No ledger entries</p>
              <p className="text-sm text-muted-foreground">
                Generate rent charges or record payments to see entries here.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {entry.tenant.firstName} {entry.tenant.lastName}
                        </span>
                        {entry.tenant.unit && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({entry.tenant.unit.name})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.period ? formatPeriodLabel(entry.period) : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ledgerTypeBadgeVariant[entry.type] || "secondary"}>
                          {ledgerTypeLabels[entry.type] || entry.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.description || "-"}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${entry.amount < 0 ? "text-green-600" : ""}`}>
                        {entry.amount < 0 ? "-" : ""}${Math.abs(entry.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${entry.balance > 0 ? "text-destructive" : entry.balance < 0 ? "text-green-600" : ""}`}>
                        ${entry.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          {payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
              <DollarSign className="size-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">No payments recorded</p>
              <p className="text-sm text-muted-foreground">
                Record a payment to get started.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {new Date(payment.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {payment.tenant.firstName} {payment.tenant.lastName}
                        </span>
                        {payment.tenant.unit && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({payment.tenant.unit.name})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-green-600">
                        ${payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {paymentMethodLabels[payment.method] || payment.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {payment.note || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="balances" className="mt-4">
          {tenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
              <CreditCard className="size-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">No tenants</p>
              <p className="text-sm text-muted-foreground">
                Add tenants to track their balances.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((tenant) => {
                    const balance = tenantBalances.get(tenant.id) ?? 0;
                    return (
                      <TableRow key={tenant.id}>
                        <TableCell className="font-medium">
                          {tenant.firstName} {tenant.lastName}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {tenant.unit?.name || "Unassigned"}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${balance > 0 ? "text-destructive" : balance < 0 ? "text-green-600" : ""}`}>
                          ${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          {balance > 0 ? (
                            <Badge variant="destructive">Balance Due</Badge>
                          ) : balance < 0 ? (
                            <Badge variant="secondary">Overpaid</Badge>
                          ) : (
                            <Badge variant="outline">Paid Up</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExportCSV(tenant.id)}
                          >
                            <Download className="mr-1 size-3" />
                            CSV
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatPeriodLabel(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
