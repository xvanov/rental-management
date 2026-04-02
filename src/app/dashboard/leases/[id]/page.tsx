"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Send,
  Download,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  User,
  Home,
  Calendar,
  DollarSign,
  ExternalLink,
  RefreshCw,
  Eye,
  Plus,
  Trash2,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Lease {
  id: string;
  status: string;
  content: string;
  rentAmount: number | null;
  version: number;
  startDate: string;
  endDate: string | null;
  signedAt: string | null;
  signedDocumentUrl: string | null;
  createdAt: string;
  updatedAt: string;
  tenant: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  };
  unit: {
    id: string;
    name: string;
    property: {
      id: string;
      address: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  template: { id: string; name: string } | null;
  clauses: { id: string; type: string; content: string }[];
}

export default function LeaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const [lease, setLease] = useState<Lease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [guarantors, setGuarantors] = useState<Array<{ name: string; email: string }>>([]);
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [renewStartDate, setRenewStartDate] = useState("");
  const [renewEndDate, setRenewEndDate] = useState("");
  const [renewRentAmount, setRenewRentAmount] = useState("");

  const fetchLease = useCallback(async () => {
    try {
      const res = await fetch(`/api/leases?id=${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Lease not found");
        } else {
          setError("Failed to load lease");
        }
        return;
      }
      const data = await res.json();
      setLease(data);
      setError(null);
    } catch {
      setError("Failed to load lease");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLease();
  }, [fetchLease]);

  // Auto-open renewal dialog if ?renew=true is in the URL
  useEffect(() => {
    if (lease && searchParams.get("renew") === "true" && !renewDialogOpen) {
      openRenewDialog();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lease, searchParams]);

  const handleSendForSignature = async () => {
    if (!lease) return;
    setSending(true);
    setSendError(null);

    try {
      const res = await fetch("/api/leases/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaseId: lease.id,
          guarantors: guarantors.filter((g) => g.name && g.email),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSendSuccess(true);
        setSigningUrl(data.signingUrl || null);
        setEmailSent(data.emailSent ?? false);
        setEmailError(data.emailError ?? null);
        setConfirmDialogOpen(false);
        fetchLease();
      } else {
        const data = await res.json();
        setSendError(data.error || "Failed to send for signature");
      }
    } catch {
      setSendError("Failed to send for signature. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!lease) return;
    setDownloading(true);

    try {
      const res = await fetch(`/api/leases/pdf?id=${lease.id}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lease-${lease.tenant?.lastName || "draft"}-${lease.unit?.name || "template"}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to download PDF");
      }
    } catch {
      alert("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  const openRenewDialog = () => {
    if (!lease) return;
    // Pre-fill with defaults
    const oldEnd = lease.endDate ? new Date(lease.endDate) : new Date();
    const newStart = new Date(oldEnd);
    newStart.setDate(newStart.getDate() + 1);

    // Same term length
    const oldStart = new Date(lease.startDate);
    const termMs = oldEnd.getTime() - oldStart.getTime();
    const newEnd = new Date(newStart.getTime() + termMs);

    setRenewStartDate(newStart.toISOString().split("T")[0]);
    setRenewEndDate(newEnd.toISOString().split("T")[0]);
    setRenewRentAmount(lease.rentAmount?.toString() || "");
    setRenewDialogOpen(true);
  };

  const handleRenewLease = async () => {
    if (!lease) return;
    setRenewing(true);

    try {
      const res = await fetch("/api/leases/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaseId: lease.id,
          startDate: renewStartDate,
          endDate: renewEndDate,
          rentAmount: renewRentAmount ? parseFloat(renewRentAmount) : undefined,
        }),
      });

      if (res.ok) {
        const newLease = await res.json();
        setRenewDialogOpen(false);
        router.push(`/dashboard/leases/${newLease.id}`);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to renew lease");
      }
    } catch {
      alert("Failed to renew lease");
    } finally {
      setRenewing(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <Badge className="bg-green-500">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Active
          </Badge>
        );
      case "DRAFT":
        return (
          <Badge variant="secondary">
            <FileText className="mr-1 h-3 w-3" />
            Draft
          </Badge>
        );
      case "PENDING_SIGNATURE":
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-600">
            <Clock className="mr-1 h-3 w-3" />
            Pending Signature
          </Badge>
        );
      case "EXPIRED":
        return (
          <Badge variant="destructive">
            <AlertCircle className="mr-1 h-3 w-3" />
            Expired
          </Badge>
        );
      case "TERMINATED":
        return (
          <Badge variant="destructive">
            <AlertCircle className="mr-1 h-3 w-3" />
            Terminated
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !lease) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/leases">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Lease Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">{error || "Lease not found"}</p>
            <Button asChild className="mt-4">
              <Link href="/dashboard/leases">Back to Leases</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/leases">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">
                Lease {lease.tenant ? `for ${lease.tenant?.firstName} ${lease.tenant?.lastName}` : "(Template Draft)"}
              </h1>
              {statusBadge(lease.status)}
            </div>
            <p className="text-muted-foreground">
              {lease.unit ? `${lease.unit?.name} at ${lease.unit?.property.address}` : "Template — no unit assigned"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadPDF} disabled={downloading}>
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download PDF
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/dashboard/leases/preview/${lease.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Preview as Tenant
            </Link>
          </Button>
          {(lease.status === "DRAFT" || lease.status === "PENDING_SIGNATURE") && (
            <Button onClick={() => setConfirmDialogOpen(true)}>
              <Send className="mr-2 h-4 w-4" />
              {lease.status === "PENDING_SIGNATURE" ? "Resend for Signature" : "Send for Signature"}
            </Button>
          )}
          {signingUrl && (
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(signingUrl);
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Copy Signing Link
            </Button>
          )}
          {lease.signedDocumentUrl && (
            <Button variant="outline" asChild>
              <a href={`/api/signed-documents/${lease.id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                View Signed Document
              </a>
            </Button>
          )}
          {(lease.status === "ACTIVE" || lease.status === "EXPIRED") && (
            <Button variant="outline" onClick={openRenewDialog}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Renew Lease
            </Button>
          )}
        </div>
      </div>

      {/* Success message with signing link */}
      {sendSuccess && (
        <div className="rounded-md bg-green-50 border border-green-200 p-4 text-green-800">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Lease sent for signature!</span>
          </div>
          {signingUrl && (
            <div className="mt-3 p-3 bg-white rounded border border-green-300">
              <p className="text-sm mb-2">Share this link with the tenant to sign (no account required):</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-green-100 px-2 py-1 rounded break-all">
                  {signingUrl}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(signingUrl);
                  }}
                >
                  Copy
                </Button>
                <Button size="sm" asChild>
                  <a href={signingUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Open
                  </a>
                </Button>
              </div>
            </div>
          )}
          {emailSent && lease.tenant?.email && (
            <p className="text-sm mt-2">An email was also sent to {lease.tenant?.email}.</p>
          )}
          {!emailSent && emailError && (
            <div className="mt-3 rounded-md bg-yellow-50 border border-yellow-300 p-3 text-yellow-800">
              <p className="text-sm font-medium">Email could not be sent</p>
              <p className="text-sm">{emailError}</p>
              <p className="text-sm mt-1">Share the signing link above with the tenant manually.</p>
            </div>
          )}
        </div>
      )}

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4" />
              Tenant
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lease.tenant ? (
              <>
                <Link
                  href={`/dashboard/tenants/${lease.tenant.id}`}
                  className="font-medium hover:underline"
                >
                  {lease.tenant?.firstName} {lease.tenant?.lastName}
                </Link>
                {lease.tenant?.email && (
                  <p className="text-sm text-muted-foreground">{lease.tenant?.email}</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground italic">No tenant assigned</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Home className="h-4 w-4" />
              Property
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{lease.unit?.name}</p>
            <p className="text-sm text-muted-foreground">
              {lease.unit?.property.address}, {lease.unit?.property.city}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Lease Term
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {new Date(lease.startDate).toLocaleDateString()}
              {lease.endDate && ` - ${new Date(lease.endDate).toLocaleDateString()}`}
            </p>
            <p className="text-sm text-muted-foreground">Version {lease.version}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Monthly Rent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium text-xl">
              {lease.rentAmount ? `$${lease.rentAmount.toFixed(2)}` : "\u2014"}
            </p>
            {lease.signedAt && (
              <p className="text-sm text-muted-foreground">
                Signed {new Date(lease.signedAt).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lease Content */}
      <Card>
        <CardHeader>
          <CardTitle>Lease Agreement</CardTitle>
          <CardDescription>
            {lease.template ? `Generated from "${lease.template.name}" template` : "Custom lease"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none dark:prose-invert bg-muted/30 rounded-lg p-6 max-h-[600px] overflow-y-auto">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {lease.content}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Parsed Clauses (if any) */}
      {lease.clauses && lease.clauses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Parsed Clauses</CardTitle>
            <CardDescription>
              Key terms extracted from this lease
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lease.clauses.map((clause) => (
                <div key={clause.id} className="border rounded-lg p-3">
                  <Badge variant="outline" className="mb-2">
                    {clause.type.replace(/_/g, " ")}
                  </Badge>
                  <p className="text-sm">{clause.content}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Renew Lease Dialog */}
      <Dialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renew Lease</DialogTitle>
            <DialogDescription>
              Create a new lease for {lease.tenant?.firstName} {lease.tenant?.lastName} at{" "}
              {lease.unit?.name} with the same terms. Adjust dates and rent as needed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="renewStart">Start Date</Label>
                <Input
                  id="renewStart"
                  type="date"
                  value={renewStartDate}
                  onChange={(e) => setRenewStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="renewEnd">End Date</Label>
                <Input
                  id="renewEnd"
                  type="date"
                  value={renewEndDate}
                  onChange={(e) => setRenewEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="renewRent">Monthly Rent ($)</Label>
              <Input
                id="renewRent"
                type="number"
                step="0.01"
                value={renewRentAmount}
                onChange={(e) => setRenewRentAmount(e.target.value)}
              />
              {lease.rentAmount && renewRentAmount && parseFloat(renewRentAmount) !== lease.rentAmount && (
                <p className="text-xs text-muted-foreground">
                  Changed from ${lease.rentAmount.toFixed(2)} → ${parseFloat(renewRentAmount).toFixed(2)}
                  {parseFloat(renewRentAmount) > lease.rentAmount
                    ? ` (+$${(parseFloat(renewRentAmount) - lease.rentAmount).toFixed(2)})`
                    : ` (-$${(lease.rentAmount - parseFloat(renewRentAmount)).toFixed(2)})`}
                </p>
              )}
            </div>

            <div className="rounded-md bg-muted p-3 text-sm">
              <p>This will create a new <strong>DRAFT</strong> lease (v{lease.version + 1}) with the current lease content.</p>
              <p className="mt-1 text-muted-foreground">You can edit the content and send it for signature from the new lease page.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenewLease} disabled={renewing || !renewStartDate}>
              {renewing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Create Renewal
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send for Signature Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={(open) => {
        setConfirmDialogOpen(open);
        if (!open) { setGuarantors([]); setSendError(null); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {lease.status === "PENDING_SIGNATURE" ? "Resend Lease for Signature" : "Send Lease for Signature"}
            </DialogTitle>
            <DialogDescription>
              Send the lease to the tenant{guarantors.length > 0 ? " and guarantor(s)" : ""} for electronic signature.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Tenant */}
            {lease.tenant?.email ? (
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm font-medium">Tenant</p>
                <p className="text-sm">
                  {lease.tenant?.firstName} {lease.tenant?.lastName} — <strong>{lease.tenant?.email}</strong>
                </p>
              </div>
            ) : (
              <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-yellow-800">
                <p className="text-sm">
                  <AlertCircle className="inline h-4 w-4 mr-1" />
                  Tenant does not have an email address. Add one first.
                </p>
              </div>
            )}

            {/* Guarantors */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Guarantors (optional)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGuarantors([...guarantors, { name: "", email: "" }])}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Guarantor
                </Button>
              </div>

              {guarantors.map((g, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <Input
                      placeholder="Full name"
                      value={g.name}
                      onChange={(e) => {
                        const updated = [...guarantors];
                        updated[i] = { ...updated[i], name: e.target.value };
                        setGuarantors(updated);
                      }}
                    />
                    <Input
                      placeholder="Email address"
                      type="email"
                      value={g.email}
                      onChange={(e) => {
                        const updated = [...guarantors];
                        updated[i] = { ...updated[i], email: e.target.value };
                        setGuarantors(updated);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 mt-1"
                    onClick={() => setGuarantors(guarantors.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}

              {guarantors.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Each guarantor will receive a separate signing link. The lease activates only after everyone signs.
                </p>
              )}
            </div>

            {sendError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {sendError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendForSignature}
              disabled={sending || !lease.tenant?.email}
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {lease.status === "PENDING_SIGNATURE" ? "Resend" : `Send${guarantors.filter(g => g.name && g.email).length > 0 ? ` to ${1 + guarantors.filter(g => g.name && g.email).length} signers` : " for Signature"}`}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
