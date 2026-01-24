"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ClipboardList,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Send,
  Copy,
  FileText,
  User,
  Phone,
  Mail,
  Briefcase,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

interface Application {
  id: string;
  token: string;
  status: "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  currentAddress: string | null;
  employer: string | null;
  income: number | null;
  rentalHistory: Array<{
    address: string;
    landlordName: string;
    landlordPhone: string;
    duration: string;
    reasonForLeaving: string;
  }> | null;
  evictionHistory: { hasEviction: boolean; details: string } | null;
  documents: Array<{ name: string; type: string; size: number }> | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  tenant: { id: string; firstName: string; lastName: string } | null;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "PENDING":
      return <Badge variant="secondary"><Clock className="mr-1 size-3" />Pending</Badge>;
    case "UNDER_REVIEW":
      return <Badge variant="default"><Eye className="mr-1 size-3" />Under Review</Badge>;
    case "APPROVED":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle className="mr-1 size-3" />Approved</Badge>;
    case "REJECTED":
      return <Badge variant="destructive"><XCircle className="mr-1 size-3" />Rejected</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      const res = await fetch(`/api/applications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data);
      }
    } catch (error) {
      console.error("Failed to fetch applications:", error);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const createApplication = async () => {
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const newApp = await res.json();
        setApplications((prev) => [newApp, ...prev]);
        setCreateDialogOpen(false);
        // Show copy dialog
        setCopiedToken(newApp.token);
        setTimeout(() => setCopiedToken(null), 5000);
      }
    } catch (error) {
      console.error("Failed to create application:", error);
    }
  };

  const handleAction = async (action: "APPROVED" | "REJECTED") => {
    if (!selectedApp) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedApp.id,
          status: action,
          reviewNotes: reviewNotes || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setApplications((prev) =>
          prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
        );
        setDetailDialogOpen(false);
        setSelectedApp(null);
        setReviewNotes("");
      }
    } catch (error) {
      console.error("Failed to update application:", error);
    } finally {
      setActionLoading(false);
    }
  };

  const copyApplicationLink = (token: string) => {
    const url = `${window.location.origin}/apply/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 3000);
  };

  const filteredApplications = applications.filter((app) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      (app.firstName && app.firstName.toLowerCase().includes(searchLower)) ||
      (app.lastName && app.lastName.toLowerCase().includes(searchLower)) ||
      (app.email && app.email.toLowerCase().includes(searchLower)) ||
      (app.phone && app.phone.includes(search))
    );
  });

  const stats = {
    total: applications.length,
    pending: applications.filter((a) => a.status === "PENDING").length,
    underReview: applications.filter((a) => a.status === "UNDER_REVIEW").length,
    approved: applications.filter((a) => a.status === "APPROVED").length,
    rejected: applications.filter((a) => a.status === "REJECTED").length,
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Applications</h1>
          <p className="text-muted-foreground">
            Review and manage tenant applications
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" />
              New Application Link
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Application Link</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <p className="text-sm text-muted-foreground">
                Generate a unique application link to send to a prospective tenant.
                They can fill out their information without creating an account.
              </p>
              <Button onClick={createApplication}>
                <Send className="mr-2 size-4" />
                Generate Link
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Copied Token Notice */}
      {copiedToken && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="size-4 text-green-600" />
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              Application link created!
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/apply/${copiedToken}`}
              readOnly
              className="text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyApplicationLink(copiedToken)}
            >
              <Copy className="size-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.underReview}</div>
            <p className="text-xs text-muted-foreground">Under Review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-destructive">{stats.rejected}</div>
            <p className="text-xs text-muted-foreground">Rejected</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {["", "PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED"].map((s) => (
            <Button
              key={s}
              variant={filterStatus === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(s)}
            >
              {s || "All"}
            </Button>
          ))}
        </div>
      </div>

      {/* Applications Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-5" />
            Applications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Loading...</p>
          ) : filteredApplications.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="mx-auto size-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">No applications found</p>
              <p className="text-sm text-muted-foreground">
                Create an application link to get started
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      {app.firstName && app.lastName ? (
                        <span className="font-medium">
                          {app.firstName} {app.lastName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">
                          Not submitted
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {app.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="size-3 text-muted-foreground" />
                            {app.email}
                          </div>
                        )}
                        {app.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="size-3 text-muted-foreground" />
                            {app.phone}
                          </div>
                        )}
                        {!app.email && !app.phone && (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(app.status)}</TableCell>
                    <TableCell>
                      {app.submittedAt ? (
                        <span className="text-sm">
                          {new Date(app.submittedAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedApp(app);
                            setReviewNotes(app.reviewNotes || "");
                            setDetailDialogOpen(true);
                          }}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyApplicationLink(app.token)}
                        >
                          <Copy className="size-4" />
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

      {/* Application Detail/Review Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Application Review
              {selectedApp && getStatusBadge(selectedApp.status)}
            </DialogTitle>
          </DialogHeader>
          {selectedApp && (
            <div className="grid gap-4">
              {/* Personal Info */}
              <div className="rounded-lg border p-4">
                <h4 className="flex items-center gap-2 text-sm font-medium mb-3">
                  <User className="size-4" /> Personal Information
                </h4>
                <div className="grid gap-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">First Name:</span>
                      <p className="font-medium">{selectedApp.firstName || "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Name:</span>
                      <p className="font-medium">{selectedApp.lastName || "-"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">Email:</span>
                      <p>{selectedApp.email || "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone:</span>
                      <p>{selectedApp.phone || "-"}</p>
                    </div>
                  </div>
                  {selectedApp.currentAddress && (
                    <div>
                      <span className="text-muted-foreground">Current Address:</span>
                      <p>{selectedApp.currentAddress}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Employment */}
              <div className="rounded-lg border p-4">
                <h4 className="flex items-center gap-2 text-sm font-medium mb-3">
                  <Briefcase className="size-4" /> Employment & Income
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Employer:</span>
                    <p>{selectedApp.employer || "-"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Monthly Income:</span>
                    <p>{selectedApp.income ? `$${selectedApp.income.toLocaleString()}` : "-"}</p>
                  </div>
                </div>
              </div>

              {/* Rental History */}
              {selectedApp.rentalHistory && (selectedApp.rentalHistory as Array<{address: string}>).length > 0 && (
                <div className="rounded-lg border p-4">
                  <h4 className="flex items-center gap-2 text-sm font-medium mb-3">
                    <Home className="size-4" /> Rental History
                  </h4>
                  <div className="grid gap-3">
                    {(selectedApp.rentalHistory as Array<{address: string; landlordName: string; landlordPhone: string; duration: string; reasonForLeaving: string}>).map((r, i) => (
                      <div key={i} className="text-sm border-l-2 pl-3">
                        <p className="font-medium">{r.address}</p>
                        <p className="text-muted-foreground">
                          {r.landlordName && `Landlord: ${r.landlordName}`}
                          {r.landlordPhone && ` (${r.landlordPhone})`}
                        </p>
                        {r.duration && <p className="text-muted-foreground">Duration: {r.duration}</p>}
                        {r.reasonForLeaving && <p className="text-muted-foreground">Reason: {r.reasonForLeaving}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Eviction History */}
              {selectedApp.evictionHistory && (
                <div className="rounded-lg border p-4">
                  <h4 className="text-sm font-medium mb-2">Eviction History</h4>
                  <p className="text-sm">
                    {(selectedApp.evictionHistory as {hasEviction: boolean; details: string}).hasEviction
                      ? `Yes - ${(selectedApp.evictionHistory as {hasEviction: boolean; details: string}).details}`
                      : "No prior evictions"}
                  </p>
                </div>
              )}

              {/* Documents */}
              {selectedApp.documents && (selectedApp.documents as Array<{name: string}>).length > 0 && (
                <div className="rounded-lg border p-4">
                  <h4 className="flex items-center gap-2 text-sm font-medium mb-3">
                    <FileText className="size-4" /> Documents
                  </h4>
                  <div className="grid gap-2">
                    {(selectedApp.documents as Array<{name: string; type: string; size: number}>).map((doc, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <FileText className="size-3 text-muted-foreground" />
                        <span>{doc.name}</span>
                        <span className="text-muted-foreground">
                          ({(doc.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review Notes */}
              {(selectedApp.status === "UNDER_REVIEW" || selectedApp.status === "PENDING") && (
                <div className="grid gap-2">
                  <Label>Review Notes</Label>
                  <Textarea
                    placeholder="Add notes about this application..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              )}

              {/* Existing review notes (for reviewed applications) */}
              {selectedApp.reviewNotes && selectedApp.status !== "UNDER_REVIEW" && (
                <div className="rounded-lg bg-muted p-4">
                  <h4 className="text-sm font-medium mb-1">Review Notes</h4>
                  <p className="text-sm">{selectedApp.reviewNotes}</p>
                  {selectedApp.reviewedAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Reviewed on {new Date(selectedApp.reviewedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              {(selectedApp.status === "UNDER_REVIEW" || selectedApp.status === "PENDING") && selectedApp.firstName && (
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="destructive"
                    onClick={() => handleAction("REJECTED")}
                    disabled={actionLoading}
                  >
                    <XCircle className="mr-1 size-4" />
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleAction("APPROVED")}
                    disabled={actionLoading}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="mr-1 size-4" />
                    Approve
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
