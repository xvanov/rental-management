"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

  const handleSendForSignature = async () => {
    if (!lease) return;
    setSending(true);
    setSendError(null);

    try {
      const res = await fetch("/api/leases/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaseId: lease.id }),
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
        a.download = `lease-${lease.tenant.lastName}-${lease.unit.name}.pdf`;
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
                Lease for {lease.tenant.firstName} {lease.tenant.lastName}
              </h1>
              {statusBadge(lease.status)}
            </div>
            <p className="text-muted-foreground">
              {lease.unit.name} at {lease.unit.property.address}
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
          {emailSent && lease.tenant.email && (
            <p className="text-sm mt-2">An email was also sent to {lease.tenant.email}.</p>
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
            <Link
              href={`/dashboard/tenants/${lease.tenant.id}`}
              className="font-medium hover:underline"
            >
              {lease.tenant.firstName} {lease.tenant.lastName}
            </Link>
            {lease.tenant.email && (
              <p className="text-sm text-muted-foreground">{lease.tenant.email}</p>
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
            <p className="font-medium">{lease.unit.name}</p>
            <p className="text-sm text-muted-foreground">
              {lease.unit.property.address}, {lease.unit.property.city}
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

      {/* Send for Signature Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {lease.status === "PENDING_SIGNATURE" ? "Resend Lease for Signature" : "Send Lease for Signature"}
            </DialogTitle>
            <DialogDescription>
              This will {lease.status === "PENDING_SIGNATURE" ? "resend" : "send"} the lease to{" "}
              {lease.tenant.firstName} {lease.tenant.lastName} for electronic signature.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {lease.tenant.email ? (
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm">
                  An email will be sent to: <strong>{lease.tenant.email}</strong>
                </p>
              </div>
            ) : (
              <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-yellow-800">
                <p className="text-sm">
                  <AlertCircle className="inline h-4 w-4 mr-1" />
                  Warning: This tenant does not have an email address. You may need to add one first.
                </p>
              </div>
            )}

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
              disabled={sending || !lease.tenant.email}
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {lease.status === "PENDING_SIGNATURE" ? "Resend" : "Send for Signature"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
