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
  ShieldCheck,
  Car,
  CalendarDays,
  IdCard,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Application {
  id: string;
  token: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  currentAddress: string | null;
  moveInDate: string | null;
  incomeSource: string | null;
  incomeDetails: string | null;
  income: number | null;
  rentalHistory: RentalHistoryEntry[] | null;
  evictionHistory: EvictionHistoryEntry | null;
  vehicles: VehicleEntry[] | null;
  idDocument: DocumentEntry | null;
  financialDocuments: DocumentEntry[] | null;
  backgroundCheckConsent: boolean | null;
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

interface VehicleEntry {
  make: string;
  model: string;
  year: string;
  color: string;
  licensePlate: string;
}

interface DocumentEntry {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

const INCOME_SOURCES = [
  { value: "Employment", label: "Employment" },
  { value: "Self-Employment", label: "Self-Employment" },
  { value: "Retirement/Pension", label: "Retirement/Pension" },
  { value: "Disability/SSI", label: "Disability/SSI" },
  { value: "Scholarships/Grants", label: "Scholarships/Grants" },
  { value: "Savings", label: "Savings" },
  { value: "Other", label: "Other" },
] as const;

function getIncomeDetailsLabel(source: string): string {
  switch (source) {
    case "Employment":
      return "Employer Name";
    case "Self-Employment":
      return "Business Name / Description";
    case "Scholarships/Grants":
      return "Institution / Grant Name";
    case "Savings":
      return "Bank / Description";
    case "Retirement/Pension":
      return "Source / Provider";
    case "Disability/SSI":
      return "Program / Case Number";
    default:
      return "Please describe";
  }
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ACCEPTED_FILE_TYPES = "image/jpeg,image/png,application/pdf";

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatLicensePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9 -]/g, "").slice(0, 10);
}

function formatVehicleYear(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

function capitalizeWords(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

type Step =
  | "personal"
  | "identification"
  | "rental"
  | "income"
  | "background"
  | "review"
  | "submitted";

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "personal", label: "Personal Info", icon: <User className="size-4" /> },
  { key: "identification", label: "ID", icon: <IdCard className="size-4" /> },
  { key: "rental", label: "History & Vehicles", icon: <Home className="size-4" /> },
  { key: "income", label: "Income", icon: <DollarSign className="size-4" /> },
  { key: "background", label: "Background Check", icon: <ShieldCheck className="size-4" /> },
  { key: "review", label: "Review", icon: <CheckCircle className="size-4" /> },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ApplicationPage() {
  const params = useParams();
  const token = params.token as string;

  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("personal");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    currentAddress: "",
    moveInDate: "",
    incomeSource: "",
    incomeDetails: "",
    income: "",
    rentalHistory: [
      { address: "", landlordName: "", landlordPhone: "", duration: "", reasonForLeaving: "" },
    ] as RentalHistoryEntry[],
    evictionHistory: { hasEviction: false, details: "" } as EvictionHistoryEntry,
    numberOfVehicles: 0,
    vehicles: [] as VehicleEntry[],
    idDocument: null as DocumentEntry | null,
    financialDocuments: [] as DocumentEntry[],
    backgroundCheckConsent: false,
  });

  const fetchApplication = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/applications?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        setApplication(data);

        if (data.submittedAt || data.status !== "PENDING") {
          setStep("submitted");
          return;
        }

        if (data.firstName) {
          const vehicles: VehicleEntry[] = data.vehicles || [];
          setFormData((prev) => ({
            ...prev,
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            email: data.email || "",
            phone: data.phone || "",
            currentAddress: data.currentAddress || "",
            moveInDate: data.moveInDate || "",
            incomeSource: data.incomeSource || "",
            incomeDetails: data.incomeDetails || "",
            income: data.income ? String(data.income) : "",
            rentalHistory: data.rentalHistory || prev.rentalHistory,
            evictionHistory: data.evictionHistory || prev.evictionHistory,
            numberOfVehicles: vehicles.length,
            vehicles,
            idDocument: data.idDocument || null,
            financialDocuments: data.financialDocuments || [],
            backgroundCheckConsent: data.backgroundCheckConsent || false,
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

  const updateField = (field: string, value: string | boolean | number) => {
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

  const updateVehicleCount = (count: number) => {
    const clamped = Math.max(0, count);
    setFormData((prev) => {
      const newVehicles: VehicleEntry[] = [];
      for (let i = 0; i < clamped; i++) {
        newVehicles.push(
          prev.vehicles[i] || { make: "", model: "", year: "", color: "", licensePlate: "" }
        );
      }
      return { ...prev, numberOfVehicles: clamped, vehicles: newVehicles };
    });
  };

  const updateVehicle = (index: number, field: keyof VehicleEntry, value: string) => {
    setFormData((prev) => {
      const updated = [...prev.vehicles];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, vehicles: updated };
    });
  };

  const handleIdUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      alert(`File ${file.name} is too large. Maximum size is 25MB.`);
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFormData((prev) => ({
        ...prev,
        idDocument: {
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: reader.result as string,
        },
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleFinancialDocsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.size > MAX_FILE_SIZE) {
        alert(`File ${file.name} is too large. Maximum size is 25MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setFormData((prev) => ({
          ...prev,
          financialDocuments: [
            ...prev.financialDocuments,
            {
              name: file.name,
              type: file.type,
              size: file.size,
              dataUrl: reader.result as string,
            },
          ],
        }));
      };
      reader.readAsDataURL(file);
    });

    e.target.value = "";
  };

  const removeFinancialDoc = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      financialDocuments: prev.financialDocuments.filter((_, i) => i !== index),
    }));
  };

  const canSubmit =
    formData.firstName &&
    formData.lastName &&
    formData.email &&
    formData.phone &&
    formData.currentAddress &&
    formData.moveInDate &&
    formData.idDocument &&
    formData.incomeSource &&
    formData.incomeDetails &&
    formData.financialDocuments.length >= 2 &&
    formData.backgroundCheckConsent;

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError("Please complete all required fields before submitting.");
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
          email: formData.email,
          phone: formData.phone,
          currentAddress: formData.currentAddress || null,
          moveInDate: formData.moveInDate || null,
          incomeSource: formData.incomeSource || null,
          incomeDetails: formData.incomeDetails || null,
          income: formData.income || null,
          rentalHistory: formData.rentalHistory.filter((r) => r.address),
          evictionHistory: formData.evictionHistory,
          vehicles: formData.vehicles,
          idDocument: formData.idDocument
            ? {
                name: formData.idDocument.name,
                type: formData.idDocument.type,
                size: formData.idDocument.size,
                dataUrl: formData.idDocument.dataUrl,
              }
            : null,
          financialDocuments: formData.financialDocuments.map(
            ({ name, type, size, dataUrl }) => ({ name, type, size, dataUrl })
          ),
          backgroundCheckConsent: formData.backgroundCheckConsent,
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
              Your application has been received and is being reviewed. We will contact you via{" "}
              {formData.phone ? "phone" : formData.email ? "email" : "the provided contact"} with
              updates.
            </p>
            {application && (
              <div className="mt-4 rounded-lg bg-muted p-4 text-left text-sm">
                <p>
                  <span className="font-medium">Name:</span> {formData.firstName}{" "}
                  {formData.lastName}
                </p>
                {formData.email && (
                  <p>
                    <span className="font-medium">Email:</span> {formData.email}
                  </p>
                )}
                {formData.phone && (
                  <p>
                    <span className="font-medium">Phone:</span> {formData.phone}
                  </p>
                )}
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

        {/* Step 1: Personal Info */}
        {step === "personal" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="firstName">
                    First Name                  </Label>
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
                    Last Name                  </Label>
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
                <Label htmlFor="email">
                  Email                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    className="pl-9"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">
                  Phone                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    className="pl-9"
                    placeholder="(555) 123-4567"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", formatPhoneNumber(e.target.value))}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currentAddress">
                  Current Address                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="currentAddress"
                    className="pl-9"
                    placeholder="123 Main St, City, State ZIP"
                    value={formData.currentAddress}
                    onChange={(e) => updateField("currentAddress", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="moveInDate">
                  Intended Move-In Date                </Label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="moveInDate"
                    type="date"
                    className="pl-9"
                    value={formData.moveInDate}
                    onChange={(e) => updateField("moveInDate", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={goNext}
                  disabled={
                    !formData.firstName ||
                    !formData.lastName ||
                    !formData.email ||
                    !formData.phone ||
                    !formData.currentAddress ||
                    !formData.moveInDate
                  }
                >
                  Next <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Identification */}
        {step === "identification" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IdCard className="size-5" />
                Identification
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>
                  Upload a photo or scan of your driver&apos;s license or government-issued ID{" "}
                                 </Label>
                <p className="text-xs text-muted-foreground">
                  Accepted formats: JPEG, PNG, PDF. Max size: 25MB.
                </p>
              </div>

              {formData.idDocument ? (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{formData.idDocument.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(formData.idDocument.size)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData((prev) => ({ ...prev, idDocument: null }))}
                    className="h-auto py-1 text-destructive"
                  >
                    <X className="mr-1 size-3" /> Remove
                  </Button>
                </div>
              ) : (
                <div className="relative rounded-lg border-2 border-dashed p-6 text-center">
                  <Upload className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">Click to upload your ID</p>
                  <Button variant="outline" size="sm" className="relative mt-3">
                    Choose File
                    <input
                      type="file"
                      accept={ACCEPTED_FILE_TYPES}
                      onChange={handleIdUpload}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </Button>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={goPrev}>
                  <ChevronLeft className="mr-1 size-4" /> Back
                </Button>
                <Button onClick={goNext} disabled={!formData.idDocument}>
                  Next <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Rental History & Vehicles */}
        {step === "rental" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="size-5" />
                Rental History & Vehicles
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              {formData.rentalHistory.map((entry, index) => (
                <div key={index} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-medium">Previous Residence {index + 1}</h4>
                    {formData.rentalHistory.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRentalHistory(index)}
                        className="h-auto py-1 text-destructive"
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Landlord Name</Label>
                        <Input
                          placeholder="Landlord name"
                          value={entry.landlordName}
                          onChange={(e) =>
                            updateRentalHistory(index, "landlordName", e.target.value)
                          }
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Landlord Phone</Label>
                        <Input
                          placeholder="Phone number"
                          value={entry.landlordPhone}
                          onChange={(e) =>
                            updateRentalHistory(index, "landlordPhone", formatPhoneNumber(e.target.value))
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                          onChange={(e) =>
                            updateRentalHistory(index, "reasonForLeaving", e.target.value)
                          }
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
                <h4 className="mb-3 text-sm font-medium">Have you ever been evicted or had eviction proceedings filed against you?</h4>
                <div className="grid gap-3">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          evictionHistory: { ...prev.evictionHistory, hasEviction: false },
                        }))
                      }
                      className={`flex-1 rounded-lg border-2 p-3 text-center text-sm font-medium transition-colors ${
                        !formData.evictionHistory.hasEviction
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-muted text-muted-foreground hover:border-muted-foreground/30"
                      }`}
                    >
                      No, I have not been evicted
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          evictionHistory: { ...prev.evictionHistory, hasEviction: true },
                        }))
                      }
                      className={`flex-1 rounded-lg border-2 p-3 text-center text-sm font-medium transition-colors ${
                        formData.evictionHistory.hasEviction
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-muted text-muted-foreground hover:border-muted-foreground/30"
                      }`}
                    >
                      Yes, I have been evicted
                    </button>
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

              {/* Vehicles */}
              <div className="rounded-lg border p-4">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Car className="size-4" />
                  Vehicles on the Property
                </h4>
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="numberOfVehicles" className="text-xs">
                      Number of vehicles that would be on the property
                    </Label>
                    <Input
                      id="numberOfVehicles"
                      type="number"
                      min={0}
                      value={formData.numberOfVehicles}
                      onChange={(e) => updateVehicleCount(parseInt(e.target.value) || 0)}
                      className="w-24"
                    />
                  </div>

                  {formData.vehicles.map((vehicle, index) => (
                    <div key={index} className="rounded-md border bg-muted/30 p-3">
                      <p className="mb-2 text-xs font-medium">Vehicle {index + 1}</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <div className="grid gap-1">
                          <Label className="text-xs">
                            Make                          </Label>
                          <Input
                            placeholder="e.g., Toyota"
                            value={vehicle.make}
                            onChange={(e) => updateVehicle(index, "make", capitalizeWords(e.target.value))}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">
                            Model                          </Label>
                          <Input
                            placeholder="e.g., Camry"
                            value={vehicle.model}
                            onChange={(e) => updateVehicle(index, "model", capitalizeWords(e.target.value))}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">
                            Year                          </Label>
                          <Input
                            placeholder="e.g., 2020"
                            value={vehicle.year}
                            onChange={(e) => updateVehicle(index, "year", formatVehicleYear(e.target.value))}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">
                            Color                          </Label>
                          <Input
                            placeholder="e.g., Silver"
                            value={vehicle.color}
                            onChange={(e) => updateVehicle(index, "color", capitalizeWords(e.target.value))}
                          />
                        </div>
                        <div className="col-span-2 grid gap-1 sm:col-span-2">
                          <Label className="text-xs">
                            License Plate                          </Label>
                          <Input
                            placeholder="e.g., ABC-1234"
                            value={vehicle.licensePlate}
                            onChange={(e) => updateVehicle(index, "licensePlate", formatLicensePlate(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={goPrev}>
                  <ChevronLeft className="mr-1 size-4" /> Back
                </Button>
                <Button
                  onClick={goNext}
                  disabled={
                    // Need at least one rental history entry with an address
                    !formData.rentalHistory.some((r) => r.address.trim()) ||
                    // If vehicles > 0, every vehicle must have all fields filled
                    (formData.numberOfVehicles > 0 &&
                      formData.vehicles.some(
                        (v) => !v.make || !v.model || !v.year || !v.color || !v.licensePlate
                      ))
                  }
                >
                  Next <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Income & Finances */}
        {step === "income" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="size-5" />
                Income & Finances
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="incomeSource">
                  Source of Income                </Label>
                <Select
                  value={formData.incomeSource}
                  onValueChange={(value) => updateField("incomeSource", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select income source" />
                  </SelectTrigger>
                  <SelectContent>
                    {INCOME_SOURCES.map((source) => (
                      <SelectItem key={source.value} value={source.value}>
                        {source.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.incomeSource && (
                <div className="grid gap-2">
                  <Label htmlFor="incomeDetails">
                    {getIncomeDetailsLabel(formData.incomeSource)}{" "}
                                     </Label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="incomeDetails"
                      className="pl-9"
                      placeholder={getIncomeDetailsLabel(formData.incomeSource)}
                      value={formData.incomeDetails}
                      onChange={(e) => updateField("incomeDetails", e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Financial Documents */}
              <div className="grid gap-2">
                <Label>
                  Financial Documents                </Label>
                <p className="text-xs text-muted-foreground">
                  Upload at least 2 documents showing proof of income for the previous 2 months
                  (pay stubs, bank statements, tax returns, etc.). Accepted formats: JPEG, PNG, PDF. Max 25MB per file.
                </p>
              </div>

              <div className="relative rounded-lg border-2 border-dashed p-6 text-center">
                <Upload className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Click to upload financial documents
                </p>
                <Button variant="outline" size="sm" className="relative mt-3">
                  Choose Files
                  <input
                    type="file"
                    multiple
                    accept={ACCEPTED_FILE_TYPES}
                    onChange={handleFinancialDocsUpload}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </Button>
              </div>

              {formData.financialDocuments.length > 0 && (
                <div className="grid gap-2">
                  <Label className="text-sm font-medium">Uploaded Files</Label>
                  {formData.financialDocuments.map((doc, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(doc.size)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFinancialDoc(index)}
                        className="h-auto py-1 text-destructive"
                      >
                        <X className="mr-1 size-3" /> Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={goPrev}>
                  <ChevronLeft className="mr-1 size-4" /> Back
                </Button>
                <Button
                  onClick={goNext}
                  disabled={
                    !formData.incomeSource ||
                    !formData.incomeDetails ||
                    formData.financialDocuments.length < 2
                  }
                >
                  Next <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Background Check Consent */}
        {step === "background" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5" />
                Background Check Consent
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm leading-relaxed">
                  As part of the application process, we will conduct a background check and a soft
                  credit inquiry. A soft credit inquiry does not affect your credit score. The
                  background check may include verification of identity, criminal history, and prior
                  eviction records. All information obtained will be kept confidential and used solely
                  for the purpose of evaluating your rental application.
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <input
                  type="checkbox"
                  id="backgroundCheckConsent"
                  checked={formData.backgroundCheckConsent}
                  onChange={(e) => updateField("backgroundCheckConsent", e.target.checked)}
                  className="mt-0.5 size-4 rounded border-input"
                />
                <Label htmlFor="backgroundCheckConsent" className="text-sm leading-relaxed">
                  I consent to a background check and soft credit inquiry{" "}
                                 </Label>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={goPrev}>
                  <ChevronLeft className="mr-1 size-4" /> Back
                </Button>
                <Button onClick={goNext} disabled={!formData.backgroundCheckConsent}>
                  Next <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 6: Review & Submit */}
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
                Please review your information before submitting. You can go back to any section to
                make changes.
              </p>

              {/* Personal Info Summary */}
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Personal Information</h4>
                <div className="grid gap-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Name:</span> {formData.firstName}{" "}
                    {formData.lastName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Email:</span> {formData.email}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Phone:</span> {formData.phone}
                  </p>
                  {formData.currentAddress && (
                    <p>
                      <span className="text-muted-foreground">Address:</span>{" "}
                      {formData.currentAddress}
                    </p>
                  )}
                  {formData.moveInDate && (
                    <p>
                      <span className="text-muted-foreground">Move-In Date:</span>{" "}
                      {formData.moveInDate}
                    </p>
                  )}
                </div>
              </div>

              {/* ID Document Summary */}
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Identification</h4>
                {formData.idDocument ? (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="size-4 text-muted-foreground" />
                    <span>{formData.idDocument.name}</span>
                    <span className="text-muted-foreground">
                      ({formatFileSize(formData.idDocument.size)})
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-destructive">No ID uploaded</p>
                )}
              </div>

              {/* Rental History Summary */}
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Rental History</h4>
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
                {formData.vehicles.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-muted-foreground">
                      Vehicles: {formData.vehicles.length}
                    </p>
                    {formData.vehicles.map((v, i) => (
                      <p key={i} className="text-sm">
                        <span className="text-muted-foreground">{i + 1}.</span> {v.year} {v.make}{" "}
                        {v.model} ({v.color}) - {v.licensePlate}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Income Summary */}
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Income & Finances</h4>
                <div className="grid gap-1 text-sm">
                  {formData.incomeSource && (
                    <p>
                      <span className="text-muted-foreground">Source:</span>{" "}
                      {formData.incomeSource}
                    </p>
                  )}
                  {formData.incomeDetails && (
                    <p>
                      <span className="text-muted-foreground">
                        {getIncomeDetailsLabel(formData.incomeSource)}:
                      </span>{" "}
                      {formData.incomeDetails}
                    </p>
                  )}
                </div>
                <div className="mt-2">
                  <p className="text-sm text-muted-foreground">
                    Financial Documents: {formData.financialDocuments.length} file(s)
                  </p>
                  {formData.financialDocuments.map((doc, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <FileText className="size-3 text-muted-foreground" />
                      <span>{doc.name}</span>
                      <span className="text-muted-foreground">({formatFileSize(doc.size)})</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Background Check */}
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Background Check Consent</h4>
                <p className="text-sm">
                  {formData.backgroundCheckConsent ? (
                    <span className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle className="size-4" /> Consent given
                    </span>
                  ) : (
                    <span className="text-destructive">Consent not given</span>
                  )}
                </p>
              </div>

              {/* Missing fields warning */}
              {!canSubmit && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  Please complete all required fields before submitting:
                  <ul className="mt-1 list-inside list-disc">
                    {!formData.firstName && <li>First Name</li>}
                    {!formData.lastName && <li>Last Name</li>}
                    {!formData.email && <li>Email</li>}
                    {!formData.phone && <li>Phone</li>}
                    {!formData.currentAddress && <li>Current Address</li>}
                    {!formData.moveInDate && <li>Move-In Date</li>}
                    {!formData.idDocument && <li>Government ID</li>}
                    {!formData.incomeSource && <li>Source of Income</li>}
                    {!formData.incomeDetails && <li>Income Details</li>}
                    {formData.financialDocuments.length < 2 && <li>Financial Documents (at least 2 required)</li>}
                    {!formData.backgroundCheckConsent && <li>Background Check Consent</li>}
                  </ul>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={goPrev}>
                  <ChevronLeft className="mr-1 size-4" /> Back
                </Button>
                <Button onClick={handleSubmit} disabled={submitting || !canSubmit}>
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
