"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  FileText,
  Calendar,
  MessageSquare,
  DollarSign,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

interface TenantSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  unit: {
    name: string;
    property: { address: string; city: string; state: string };
  } | null;
  leases: { id: string; status: string; rentAmount: number; startDate: string; endDate: string | null }[];
  payments: { id: string }[];
  messages: { id: string }[];
}

export default function CourtPacketPage() {
  const params = useParams();
  const id = params.id as string;

  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Fetch tenant data for preview
  const fetchTenant = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants?id=${id}`);
      if (!res.ok) throw new Error("Failed to fetch tenant");
      const data = await res.json();
      setTenant(data);
      setError(null);
    } catch {
      setError("Failed to load tenant data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    try {
      const params = new URLSearchParams({ tenantId: id });
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/court-packet?${params.toString()}`);

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to generate court packet");
      }

      // Download the PDF
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const tenantName = `${tenant?.firstName}_${tenant?.lastName}`.replace(/\s+/g, "_");
      a.download = `court_packet_${tenantName}_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate court packet");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Loading...</h1>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div>
        <Link
          href="/dashboard/tenants"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Tenants
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Tenant Not Found</h1>
        <p className="text-muted-foreground mt-1">
          {error || "This tenant could not be found."}
        </p>
      </div>
    );
  }

  const activeLease = tenant.leases.find((l) => l.status === "ACTIVE") || tenant.leases[0];

  return (
    <div>
      <Link
        href={`/dashboard/tenants/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Tenant Detail
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Court Packet Export</h1>
          <p className="text-muted-foreground mt-1">
            Generate a court-ready PDF evidence bundle for {tenant.firstName} {tenant.lastName}
          </p>
        </div>
        <Badge variant="outline">
          {tenant.unit ? `${tenant.unit.name} - ${tenant.unit.property.address}` : "No Unit"}
        </Badge>
      </div>

      {/* Document Summary Cards */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lease</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activeLease ? "Yes" : "None"}
            </div>
            {activeLease && (
              <p className="text-xs text-muted-foreground">
                {activeLease.status} - ${activeLease.rentAmount?.toLocaleString()}/mo
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payments</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenant.payments.length}</div>
            <p className="text-xs text-muted-foreground">payment records</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages</CardTitle>
            <MessageSquare className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenant.messages.length}</div>
            <p className="text-xs text-muted-foreground">communication records</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leases</CardTitle>
            <Calendar className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenant.leases.length}</div>
            <p className="text-xs text-muted-foreground">lease versions</p>
          </CardContent>
        </Card>
      </div>

      {/* Generation Options */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Generate Court Packet</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The court packet will include the signed lease, full payment ledger, all notices
              with proof of service, communication logs, and a complete event timeline as an appendix.
              Generated as a single PDF with table of contents and page numbers.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date (optional)</Label>
                <input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date (optional)</Label>
                <input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div className="rounded-md border p-4">
              <h4 className="text-sm font-medium mb-2">Included Documents:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <FileText className="size-3" />
                  Signed lease agreement (if available)
                </li>
                <li className="flex items-center gap-2">
                  <DollarSign className="size-3" />
                  Full payment ledger with running balance
                </li>
                <li className="flex items-center gap-2">
                  <AlertTriangle className="size-3" />
                  All notices and proof of service
                </li>
                <li className="flex items-center gap-2">
                  <MessageSquare className="size-3" />
                  Communication logs (SMS, email, Facebook)
                </li>
                <li className="flex items-center gap-2">
                  <Calendar className="size-3" />
                  Event timeline appendix
                </li>
              </ul>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="size-4" />
                {error}
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={generating}
              size="lg"
              className="w-full sm:w-auto"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="mr-2 size-4" />
                  Download Court Packet PDF
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
