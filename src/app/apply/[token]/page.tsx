"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  User,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  DollarSign,
  Home,
  FileText,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Application {
  id: string;
  token: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  currentAddress: string | null;
  employer: string | null;
  income: number | null;
  rentalHistory: RentalHistoryEntry[] | null;
  evictionHistory: EvictionHistoryEntry | null;
  documents: DocumentEntry[] | null;
  submittedAt: string | null;
}

interface RentalHistoryEntry {
  address: string;
  landlordName: string;
  landlordPhone: string;
  duration: string;
  reasonForLeaving: string;
}

interface EvictionHistoryEntry {
  hasEviction: boolean;
  details: string;
}

interface DocumentEntry {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

type Step = "identity" | "rental" | "employment" | "documents" | "review" | "submitted";

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "identity", label: "Identity", icon: <User className="size-4" /> },
  { key: "rental", label: "Rental History", icon: <Home className="size-4" /> },
  { key: "employment", label: "Employment", icon: <Briefcase className="size-4" /> },
  { key: "documents", label: "Documents", icon: <FileText className="size-4" /> },
  { key: "review", label: "Review", icon: <CheckCircle className="size-4" /> },
];

export default function ApplicationPage() {
  const params = useParams();
  const token = params.token as string;

  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("identity");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    currentAddress: "",
    employer: "",
    income: "",
    rentalHistory: [
      { address: "", landlordName: "", landlordPhone: "", duration: "", reasonForLeaving: "" },
    ] as RentalHistoryEntry[],
    evictionHistory: { hasEviction: false, details: "" } as EvictionHistoryEntry,
    documents: [] as DocumentEntry[],
  });

  const fetchApplication = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/applications?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        setApplication(data);

        // If already submitted, show submitted state
        if (data.submittedAt || data.status !== "PENDING") {
          setStep("submitted");
          return;
        }

        // Pre-fill form if data exists
        if (data.firstName) {
          setFormData((prev) => ({
            ...prev,
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            email: data.email || "",
            phone: data.phone || "",
            currentAddress: data.currentAddress || "",
            employer: data.employer || "",
            income: data.income ? String(data.income) : "",
            rentalHistory: data.rentalHistory || prev.rentalHistory,
            evictionHistory: data.evictionHistory || prev.evictionHistory,
            documents: data.documents || [],
          }));
        }
      } else if (res.status === 404) {
        setError("Application not found. This link may be invalid or expired.");
      }
    } catch (err) {
      console.error("Failed to fetch application:", err);
      setError("Failed to load application.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchApplication();
  }, [fetchApplication]);

  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateRentalHistory = (index: number, field: keyof RentalHistoryEntry, value: string) => {
    setFormData((prev) => {
      const updated = [...prev.rentalHistory];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, rentalHistory: updated };
    });
  };

  const addRentalHistory = () => {
    setFormData((prev) => ({
      ...prev,
      rentalHistory: [
        ...prev.rentalHistory,
        { address: "", landlordName: "", landlordPhone: "", duration: "", reasonForLeaving: "" },
      ],
    }));
  };

  const removeRentalHistory = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      rentalHistory: prev.rentalHistory.filter((_, i) => i !== index),
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Maximum size is 10MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setFormData((prev) => ({
          ...prev,
          documents: [
            ...prev.documents,
            {
              name: file.name,
              type: file.type,
              size: file.size,
              dataUrl,
            },
          ],
        }));
      };
      reader.readAsDataURL(file);
    });

    // Reset the input
    e.target.value = "";
  };

  const removeDocument = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async () => {
    if (!formData.firstName || !formData.lastName) {
      setError("First name and last name are required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email || null,
          phone: formData.phone || null,
          currentAddress: formData.currentAddress || null,
          employer: formData.employer || null,
          income: formData.income || null,
          rentalHistory: formData.rentalHistory.filter((r) => r.address),
          evictionHistory: formData.evictionHistory,
          documents: formData.documents.map(({ name, type, size, dataUrl }) => ({
            name,
            type,
            size,
            dataUrl,
          })),
        }),
      });

      if (res.ok) {
        setStep("submitted");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to submit application.");
      }
    } catch (err) {
      console.error("Failed to submit application:", err);
      setError("Failed to submit application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex].key);
    }
  };

  const goPrev = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(STEPS[prevIndex].key);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Loading application...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !application) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto size-12 text-destructive" />
            <p className="mt-4 text-lg font-medium">Invalid Application Link</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "submitted") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="mx-auto size-16 text-green-500" />
            <h2 className="mt-4 text-xl font-bold">Application Submitted!</h2>
            <p className="mt-2 text-muted-foreground">
              Your application has been received and is being reviewed.
              We will contact you via{" "}
              {formData.phone ? "phone" : formData.email ? "email" : "the provided contact"}{" "}
              with updates.
            </p>
            {application && (
              <div className="mt-4 rounded-lg bg-muted p-4 text-sm text-left">
                <p><span className="font-medium">Name:</span> {formData.firstName} {formData.lastName}</p>
                {formData.email && <p><span className="font-medium">Email:</span> {formData.email}</p>}
                {formData.phone && <p><span className="font-medium">Phone:</span> {formData.phone}</p>}
                <p className="mt-2 text-xs text-muted-foreground">
                  Application ID: {application.id}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Rental Application</h1>
          <p className="mt-1 text-muted-foreground">
            Please complete all sections of this application
          </p>
        </div>

        {/* Step Indicator */}
        <div className="mb-6 flex items-center justify-center gap-1 overflow-x-auto px-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <button
                onClick={() => setStep(s.key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  step === s.key
                    ? "bg-primary text-primary-foreground"
                    : i < currentStepIndex
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {s.icon}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="mx-1 size-3 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Step: Identity */}
        {step === "identity" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="firstName">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    placeholder="First name"
                    value={formData.firstName}
                    onChange={(e) => updateField("firstName", e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="lastName">
                    Last Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    placeholder="Last name"
                    value={formData.lastName}
                    onChange={(e) => updateField("lastName", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    className="pl-9"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    className="pl-9"
                    placeholder="(555) 123-4567"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currentAddress">Current Address</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="currentAddress"
                    className="pl-9"
                    placeholder="123 Main St, City, State ZIP"
                    value={formData.currentAddress}
                    onChange={(e) => updateField("currentAddress", e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={goNext} disabled={!formData.firstName || !formData.lastName}>
                  Next <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Rental History */}
        {step === "rental" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="size-5" />
                Rental History
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              {formData.rentalHistory.map((entry, index) => (
                <div key={index} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium">
                      Previous Residence {index + 1}
                    </h4>
                    {formData.rentalHistory.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRentalHistory(index)}
                        className="text-destructive h-auto py-1"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Address</Label>
                      <Input
                        placeholder="Previous address"
                        value={entry.address}
                        onChange={(e) => updateRentalHistory(index, "address", e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Landlord Name</Label>
                        <Input
                          placeholder="Landlord name"
                          value={entry.landlordName}
                          onChange={(e) => updateRentalHistory(index, "landlordName", e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Landlord Phone</Label>
                        <Input
                          placeholder="Phone number"
                          value={entry.landlordPhone}
                          onChange={(e) => updateRentalHistory(index, "landlordPhone", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Duration</Label>
                        <Input
                          placeholder="e.g., 2 years"
                          value={entry.duration}
                          onChange={(e) => updateRentalHistory(index, "duration", e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Reason for Leaving</Label>
                        <Input
                          placeholder="Why did you leave?"
                          value={entry.reasonForLeaving}
                          onChange={(e) => updateRentalHistory(index, "reasonForLeaving", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <Button variant="outline" onClick={addRentalHistory} className="w-full">
                + Add Another Residence
              </Button>

              {/* Eviction History */}
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-medium mb-3">Eviction History</h4>
                <div className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="hasEviction"
                      checked={formData.evictionHistory.hasEviction}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          evictionHistory: {
                            ...prev.evictionHistory,
                            hasEviction: e.target.checked,
                          },
                        }))
                      }
                      className="size-4 rounded border-input"
                    />
                    <Label htmlFor="hasEviction" className="text-sm">
                      I have been evicted or had eviction proceedings filed against me
                    </Label>
                  </div>
                  {formData.evictionHistory.hasEviction && (
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Please provide details</Label>
                      <Textarea
                        placeholder="Describe the circumstances..."
                        value={formData.evictionHistory.details}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            evictionHistory: {
                              ...prev.evictionHistory,
                              details: e.target.value,
                            },
                          }))
                        }
                        rows={3}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={goPrev}>
                  <ChevronLeft className="mr-1 size-4" /> Back
                </Button>
                <Button onClick={goNext}>
                  Next <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Employment */}
        {step === "employment" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="size-5" />
                Employment & Income
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="employer">Current Employer</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="employer"
                    className="pl-9"
                    placeholder="Company name"
                    value={formData.employer}
                    onChange={(e) => updateField("employer", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="income">Monthly Income</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="income"
                    type="number"
                    className="pl-9"
                    placeholder="0.00"
                    value={formData.income}
                    onChange={(e) => updateField("income", e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                You may be asked to provide pay stubs or bank statements as supporting documents in the next step.
              </p>
              <div className="flex justify-between">
                <Button variant="outline" onClick={goPrev}>
                  <ChevronLeft className="mr-1 size-4" /> Back
                </Button>
                <Button onClick={goNext}>
                  Next <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Documents */}
        {step === "documents" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-5" />
                Supporting Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                Please upload pay stubs, bank statements, or other proof of income.
                Accepted formats: PDF, JPG, PNG. Max 10MB per file.
              </p>

              <div className="rounded-lg border-2 border-dashed p-6 text-center">
                <Upload className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Click to upload or drag and drop
                </p>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileUpload}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  style={{ position: "relative" }}
                />
                <Button variant="outline" size="sm" className="mt-3 relative">
                  Choose Files
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileUpload}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </Button>
              </div>

              {formData.documents.length > 0 && (
                <div className="grid gap-2">
                  <Label className="text-sm font-medium">Uploaded Files</Label>
                  {formData.documents.map((doc, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(doc.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDocument(index)}
                        className="text-destructive h-auto py-1"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={goPrev}>
                  <ChevronLeft className="mr-1 size-4" /> Back
                </Button>
                <Button onClick={goNext}>
                  Next <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Review */}
        {step === "review" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="size-5" />
                Review & Submit
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                Please review your information before submitting. You can go back to any section to make changes.
              </p>

              {/* Identity Summary */}
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-medium mb-2">Personal Information</h4>
                <div className="grid gap-1 text-sm">
                  <p><span className="text-muted-foreground">Name:</span> {formData.firstName} {formData.lastName}</p>
                  {formData.email && <p><span className="text-muted-foreground">Email:</span> {formData.email}</p>}
                  {formData.phone && <p><span className="text-muted-foreground">Phone:</span> {formData.phone}</p>}
                  {formData.currentAddress && <p><span className="text-muted-foreground">Address:</span> {formData.currentAddress}</p>}
                </div>
              </div>

              {/* Rental History Summary */}
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-medium mb-2">Rental History</h4>
                {formData.rentalHistory.filter((r) => r.address).length > 0 ? (
                  <div className="grid gap-2 text-sm">
                    {formData.rentalHistory
                      .filter((r) => r.address)
                      .map((r, i) => (
                        <p key={i}>
                          <span className="text-muted-foreground">{i + 1}.</span> {r.address}
                          {r.duration && ` (${r.duration})`}
                        </p>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No rental history provided</p>
                )}
                <p className="mt-2 text-sm">
                  <span className="text-muted-foreground">Eviction history:</span>{" "}
                  {formData.evictionHistory.hasEviction ? "Yes" : "No"}
                </p>
              </div>

              {/* Employment Summary */}
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-medium mb-2">Employment & Income</h4>
                <div className="grid gap-1 text-sm">
                  {formData.employer && (
                    <p><span className="text-muted-foreground">Employer:</span> {formData.employer}</p>
                  )}
                  {formData.income && (
                    <p><span className="text-muted-foreground">Monthly Income:</span> ${parseFloat(formData.income).toLocaleString()}</p>
                  )}
                  {!formData.employer && !formData.income && (
                    <p className="text-muted-foreground">No employment info provided</p>
                  )}
                </div>
              </div>

              {/* Documents Summary */}
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-medium mb-2">Documents</h4>
                {formData.documents.length > 0 ? (
                  <p className="text-sm">{formData.documents.length} file(s) uploaded</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No documents uploaded</p>
                )}
              </div>

              {/* Background Check Consent */}
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm">
                  By submitting this application, I consent to a background check and verification
                  of the information provided above. I certify that all information is true and
                  accurate to the best of my knowledge.
                </p>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={goPrev}>
                  <ChevronLeft className="mr-1 size-4" /> Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !formData.firstName || !formData.lastName}
                >
                  {submitting ? "Submitting..." : "Submit Application"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
