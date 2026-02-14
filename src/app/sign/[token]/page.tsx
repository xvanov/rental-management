"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import SignaturePad from "signature_pad";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
  Home,
  Calendar,
  DollarSign,
  Download,
  Eraser,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

type PageState = "loading" | "error" | "signing" | "submitting" | "success";

export default function SignLeasePage() {
  const params = useParams();
  const token = params.token as string;

  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [leaseData, setLeaseData] = useState<LeaseData | null>(null);
  const [fullName, setFullName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [signedLeaseId, setSignedLeaseId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);

  const fetchLeaseData = useCallback(async () => {
    try {
      const res = await fetch(`/api/signing/${token}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load lease");
        setState("error");
        return;
      }
      const data: LeaseData = await res.json();
      setLeaseData(data);
      setFullName(data.signerName);
      setState("signing");
    } catch {
      setError("Failed to load lease data");
      setState("error");
    }
  }, [token]);

  useEffect(() => {
    fetchLeaseData();
  }, [fetchLeaseData]);

  // Initialize signature pad after component mounts with lease data
  useEffect(() => {
    if (state !== "signing" || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const container = canvas.parentElement;
    if (!container) return;

    // Set canvas size to match container
    const resizeCanvas = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = container.offsetWidth * ratio;
      canvas.height = 200 * ratio;
      canvas.style.width = `${container.offsetWidth}px`;
      canvas.style.height = "200px";
      canvas.getContext("2d")?.scale(ratio, ratio);
      // Clear pad data after resize
      signaturePadRef.current?.clear();
      setHasSigned(false);
    };

    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgb(255, 255, 255)",
      penColor: "rgb(0, 0, 0)",
    });

    pad.addEventListener("endStroke", () => {
      setHasSigned(!pad.isEmpty());
    });

    signaturePadRef.current = pad;
    resizeCanvas();

    window.addEventListener("resize", resizeCanvas);
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      pad.off();
    };
  }, [state]);

  const handleClearSignature = () => {
    signaturePadRef.current?.clear();
    setHasSigned(false);
  };

  const handleSubmit = async () => {
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) return;
    if (!fullName.trim() || !agreed) return;

    setState("submitting");

    try {
      const signatureDataUrl = signaturePadRef.current.toDataURL("image/png");

      const res = await fetch(`/api/signing/${token}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatureDataUrl,
          fullName: fullName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit signature");
        setState("signing");
        return;
      }

      setSignedLeaseId(data.leaseId || null);
      setState("success");
    } catch {
      setError("Failed to submit signature. Please try again.");
      setState("signing");
    }
  };

  const canSubmit = fullName.trim() && hasSigned && agreed && smsConsent;

  // Convert markdown to simple HTML for display
  const renderLeaseContent = (content: string) => {
    let html = content;
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-2">$1</h1>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2 border-b pb-1">$1</h2>');
    html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>');
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>');
    html = html.replace(/^---+$/gm, '<hr class="my-4 border-gray-300">');
    // Wrap paragraphs
    html = html.replace(/^(?!<[h|l|u|o|hr])(.*\S.*)$/gm, '<p class="mb-2">$1</p>');
    return html;
  };

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">Loading lease agreement...</p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Unable to Load Lease</h2>
            <p className="text-gray-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Lease Signed Successfully</h2>
            <p className="text-gray-500 mb-4">
              Thank you for signing your lease agreement. You will receive a confirmation email shortly.
            </p>
            {signedLeaseId && (
              <Button asChild>
                <a href={`/api/signed-documents/${signedLeaseId}`} download>
                  <Download className="mr-2 h-4 w-4" />
                  Download Signed Lease
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // signing / submitting state
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
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
        {leaseData && (
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
        )}

        {/* Lease Content */}
        {leaseData && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Full Lease Agreement</CardTitle>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/signing/${token}/pdf`} download>
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
        )}

        {/* Signature Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sign Below</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Full Legal Name */}
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Legal Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full legal name"
              />
            </div>

            {/* Signature Pad */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Signature</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSignature}
                >
                  <Eraser className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white">
                <canvas ref={canvasRef} className="touch-none" />
              </div>
              <p className="text-xs text-gray-400">
                Draw your signature above using your mouse or finger
              </p>
            </div>

            {/* Agreement Checkbox */}
            <div className="flex items-start gap-3 pt-2">
              <input
                type="checkbox"
                id="agree"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1"
              />
              <label htmlFor="agree" className="text-sm text-gray-600 leading-relaxed">
                I have read and agree to all terms and conditions of this lease agreement.
                I understand that this electronic signature is legally binding and has the
                same effect as a handwritten signature.
              </label>
            </div>

            {/* SMS Consent Checkbox */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="smsConsent"
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                  className="mt-1"
                />
                <label htmlFor="smsConsent" className="text-sm text-gray-800 leading-relaxed">
                  <strong>SMS/Text Message Consent:</strong> I agree to receive text messages
                  from Rentus Homes at the phone number on file regarding my rental. These
                  messages include rent payment reminders, utility billing notifications,
                  lease updates, maintenance updates, and property notices. Messages are
                  transactional only — no marketing messages will be sent.
                </label>
              </div>
              <p className="text-xs text-gray-500 ml-7">
                Message frequency varies. Message and data rates may apply. Reply STOP to
                opt out at any time. Reply HELP for help. View our{" "}
                <a href="/privacy" target="_blank" className="text-blue-600 underline">Privacy Policy</a>{" "}
                and{" "}
                <a href="/terms" target="_blank" className="text-blue-600 underline">Terms of Service</a>.
              </p>
            </div>

            {/* Electronic Signature Consent */}
            <p className="text-xs text-gray-400">
              By signing, you consent to the use of electronic records and signatures.
              Your IP address and timestamp will be recorded as part of the signing record.
            </p>

            {/* Error message */}
            {error && state === "signing" && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={!canSubmit || state === "submitting"}
            >
              {state === "submitting" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing Lease...
                </>
              ) : (
                "Sign Lease"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
