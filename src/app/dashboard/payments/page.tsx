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
  Check,
  X,
  Bell,
  ShieldAlert,
  FileWarning,
  FileText,
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
  status: string;
  source: string;
  externalId: string | null;
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

interface TenantDocument {
  id: string;
  tenantId: string;
  category: string;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  uploadedAt: string;
}

interface TenantPaymentStatus {
  tenantId: string;
  tenantName: string;
  unitName: string | null;
  propertyAddress: string | null;
  rentAmount: number;
  totalPaid: number;
  remaining: number;
  lateFeeApplied: number;
  status: "paid" | "partial" | "unpaid" | "late" | "not_due";
  activeNotices: Array<{ id: string; type: string; status: string }>;
  materialBreach: boolean;
}

const paymentStatusLabels: Record<string, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
  late: "Late",
  not_due: "Not Due",
};

const paymentStatusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "secondary",
  partial: "outline",
  unpaid: "default",
  late: "destructive",
  not_due: "outline",
};

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
  OPENING_BALANCE: "Opening Balance",
};

const ledgerTypeBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  RENT: "default",
  LATE_FEE: "destructive",
  UTILITY: "secondary",
  DEPOSIT: "outline",
  CREDIT: "secondary",
  PAYMENT: "secondary",
  DEDUCTION: "destructive",
  OPENING_BALANCE: "outline",
};

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  CONFIRMED: "secondary",
  REJECTED: "destructive",
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pendingPayments, setPendingPayments] = useState<Payment[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("monthly");
  const [showPendingReview, setShowPendingReview] = useState(false);
  const [monthlyStatus, setMonthlyStatus] = useState<TenantPaymentStatus[]>([]);
  const [monthlyPeriod, setMonthlyPeriod] = useState("");
  const [tenantDocuments, setTenantDocuments] = useState<TenantDocument[]>([]);

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

      const [paymentsRes, pendingRes, ledgerRes, tenantsRes, statusRes] = await Promise.all([
        fetch(`/api/payments?limit=100${tenantFilter}`),
        fetch("/api/payments?status=PENDING&limit=100"),
        fetch(`/api/ledger?limit=200${tenantFilter}`),
        fetch("/api/tenants"),
        fetch("/api/payments/status"),
      ]);

      if (paymentsRes.ok) {
        const data = await paymentsRes.json();
        setPayments(data.payments || []);
        setPendingCount(data.pendingCount || 0);
      }

      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPendingPayments(data.payments || []);
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

      if (statusRes.ok) {
        const data = await statusRes.json();
        setMonthlyStatus(data.tenants || []);
        setMonthlyPeriod(data.period || "");
      }

      if (selectedTenantFilter !== "all") {
        try {
          const docsRes = await fetch(`/api/tenant-documents/${selectedTenantFilter}`);
          if (docsRes.ok) {
            const data = await docsRes.json();
            setTenantDocuments(data.documents || []);
          }
        } catch { setTenantDocuments([]); }
      } else {
        setTenantDocuments([]);
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

  const handleConfirmPayment = async (paymentId: string, action: "confirm" | "reject") => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments/confirm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, action }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error(`Failed to ${action} payment:`, error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCSV = async (tenantId: string) => {
    window.open(`/api/ledger/export?tenantId=${tenantId}&format=csv`, "_blank");
  };

  // Calculate summary stats
  const confirmedPayments = payments.filter((p) => p.status !== "REJECTED");
  const totalReceived = confirmedPayments.reduce((sum, p) => sum + p.amount, 0);
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

      {/* Pending Payments Banner */}
      {pendingCount > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
          <div className="flex items-center gap-3">
            <Bell className="size-5 text-yellow-600 dark:text-yellow-400" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                {pendingCount} pending payment{pendingCount !== 1 ? "s" : ""} detected
              </p>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Auto-detected from email notifications. Review and confirm or reject.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPendingReview(!showPendingReview)}
            className="border-yellow-300 text-yellow-800 hover:bg-yellow-100 dark:border-yellow-800 dark:text-yellow-200 dark:hover:bg-yellow-900"
          >
            {showPendingReview ? "Hide" : "Review"}
          </Button>
        </div>
      )}

      {/* Pending Payments Review Panel */}
      {showPendingReview && pendingPayments.length > 0 && (
        <div className="mt-4 rounded-lg border p-4">
          <h3 className="mb-3 font-semibold">Pending Payments</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPayments.map((payment) => (
                  <TableRow key={payment.id} className="bg-yellow-50/50 dark:bg-yellow-950/20">
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
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {payment.note || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {payment.source === "EMAIL_IMPORT" ? "Email" : payment.source === "HISTORICAL_IMPORT" ? "Import" : "Manual"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleConfirmPayment(payment.id, "confirm")}
                          disabled={submitting}
                          className="text-green-600 hover:text-green-700"
                        >
                          <Check className="mr-1 size-3" />
                          Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleConfirmPayment(payment.id, "reject")}
                          disabled={submitting}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="mr-1 size-3" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Received</CardTitle>
            <TrendingDown className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">{confirmedPayments.length} payments</p>
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
          <TabsTrigger value="monthly">Current Month</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="mt-4">
          {monthlyStatus.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
              <CreditCard className="size-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">No active leases</p>
              <p className="text-sm text-muted-foreground">
                No active tenants with rent charges for {monthlyPeriod ? formatPeriodLabel(monthlyPeriod) : "this month"}.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Rent Due</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Late Fee</TableHead>
                    <TableHead>Notices</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyStatus.map((tenant) => (
                    <TableRow key={tenant.tenantId} className={tenant.materialBreach ? "bg-red-50/50 dark:bg-red-950/20" : ""}>
                      <TableCell className="font-medium">
                        {tenant.tenantName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {tenant.unitName || "Unassigned"}
                      </TableCell>
                      <TableCell className="text-right">
                        ${tenant.rentAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        ${tenant.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${tenant.remaining > 0 ? "text-destructive" : ""}`}>
                        ${tenant.remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={paymentStatusBadgeVariant[tenant.status] || "outline"}>
                          {paymentStatusLabels[tenant.status] || tenant.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {tenant.lateFeeApplied > 0 ? (
                          <span className="text-sm text-destructive font-medium">
                            ${tenant.lateFeeApplied.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {tenant.materialBreach && (
                            <span title="Material Breach / Eviction Warning">
                              <ShieldAlert className="size-4 text-destructive" />
                            </span>
                          )}
                          {tenant.activeNotices.length > 0 && !tenant.materialBreach && (
                            <span title="Active Notices">
                              <FileWarning className="size-4 text-yellow-600" />
                            </span>
                          )}
                          {tenant.activeNotices.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {tenant.activeNotices.length}
                            </span>
                          )}
                          {tenant.activeNotices.length === 0 && !tenant.materialBreach && (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

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
                    <TableHead>Status</TableHead>
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
                      <TableCell>
                        <Badge variant={statusBadgeVariant[payment.status] || "secondary"}>
                          {payment.status}
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

        <TabsContent value="documents" className="mt-4">
          {selectedTenantFilter === "all" ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
              <FileText className="size-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">Select a tenant</p>
              <p className="text-sm text-muted-foreground">
                Filter by a specific tenant to view their documents.
              </p>
            </div>
          ) : tenantDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
              <FileText className="size-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">No documents</p>
              <p className="text-sm text-muted-foreground">
                No documents on file for this tenant.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {["ID", "PAYSTUB", "BANK_STATEMENT"].map((category) => {
                const docs = tenantDocuments.filter((d) => d.category === category);
                if (docs.length === 0) return null;
                const categoryLabels: Record<string, string> = {
                  ID: "Identification",
                  PAYSTUB: "Pay Stubs",
                  BANK_STATEMENT: "Bank Statements",
                };
                return (
                  <div key={category}>
                    <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {categoryLabels[category] || category} ({docs.length})
                    </h3>
                    <div className="grid gap-2">
                      {docs.map((doc) => (
                        <a
                          key={doc.id}
                          href={`/api/tenant-documents/${doc.tenantId}/${doc.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
                        >
                          <FileText className="size-5 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{doc.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(doc.uploadedAt).toLocaleDateString()}
                              {doc.mimeType && ` · ${doc.mimeType}`}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
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
