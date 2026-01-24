"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldAlert, AlertTriangle, Clock, CheckCircle, Send, Upload, FileText, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  unit?: {
    name: string;
    property: { id: string; address: string };
  } | null;
}

interface Notice {
  id: string;
  tenantId: string;
  type: string;
  status: string;
  content: string;
  sentAt: string | null;
  servedAt: string | null;
  proofOfService: string | null;
  createdAt: string;
  tenant: Tenant;
}

export default function EnforcementPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showProofDialog, setShowProofDialog] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [runningEnforcement, setRunningEnforcement] = useState(false);
  const [enforcementResult, setEnforcementResult] = useState<string | null>(null);

  // Create form state
  const [newNotice, setNewNotice] = useState({
    tenantId: "",
    type: "LATE_RENT",
    content: "",
  });

  // Proof of service state
  const [proofData, setProofData] = useState("");

  const fetchNotices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);

      const res = await fetch(`/api/notices?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setNotices(data.notices ?? []);
      }
    } catch (error) {
      console.error("Failed to fetch notices:", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch("/api/tenants");
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants ?? []);
      }
    } catch {
      // Silently fail - tenants list is for dropdown
    }
  }, []);

  useEffect(() => {
    fetchNotices();
    fetchTenants();
  }, [fetchNotices, fetchTenants]);

  const handleCreateNotice = async () => {
    if (!newNotice.tenantId || !newNotice.content) return;

    try {
      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newNotice),
      });

      if (res.ok) {
        setShowCreateDialog(false);
        setNewNotice({ tenantId: "", type: "LATE_RENT", content: "" });
        fetchNotices();
      }
    } catch (error) {
      console.error("Failed to create notice:", error);
    }
  };

  const handleUpdateStatus = async (noticeId: string, status: string) => {
    try {
      const res = await fetch("/api/notices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noticeId, status }),
      });

      if (res.ok) {
        fetchNotices();
      }
    } catch (error) {
      console.error("Failed to update notice:", error);
    }
  };

  const handleProofOfService = async () => {
    if (!selectedNotice || !proofData) return;

    try {
      const res = await fetch("/api/notices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noticeId: selectedNotice.id,
          proofOfService: proofData,
        }),
      });

      if (res.ok) {
        setShowProofDialog(false);
        setProofData("");
        setSelectedNotice(null);
        fetchNotices();
      }
    } catch (error) {
      console.error("Failed to upload proof:", error);
    }
  };

  const handleRunEnforcement = async () => {
    setRunningEnforcement(true);
    setEnforcementResult(null);

    try {
      const res = await fetch("/api/enforcement/run", { method: "POST" });
      const data = await res.json();
      setEnforcementResult(data.message || data.error || "Enforcement check complete");
      fetchNotices();
    } catch (error) {
      setEnforcementResult("Failed to run enforcement check");
      console.error(error);
    } finally {
      setRunningEnforcement(false);
    }
  };

  // Stats
  const totalNotices = notices.length;
  const activeNotices = notices.filter((n) => n.status === "SENT" || n.status === "SERVED").length;
  const draftNotices = notices.filter((n) => n.status === "DRAFT").length;
  const acknowledgedNotices = notices.filter((n) => n.status === "ACKNOWLEDGED").length;

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "LATE_RENT":
        return <Badge variant="destructive">Late Rent</Badge>;
      case "LEASE_VIOLATION":
        return <Badge variant="destructive">Lease Violation</Badge>;
      case "EVICTION_WARNING":
        return <Badge className="bg-red-800 text-white">Eviction Warning</Badge>;
      case "DEPOSIT_DISPOSITION":
        return <Badge variant="secondary">Deposit</Badge>;
      case "MOVE_OUT":
        return <Badge variant="secondary">Move Out</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <Badge variant="outline">Draft</Badge>;
      case "SENT":
        return <Badge variant="default">Sent</Badge>;
      case "SERVED":
        return <Badge className="bg-amber-600 text-white">Served</Badge>;
      case "ACKNOWLEDGED":
        return <Badge className="bg-green-600 text-white">Acknowledged</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Enforcement</h1>
        <p className="text-muted-foreground mt-1">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Enforcement</h1>
          <p className="text-muted-foreground mt-1">
            Manage notices, violations, and compliance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRunEnforcement} disabled={runningEnforcement}>
            <Play className="mr-2 size-4" />
            {runningEnforcement ? "Running..." : "Run Enforcement Check"}
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <FileText className="mr-2 size-4" />
            Create Notice
          </Button>
        </div>
      </div>

      {enforcementResult && (
        <div className="mt-4 rounded-lg border bg-muted/50 p-3 text-sm">
          {enforcementResult}
        </div>
      )}

      {/* Stats Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Notices</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalNotices}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <AlertTriangle className="size-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeNotices}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <Clock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{draftNotices}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle className="size-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{acknowledgedNotices}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Notices Table */}
      <Tabs defaultValue="all" className="mt-6">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="all" onClick={() => setStatusFilter("all")}>All</TabsTrigger>
            <TabsTrigger value="active" onClick={() => setStatusFilter("SENT")}>Active</TabsTrigger>
            <TabsTrigger value="draft" onClick={() => setStatusFilter("DRAFT")}>Drafts</TabsTrigger>
            <TabsTrigger value="served" onClick={() => setStatusFilter("SERVED")}>Served</TabsTrigger>
            <TabsTrigger value="resolved" onClick={() => setStatusFilter("ACKNOWLEDGED")}>Resolved</TabsTrigger>
          </TabsList>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="LATE_RENT">Late Rent</SelectItem>
              <SelectItem value="LEASE_VIOLATION">Lease Violation</SelectItem>
              <SelectItem value="EVICTION_WARNING">Eviction Warning</SelectItem>
              <SelectItem value="DEPOSIT_DISPOSITION">Deposit</SelectItem>
              <SelectItem value="MOVE_OUT">Move Out</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="all" className="mt-4">
          <NoticesTable
            notices={notices}
            getTypeBadge={getTypeBadge}
            getStatusBadge={getStatusBadge}
            onView={(n) => { setSelectedNotice(n); setShowDetailDialog(true); }}
            onUpdateStatus={handleUpdateStatus}
            onUploadProof={(n) => { setSelectedNotice(n); setShowProofDialog(true); }}
          />
        </TabsContent>
        <TabsContent value="active" className="mt-4">
          <NoticesTable
            notices={notices}
            getTypeBadge={getTypeBadge}
            getStatusBadge={getStatusBadge}
            onView={(n) => { setSelectedNotice(n); setShowDetailDialog(true); }}
            onUpdateStatus={handleUpdateStatus}
            onUploadProof={(n) => { setSelectedNotice(n); setShowProofDialog(true); }}
          />
        </TabsContent>
        <TabsContent value="draft" className="mt-4">
          <NoticesTable
            notices={notices}
            getTypeBadge={getTypeBadge}
            getStatusBadge={getStatusBadge}
            onView={(n) => { setSelectedNotice(n); setShowDetailDialog(true); }}
            onUpdateStatus={handleUpdateStatus}
            onUploadProof={(n) => { setSelectedNotice(n); setShowProofDialog(true); }}
          />
        </TabsContent>
        <TabsContent value="served" className="mt-4">
          <NoticesTable
            notices={notices}
            getTypeBadge={getTypeBadge}
            getStatusBadge={getStatusBadge}
            onView={(n) => { setSelectedNotice(n); setShowDetailDialog(true); }}
            onUpdateStatus={handleUpdateStatus}
            onUploadProof={(n) => { setSelectedNotice(n); setShowProofDialog(true); }}
          />
        </TabsContent>
        <TabsContent value="resolved" className="mt-4">
          <NoticesTable
            notices={notices}
            getTypeBadge={getTypeBadge}
            getStatusBadge={getStatusBadge}
            onView={(n) => { setSelectedNotice(n); setShowDetailDialog(true); }}
            onUpdateStatus={handleUpdateStatus}
            onUploadProof={(n) => { setSelectedNotice(n); setShowProofDialog(true); }}
          />
        </TabsContent>
      </Tabs>

      {/* Create Notice Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Notice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tenant</Label>
              <Select value={newNotice.tenantId} onValueChange={(v) => setNewNotice({ ...newNotice, tenantId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notice Type</Label>
              <Select value={newNotice.type} onValueChange={(v) => setNewNotice({ ...newNotice, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LATE_RENT">Late Rent</SelectItem>
                  <SelectItem value="LEASE_VIOLATION">Lease Violation</SelectItem>
                  <SelectItem value="EVICTION_WARNING">Eviction Warning</SelectItem>
                  <SelectItem value="MOVE_OUT">Move Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notice Content</Label>
              <Textarea
                value={newNotice.content}
                onChange={(e) => setNewNotice({ ...newNotice, content: e.target.value })}
                placeholder="Enter the full notice text..."
                rows={8}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateNotice} disabled={!newNotice.tenantId || !newNotice.content}>
              Create Notice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Notice Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5" />
              Notice Details
            </DialogTitle>
          </DialogHeader>
          {selectedNotice && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {getTypeBadge(selectedNotice.type)}
                {getStatusBadge(selectedNotice.status)}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Tenant:</span>{" "}
                  {selectedNotice.tenant.firstName} {selectedNotice.tenant.lastName}
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>{" "}
                  {new Date(selectedNotice.createdAt).toLocaleDateString()}
                </div>
                {selectedNotice.sentAt && (
                  <div>
                    <span className="text-muted-foreground">Sent:</span>{" "}
                    {new Date(selectedNotice.sentAt).toLocaleDateString()}
                  </div>
                )}
                {selectedNotice.servedAt && (
                  <div>
                    <span className="text-muted-foreground">Served:</span>{" "}
                    {new Date(selectedNotice.servedAt).toLocaleDateString()}
                  </div>
                )}
                {selectedNotice.tenant.unit && (
                  <div>
                    <span className="text-muted-foreground">Unit:</span>{" "}
                    {selectedNotice.tenant.unit.name} - {selectedNotice.tenant.unit.property.address}
                  </div>
                )}
                {selectedNotice.proofOfService && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Proof of Service:</span>{" "}
                    <span className="text-green-600">Uploaded</span>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-muted-foreground">Content</Label>
                <pre className="mt-1 whitespace-pre-wrap rounded-lg border bg-muted/50 p-4 text-sm font-mono">
                  {selectedNotice.content}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Proof of Service Dialog */}
      <Dialog open={showProofDialog} onOpenChange={setShowProofDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Proof of Service</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the URL or description of the proof of service (photo, signed receipt, etc.).
              This will mark the notice as &quot;Served&quot;.
            </p>
            <div>
              <Label>Proof of Service (URL or description)</Label>
              <Textarea
                value={proofData}
                onChange={(e) => setProofData(e.target.value)}
                placeholder="e.g., Photo of notice posted on door, signed receipt from tenant..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowProofDialog(false); setProofData(""); }}>Cancel</Button>
            <Button onClick={handleProofOfService} disabled={!proofData}>
              <Upload className="mr-2 size-4" />
              Submit Proof
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function NoticesTable({
  notices,
  getTypeBadge,
  getStatusBadge,
  onView,
  onUpdateStatus,
  onUploadProof,
}: {
  notices: Notice[];
  getTypeBadge: (type: string) => React.ReactNode;
  getStatusBadge: (status: string) => React.ReactNode;
  onView: (notice: Notice) => void;
  onUpdateStatus: (noticeId: string, status: string) => void;
  onUploadProof: (notice: Notice) => void;
}) {
  if (notices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
        <ShieldAlert className="size-12 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">No notices found</p>
        <p className="text-sm text-muted-foreground">
          Notices matching your filters will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tenant</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {notices.map((notice) => (
            <TableRow key={notice.id}>
              <TableCell>
                <div>
                  <div className="font-medium">
                    {notice.tenant.firstName} {notice.tenant.lastName}
                  </div>
                  {notice.tenant.unit && (
                    <div className="text-xs text-muted-foreground">
                      {notice.tenant.unit.name} - {notice.tenant.unit.property.address}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>{getTypeBadge(notice.type)}</TableCell>
              <TableCell>{getStatusBadge(notice.status)}</TableCell>
              <TableCell className="text-sm">
                {new Date(notice.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-sm">
                {notice.sentAt ? new Date(notice.sentAt).toLocaleDateString() : "—"}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onView(notice)}>
                    View
                  </Button>
                  {notice.status === "DRAFT" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onUpdateStatus(notice.id, "SENT")}
                    >
                      <Send className="mr-1 size-3" />
                      Send
                    </Button>
                  )}
                  {(notice.status === "SENT" || notice.status === "SERVED") && !notice.proofOfService && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onUploadProof(notice)}
                    >
                      <Upload className="mr-1 size-3" />
                      Proof
                    </Button>
                  )}
                  {notice.status === "SENT" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onUpdateStatus(notice.id, "ACKNOWLEDGED")}
                    >
                      <CheckCircle className="mr-1 size-3" />
                      Resolve
                    </Button>
                  )}
                  {notice.status === "SERVED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onUpdateStatus(notice.id, "ACKNOWLEDGED")}
                    >
                      <CheckCircle className="mr-1 size-3" />
                      Resolve
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
