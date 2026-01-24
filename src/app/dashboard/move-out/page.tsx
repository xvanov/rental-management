"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LogOut,
  Plus,
  Trash2,
  Camera,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TenantMoveOut {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  unitName: string | null;
  unitStatus: string | null;
  propertyAddress: string | null;
  propertyId: string | null;
  jurisdiction: string | null;
  leaseStatus: string | null;
  leaseEndDate: string | null;
  rentAmount: number | null;
  currentBalance: number;
  moveOutInitiated: boolean;
  moveOutDate: string | null;
  inspectionCompleted: boolean;
  dispositionSent: boolean;
}

interface DeductionItem {
  description: string;
  amount: number;
}

export default function MoveOutPage() {
  const [tenants, setTenants] = useState<TenantMoveOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initiate move-out dialog
  const [initiateDialogOpen, setInitiateDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantMoveOut | null>(null);
  const [moveOutDate, setMoveOutDate] = useState("");
  const [initiating, setInitiating] = useState(false);

  // Inspection dialog
  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false);
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [inspectionDeductions, setInspectionDeductions] = useState<DeductionItem[]>([]);
  const [submittingInspection, setSubmittingInspection] = useState(false);

  // Disposition dialog
  const [dispositionDialogOpen, setDispositionDialogOpen] = useState(false);
  const [dispositionDeductions, setDispositionDeductions] = useState<DeductionItem[]>([]);
  const [sendingDisposition, setSendingDisposition] = useState(false);

  const fetchTenants = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/move-out");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setTenants(data.tenants ?? []);
      setError(null);
    } catch {
      setError("Failed to load move-out data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  // ─── Initiate Move-Out ──────────────────────────────────────────────────────

  const handleInitiateMoveOut = async () => {
    if (!selectedTenant || !moveOutDate) return;
    setInitiating(true);
    try {
      const res = await fetch("/api/move-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedTenant.id, moveOutDate }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to initiate move-out");
      }
      setInitiateDialogOpen(false);
      setMoveOutDate("");
      setSelectedTenant(null);
      fetchTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate move-out");
    } finally {
      setInitiating(false);
    }
  };

  // ─── Submit Inspection ──────────────────────────────────────────────────────

  const handleSubmitInspection = async () => {
    if (!selectedTenant) return;
    setSubmittingInspection(true);
    try {
      const res = await fetch("/api/move-out/inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenant.id,
          notes: inspectionNotes || null,
          deductions: inspectionDeductions.filter((d) => d.description && d.amount > 0),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to submit inspection");
      }
      setInspectionDialogOpen(false);
      setInspectionNotes("");
      setInspectionDeductions([]);
      setSelectedTenant(null);
      fetchTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit inspection");
    } finally {
      setSubmittingInspection(false);
    }
  };

  // ─── Send Disposition ───────────────────────────────────────────────────────

  const handleSendDisposition = async () => {
    if (!selectedTenant || !selectedTenant.moveOutDate) return;
    setSendingDisposition(true);
    try {
      const res = await fetch("/api/move-out/disposition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenant.id,
          moveOutDate: selectedTenant.moveOutDate,
          deductions: dispositionDeductions.filter((d) => d.description && d.amount > 0),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to send disposition");
      }
      setDispositionDialogOpen(false);
      setDispositionDeductions([]);
      setSelectedTenant(null);
      fetchTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send disposition");
    } finally {
      setSendingDisposition(false);
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const addDeduction = (list: DeductionItem[], setList: (items: DeductionItem[]) => void) => {
    setList([...list, { description: "", amount: 0 }]);
  };

  const updateDeduction = (
    list: DeductionItem[],
    setList: (items: DeductionItem[]) => void,
    index: number,
    field: keyof DeductionItem,
    value: string | number
  ) => {
    const updated = [...list];
    if (field === "amount") {
      updated[index] = { ...updated[index], amount: Number(value) };
    } else {
      updated[index] = { ...updated[index], description: String(value) };
    }
    setList(updated);
  };

  const removeDeduction = (list: DeductionItem[], setList: (items: DeductionItem[]) => void, index: number) => {
    setList(list.filter((_, i) => i !== index));
  };

  const getStatusBadge = (tenant: TenantMoveOut) => {
    if (tenant.dispositionSent) return <Badge>Completed</Badge>;
    if (tenant.inspectionCompleted) return <Badge variant="secondary">Inspected</Badge>;
    if (tenant.moveOutInitiated) return <Badge variant="outline">Notice Sent</Badge>;
    return <Badge variant="destructive">Active</Badge>;
  };

  const getStepNumber = (tenant: TenantMoveOut) => {
    if (tenant.dispositionSent) return 4;
    if (tenant.inspectionCompleted) return 3;
    if (tenant.moveOutInitiated) return 2;
    return 1;
  };

  // ─── Categorize tenants ─────────────────────────────────────────────────────

  const activeTenants = tenants.filter((t) => !t.moveOutInitiated);
  const inProgressTenants = tenants.filter((t) => t.moveOutInitiated && !t.dispositionSent);
  const completedTenants = tenants.filter((t) => t.dispositionSent);

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const stats = {
    total: tenants.length,
    active: activeTenants.length,
    inProgress: inProgressTenants.length,
    completed: completedTenants.length,
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Move-Out</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Move-Out</h1>
          <p className="text-muted-foreground">Manage move-out process and security deposit reconciliation</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTenants}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-auto">
            Dismiss
          </Button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active (No Notice)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.inProgress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="in-progress">
        <TabsList>
          <TabsTrigger value="active">Active Tenants</TabsTrigger>
          <TabsTrigger value="in-progress">In Progress ({inProgressTenants.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        {/* Active Tenants - Can initiate move-out */}
        <TabsContent value="active">
          {activeTenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
              <LogOut className="h-10 w-10 mb-3" />
              <p>No active tenants available for move-out</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Rent</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Lease End</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeTenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{tenant.name}</div>
                          <div className="text-xs text-muted-foreground">{tenant.email ?? tenant.phone ?? ""}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div>{tenant.unitName}</div>
                          <div className="text-xs text-muted-foreground">{tenant.propertyAddress}</div>
                        </div>
                      </TableCell>
                      <TableCell>${tenant.rentAmount?.toFixed(2) ?? "—"}</TableCell>
                      <TableCell>
                        <span className={tenant.currentBalance > 0 ? "text-destructive font-medium" : ""}>
                          ${tenant.currentBalance.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {tenant.leaseEndDate
                          ? new Date(tenant.leaseEndDate).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedTenant(tenant);
                            setMoveOutDate("");
                            setInitiateDialogOpen(true);
                          }}
                        >
                          <LogOut className="h-3 w-3 mr-1" />
                          Initiate
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* In Progress - Move-out initiated but not completed */}
        <TabsContent value="in-progress">
          {inProgressTenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
              <Clock className="h-10 w-10 mb-3" />
              <p>No move-outs in progress</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Move-Out Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inProgressTenants.map((tenant) => {
                    const step = getStepNumber(tenant);
                    return (
                      <TableRow key={tenant.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{tenant.name}</div>
                            <div className="text-xs text-muted-foreground">{tenant.email ?? tenant.phone ?? ""}</div>
                          </div>
                        </TableCell>
                        <TableCell>{tenant.unitName}</TableCell>
                        <TableCell>
                          {tenant.moveOutDate
                            ? new Date(tenant.moveOutDate).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell>{getStatusBadge(tenant)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <div className={`h-2 w-2 rounded-full ${step >= 2 ? "bg-green-500" : "bg-gray-300"}`} />
                            <div className={`h-2 w-2 rounded-full ${step >= 3 ? "bg-green-500" : "bg-gray-300"}`} />
                            <div className={`h-2 w-2 rounded-full ${step >= 4 ? "bg-green-500" : "bg-gray-300"}`} />
                            <span className="text-xs text-muted-foreground ml-1">{step - 1}/3</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {!tenant.inspectionCompleted ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedTenant(tenant);
                                setInspectionNotes("");
                                setInspectionDeductions([]);
                                setInspectionDialogOpen(true);
                              }}
                            >
                              <Camera className="h-3 w-3 mr-1" />
                              Inspect
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedTenant(tenant);
                                setDispositionDeductions([]);
                                setDispositionDialogOpen(true);
                              }}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Disposition
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Completed Move-Outs */}
        <TabsContent value="completed">
          {completedTenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
              <CheckCircle2 className="h-10 w-10 mb-3" />
              <p>No completed move-outs</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Move-Out Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedTenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{tenant.name}</div>
                          <div className="text-xs text-muted-foreground">{tenant.email ?? tenant.phone ?? ""}</div>
                        </div>
                      </TableCell>
                      <TableCell>{tenant.unitName}</TableCell>
                      <TableCell>
                        {tenant.moveOutDate
                          ? new Date(tenant.moveOutDate).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell>{getStatusBadge(tenant)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Initiate Move-Out Dialog ──────────────────────────────────────────── */}
      <Dialog open={initiateDialogOpen} onOpenChange={setInitiateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Initiate Move-Out</DialogTitle>
            <DialogDescription>
              Start the move-out process for {selectedTenant?.name}. This will terminate their lease and send a move-out notice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Tenant</Label>
              <p className="font-medium">{selectedTenant?.name}</p>
              <p className="text-sm text-muted-foreground">{selectedTenant?.unitName} - {selectedTenant?.propertyAddress}</p>
            </div>
            {selectedTenant && selectedTenant.currentBalance > 0 && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-md">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">Outstanding balance: ${selectedTenant.currentBalance.toFixed(2)}</span>
              </div>
            )}
            <div>
              <Label htmlFor="moveOutDate">Move-Out Date</Label>
              <Input
                id="moveOutDate"
                type="date"
                value={moveOutDate}
                onChange={(e) => setMoveOutDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                NC law requires 30 days for deposit return after this date.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInitiateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleInitiateMoveOut} disabled={!moveOutDate || initiating}>
              {initiating ? "Processing..." : "Initiate Move-Out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Inspection Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={inspectionDialogOpen} onOpenChange={setInspectionDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Move-Out Inspection</DialogTitle>
            <DialogDescription>
              Document the condition of {selectedTenant?.unitName} for {selectedTenant?.name}. Note any damages or issues.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <Label htmlFor="inspectionNotes">Inspection Notes</Label>
              <Textarea
                id="inspectionNotes"
                placeholder="Describe overall condition, any damages found, items left behind, etc."
                value={inspectionNotes}
                onChange={(e) => setInspectionNotes(e.target.value)}
                rows={4}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Deductions (Damages / Cleaning)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addDeduction(inspectionDeductions, setInspectionDeductions)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              {inspectionDeductions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deductions added. Click &quot;Add&quot; to itemize damages.</p>
              ) : (
                <div className="space-y-2">
                  {inspectionDeductions.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder="Description (e.g., Wall damage in bedroom)"
                        value={d.description}
                        onChange={(e) =>
                          updateDeduction(inspectionDeductions, setInspectionDeductions, i, "description", e.target.value)
                        }
                        className="flex-1"
                      />
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={d.amount || ""}
                          onChange={(e) =>
                            updateDeduction(inspectionDeductions, setInspectionDeductions, i, "amount", e.target.value)
                          }
                          className="pl-6"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDeduction(inspectionDeductions, setInspectionDeductions, i)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <div className="text-sm font-medium text-right pr-12">
                    Total: ${inspectionDeductions.reduce((sum, d) => sum + (d.amount || 0), 0).toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInspectionDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitInspection} disabled={submittingInspection}>
              {submittingInspection ? "Submitting..." : "Complete Inspection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Disposition Dialog ────────────────────────────────────────────────── */}
      <Dialog open={dispositionDialogOpen} onOpenChange={setDispositionDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Security Deposit Disposition</DialogTitle>
            <DialogDescription>
              Finalize deductions for {selectedTenant?.name} and send the deposit disposition notice.
              This will deactivate the tenant, mark the unit as vacant, and remove them from the group chat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-muted-foreground">Move-Out Date</Label>
                <p className="font-medium">
                  {selectedTenant?.moveOutDate
                    ? new Date(selectedTenant.moveOutDate).toLocaleDateString()
                    : "—"}
                </p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Outstanding Balance</Label>
                <p className={`font-medium ${selectedTenant && selectedTenant.currentBalance > 0 ? "text-destructive" : ""}`}>
                  ${selectedTenant?.currentBalance.toFixed(2) ?? "0.00"}
                </p>
              </div>
            </div>

            {selectedTenant && selectedTenant.currentBalance > 0 && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-md">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">
                  The outstanding balance of ${selectedTenant.currentBalance.toFixed(2)} will be included as an automatic deduction.
                </span>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Additional Deductions</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addDeduction(dispositionDeductions, setDispositionDeductions)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              {dispositionDeductions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No additional deductions. Click &quot;Add&quot; to itemize.</p>
              ) : (
                <div className="space-y-2">
                  {dispositionDeductions.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder="Description"
                        value={d.description}
                        onChange={(e) =>
                          updateDeduction(dispositionDeductions, setDispositionDeductions, i, "description", e.target.value)
                        }
                        className="flex-1"
                      />
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={d.amount || ""}
                          onChange={(e) =>
                            updateDeduction(dispositionDeductions, setDispositionDeductions, i, "amount", e.target.value)
                          }
                          className="pl-6"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDeduction(dispositionDeductions, setDispositionDeductions, i)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <div className="text-sm font-medium text-right pr-12">
                    Additional Total: ${dispositionDeductions.reduce((sum, d) => sum + (d.amount || 0), 0).toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-muted p-3 rounded-md">
              <p className="text-sm font-medium">What happens next:</p>
              <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                <li>1. Disposition notice generated and emailed to tenant</li>
                <li>2. Unit status updated to Vacant</li>
                <li>3. Tenant deactivated from the system</li>
                <li>4. Tenant removed from property group chat</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispositionDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSendDisposition} disabled={sendingDisposition}>
              {sendingDisposition ? "Processing..." : "Send Disposition Notice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
