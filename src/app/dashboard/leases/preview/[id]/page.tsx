"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  Loader2,
  FileText,
  Home,
  Calendar,
  DollarSign,
  Download,
  ArrowLeft,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface LeaseData {
  signerName: string;
  signerEmail: string;
  leaseContent: string;
  propertyAddress: string;
  unitName: string;
  startDate: string;
  endDate: string | null;
  rentAmount: number | null;
}

export default function LeasePreviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [leaseData, setLeaseData] = useState<LeaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/leases/preview?id=${id}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load lease");
        return;
      }
      const data: LeaseData = await res.json();
      setLeaseData(data);
    } catch {
      setError("Failed to load lease data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const renderLeaseContent = (content: string) => {
    let html = content;
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-2">$1</h1>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2 border-b pb-1">$1</h2>');
    html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>');
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>');
    html = html.replace(/^---+$/gm, '<hr class="my-4 border-gray-300">');
    html = html.replace(/^(?!<[h|l|u|o|hr])(.*\S.*)$/gm, '<p class="mb-2">$1</p>');
    return html;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">Loading lease preview...</p>
        </div>
      </div>
    );
  }

  if (error || !leaseData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Unable to Load Lease</h2>
            <p className="text-gray-500">{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Preview Banner */}
        <div className="rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-800">Preview Mode</p>
              <p className="text-sm text-amber-600">
                This is how the tenant will see the lease when they open the signing link.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/leases/${id}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Lease
          </Button>
        </div>

        {/* Header — same as tenant sees */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2.5 mb-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="size-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">Rentus Homes</span>
          </div>
          <h1 className="text-2xl font-bold">Lease Agreement</h1>
          <p className="text-gray-500 mt-1">
            Please review the lease below and sign at the bottom
          </p>
        </div>

        {/* Lease Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Lease Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <Home className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-gray-500">Property</p>
                  <p className="font-medium">{leaseData.unitName}</p>
                  <p className="text-gray-500 text-xs">{leaseData.propertyAddress}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-gray-500">Tenant</p>
                  <p className="font-medium">{leaseData.signerName}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-gray-500">Term</p>
                  <p className="font-medium">
                    {new Date(leaseData.startDate).toLocaleDateString()}
                    {leaseData.endDate && ` - ${new Date(leaseData.endDate).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <DollarSign className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-gray-500">Monthly Rent</p>
                  <p className="font-medium">
                    {leaseData.rentAmount ? `$${leaseData.rentAmount.toFixed(2)}` : "See lease"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lease Content */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Full Lease Agreement</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/leases/pdf?id=${id}`} download>
                  <Download className="h-3 w-3 mr-1" />
                  Download PDF
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="max-h-[500px] overflow-y-auto bg-white border rounded-lg p-6 text-sm leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderLeaseContent(leaseData.leaseContent) }}
            />
          </CardContent>
        </Card>

        {/* Signature Section — disabled preview */}
        <Card className="opacity-60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sign Below</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Full Legal Name</p>
              <div className="border rounded-md px-3 py-2 bg-gray-50 text-gray-400">
                {leaseData.signerName}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-500">Signature</p>
              <div className="border-2 border-dashed border-gray-200 rounded-lg h-[100px] flex items-center justify-center bg-gray-50">
                <p className="text-gray-400 text-sm">Tenant will sign here</p>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-2">
              <input type="checkbox" disabled className="mt-1" />
              <p className="text-sm text-gray-400">
                I have read and agree to all terms and conditions of this lease agreement...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
