"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Home,
  Send,
  Check,
  Clock,
  UserPlus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TenantMoveIn {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  unitName: string | null;
  unitStatus: string | null;
  propertyAddress: string | null;
  propertyId: string | null;
  leaseStatus: string | null;
  rentAmount: number | null;
  startDate: string | null;
  paymentCount: number;
  welcomeSent: boolean;
  welcomeSentAt: string | null;
}

export default function MoveInPage() {
  const [tenants, setTenants] = useState<TenantMoveIn[]>([]);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingWelcome, setSendingWelcome] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showChecklistDialog, setShowChecklistDialog] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantMoveIn | null>(null);
  const [moveInDate, setMoveInDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tenantsRes, checklistRes] = await Promise.all([
        fetch("/api/move-in"),
        fetch("/api/move-in?action=checklist"),
      ]);

      if (tenantsRes.ok) {
        const data = await tenantsRes.json();
        setTenants(data.tenants ?? []);
      }

      if (checklistRes.ok) {
        const data = await checklistRes.json();
        setChecklist(data.checklist ?? []);
      }
    } catch {
      setError("Failed to load move-in data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSendWelcome = async () => {
    if (!selectedTenant) return;
    setSendingWelcome(selectedTenant.id);
    setError(null);

    try {
      const res = await fetch("/api/move-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenant.id,
          moveInDate: moveInDate || undefined,
        }),
      });

      if (res.ok) {
        setShowConfirmDialog(false);
        setSelectedTenant(null);
        setMoveInDate("");
        await fetchData();
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to send welcome");
      }
    } catch {
      setError("Failed to send welcome flow");
    } finally {
      setSendingWelcome(null);
    }
  };

  const openConfirmDialog = (tenant: TenantMoveIn) => {
    setSelectedTenant(tenant);
    setMoveInDate(tenant.startDate ? new Date(tenant.startDate).toISOString().split("T")[0] : "");
    setShowConfirmDialog(true);
    setError(null);
  };

  const readyTenants = tenants.filter((t) => !t.welcomeSent && t.leaseStatus === "ACTIVE");
  const pendingTenants = tenants.filter((t) => !t.welcomeSent && t.leaseStatus === "PENDING_SIGNATURE");
  const completedTenants = tenants.filter((t) => t.welcomeSent);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Move-In</h1>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Move-In</h1>
          <p className="text-muted-foreground">
            Welcome new tenants and manage the move-in process
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowChecklistDialog(true)}>
            <Check className="h-4 w-4 mr-2" />
            View Checklist
          </Button>
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready for Move-In</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{readyTenants.length}</div>
            <p className="text-xs text-muted-foreground">Active lease, awaiting welcome</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Signature</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingTenants.length}</div>
            <p className="text-xs text-muted-foreground">Lease not yet signed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Welcome Sent</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTenants.length}</div>
            <p className="text-xs text-muted-foreground">Move-in process complete</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants.length}</div>
            <p className="text-xs text-muted-foreground">All move-in candidates</p>
          </CardContent>
        </Card>
      </div>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Ready for Move-In */}
      {readyTenants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ready for Move-In</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Rent</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readyTenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {tenant.unitName}
                        {tenant.unitStatus && (
                          <Badge variant={tenant.unitStatus === "OCCUPIED" ? "default" : "secondary"}>
                            {tenant.unitStatus}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{tenant.propertyAddress}</TableCell>
                    <TableCell>{tenant.rentAmount ? `$${tenant.rentAmount.toFixed(2)}` : "-"}</TableCell>
                    <TableCell>
                      {tenant.startDate ? new Date(tenant.startDate).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs">
                        {tenant.phone && <span>{tenant.phone}</span>}
                        {tenant.email && <span className="text-muted-foreground">{tenant.email}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => openConfirmDialog(tenant)}
                        disabled={sendingWelcome === tenant.id}
                      >
                        <Send className="h-3 w-3 mr-1" />
                        {sendingWelcome === tenant.id ? "Sending..." : "Send Welcome"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pending Signature */}
      {pendingTenants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Lease Signature</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Rent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingTenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell>{tenant.unitName}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{tenant.propertyAddress}</TableCell>
                    <TableCell>{tenant.rentAmount ? `$${tenant.rentAmount.toFixed(2)}` : "-"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending Signature
                      </Badge>
                    </TableCell>
                    <TableCell>{tenant.paymentCount} recorded</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Completed Move-Ins */}
      {completedTenants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Completed Move-Ins</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Welcome Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedTenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell>{tenant.unitName}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{tenant.propertyAddress}</TableCell>
                    <TableCell>
                      <Badge variant="default">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Moved In
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {tenant.welcomeSentAt
                        ? new Date(tenant.welcomeSentAt).toLocaleDateString()
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {tenants.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Home className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No Move-In Candidates</h3>
            <p className="text-muted-foreground text-sm text-center mt-1">
              Tenants with active or pending leases will appear here for move-in processing.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Confirm Welcome Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Welcome & Initiate Move-In</DialogTitle>
            <DialogDescription>
              This will send a welcome message via SMS and email, add the tenant to the property
              group chat, and update the unit status to occupied.
            </DialogDescription>
          </DialogHeader>
          {selectedTenant && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Tenant:</span>
                  <p className="font-medium">{selectedTenant.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Unit:</span>
                  <p className="font-medium">{selectedTenant.unitName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone:</span>
                  <p className="font-medium">{selectedTenant.phone ?? "Not provided"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span>
                  <p className="font-medium">{selectedTenant.email ?? "Not provided"}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="moveInDate">Move-In Date</Label>
                <Input
                  id="moveInDate"
                  type="date"
                  value={moveInDate}
                  onChange={(e) => setMoveInDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Defaults to the lease start date if not specified.
                </p>
              </div>
              <div className="bg-muted p-3 rounded-md text-sm">
                <p className="font-medium mb-2">This will:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Send welcome SMS with move-in instructions</li>
                  <li>Send detailed welcome email with house rules and checklist</li>
                  <li>Announce new tenant to existing housemates via group SMS</li>
                  <li>Update unit status to Occupied</li>
                  <li>Log all actions as immutable events</li>
                </ul>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendWelcome}
              disabled={sendingWelcome !== null}
            >
              <Send className="h-4 w-4 mr-2" />
              {sendingWelcome ? "Sending..." : "Send Welcome"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checklist Dialog */}
      <Dialog open={showChecklistDialog} onOpenChange={setShowChecklistDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Move-In Checklist</DialogTitle>
            <DialogDescription>
              These items are included in the welcome email sent to new tenants.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {checklist.map((item, index) => (
              <div key={index} className="flex items-start gap-3 text-sm">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                  {index + 1}
                </div>
                <p className="pt-0.5">{item}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChecklistDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
