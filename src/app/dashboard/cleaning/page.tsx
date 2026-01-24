"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles,
  ClipboardCheck,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Copy,
  Eye,
} from "lucide-react";

interface CleaningAssignment {
  id: string;
  token: string;
  weekOf: string;
  status: string;
  photos: Array<{ name: string; submittedAt: string }> | null;
  validatedAt: string | null;
  notes: string | null;
  createdAt: string;
  tenant: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
  unit: { id: string; name: string; property: { id: string; address: string } };
}

export default function CleaningPage() {
  const [assignments, setAssignments] = useState<CleaningAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [generating, setGenerating] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<CleaningAssignment | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [validating, setValidating] = useState(false);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (propertyFilter !== "all") params.append("propertyId", propertyFilter);

      const res = await fetch(`/api/cleaning-assignments?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAssignments(data);
      }
    } catch (error) {
      console.error("Error fetching assignments:", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, propertyFilter]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/cleaning-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      if (res.ok) {
        await fetchAssignments();
      }
    } catch (error) {
      console.error("Error generating assignments:", error);
    } finally {
      setGenerating(false);
    }
  };

  const handleValidate = async (assignmentId: string, action: "validate" | "fail") => {
    setValidating(true);
    try {
      const res = await fetch("/api/cleaning-assignments/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, action }),
      });
      if (res.ok) {
        setDetailOpen(false);
        await fetchAssignments();
      }
    } catch (error) {
      console.error("Error validating assignment:", error);
    } finally {
      setValidating(false);
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/cleaning/${token}`;
    navigator.clipboard.writeText(url);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "SUBMITTED":
        return <Badge variant="default"><ClipboardCheck className="h-3 w-3 mr-1" />Submitted</Badge>;
      case "VALIDATED":
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Validated</Badge>;
      case "FAILED":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case "OVERDUE":
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Stats
  const stats = {
    total: assignments.length,
    pending: assignments.filter((a) => a.status === "PENDING").length,
    submitted: assignments.filter((a) => a.status === "SUBMITTED").length,
    validated: assignments.filter((a) => a.status === "VALIDATED").length,
    overdue: assignments.filter((a) => a.status === "OVERDUE" || a.status === "FAILED").length,
  };

  // Properties for filter
  const properties = Array.from(
    new Map(
      assignments.map((a) => [a.unit.property.id, a.unit.property])
    ).values()
  );

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Cleaning</h2>
          <p className="text-muted-foreground">Manage weekly cleaning assignments and submissions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchAssignments}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleGenerate} disabled={generating}>
            <Sparkles className="h-4 w-4 mr-2" />
            {generating ? "Generating..." : "Generate This Week"}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Submitted</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.submitted}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Validated</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.validated}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue/Failed</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.overdue}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Properties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.address}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="PENDING">Pending</TabsTrigger>
          <TabsTrigger value="SUBMITTED">Submitted</TabsTrigger>
          <TabsTrigger value="VALIDATED">Validated</TabsTrigger>
          <TabsTrigger value="OVERDUE">Overdue</TabsTrigger>
          <TabsTrigger value="FAILED">Failed</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">Loading...</div>
              ) : assignments.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <Sparkles className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">No cleaning assignments found</p>
                  <p className="text-sm text-muted-foreground">Click &quot;Generate This Week&quot; to create assignments</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Week Of</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Photos</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell>
                          {new Date(assignment.weekOf).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {assignment.tenant.firstName} {assignment.tenant.lastName}
                        </TableCell>
                        <TableCell>{assignment.unit.property.address}</TableCell>
                        <TableCell>{getStatusBadge(assignment.status)}</TableCell>
                        <TableCell>
                          {assignment.photos && Array.isArray(assignment.photos)
                            ? `${(assignment.photos as unknown[]).length} photos`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedAssignment(assignment);
                                setDetailOpen(true);
                              }}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyLink(assignment.token)}
                              title="Copy submission link"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assignment Details</DialogTitle>
          </DialogHeader>
          {selectedAssignment && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Tenant:</span>
                  <p className="font-medium">
                    {selectedAssignment.tenant.firstName} {selectedAssignment.tenant.lastName}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Property:</span>
                  <p className="font-medium">{selectedAssignment.unit.property.address}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Week Of:</span>
                  <p className="font-medium">
                    {new Date(selectedAssignment.weekOf).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p>{getStatusBadge(selectedAssignment.status)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Unit:</span>
                  <p className="font-medium">{selectedAssignment.unit.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <p className="font-medium">
                    {new Date(selectedAssignment.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {selectedAssignment.notes && (
                <div>
                  <span className="text-sm text-muted-foreground">Notes:</span>
                  <p className="text-sm bg-muted p-2 rounded mt-1">{selectedAssignment.notes}</p>
                </div>
              )}

              {selectedAssignment.photos && Array.isArray(selectedAssignment.photos) && (
                <div>
                  <span className="text-sm text-muted-foreground">Submitted Photos:</span>
                  <div className="mt-1 space-y-1">
                    {(selectedAssignment.photos as Array<{ name: string; submittedAt: string }>).map(
                      (photo, i) => (
                        <div key={i} className="flex justify-between text-sm bg-muted p-2 rounded">
                          <span>{photo.name}</span>
                          <span className="text-muted-foreground">
                            {new Date(photo.submittedAt).toLocaleString()}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {selectedAssignment.validatedAt && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Validated at: </span>
                  <span>{new Date(selectedAssignment.validatedAt).toLocaleString()}</span>
                </div>
              )}

              {/* Actions for SUBMITTED assignments */}
              {selectedAssignment.status === "SUBMITTED" && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    className="flex-1"
                    onClick={() => handleValidate(selectedAssignment.id, "validate")}
                    disabled={validating}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => handleValidate(selectedAssignment.id, "fail")}
                    disabled={validating}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject & Apply Fee
                  </Button>
                </div>
              )}

              {/* Copy link for PENDING assignments */}
              {selectedAssignment.status === "PENDING" && (
                <div className="pt-2 border-t">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => copyLink(selectedAssignment.token)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Submission Link
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
