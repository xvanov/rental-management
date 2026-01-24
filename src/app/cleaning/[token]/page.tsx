"use client";

import { useParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Camera, X, Upload, Sparkles } from "lucide-react";

interface Assignment {
  id: string;
  token: string;
  weekOf: string;
  status: string;
  notes: string | null;
  tenant: { id: string; firstName: string; lastName: string };
  unit: { name: string; property: { id: string; address: string; city: string } };
}

interface PhotoFile {
  name: string;
  dataUrl: string;
  preview: string;
}

export default function CleaningSubmissionPage() {
  const params = useParams();
  const token = params.token as string;
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAssignment = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/cleaning-assignments?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        setAssignment(data);
        if (data.status === "SUBMITTED" || data.status === "VALIDATED") {
          setSubmitted(true);
          setSubmitMessage("Your cleaning submission has been received.");
        }
      } else if (res.status === 404) {
        setError("This cleaning assignment link is invalid or has expired.");
      } else {
        setError("Failed to load assignment details.");
      }
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAssignment();
  }, [fetchAssignment]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > 10 * 1024 * 1024) return; // 10MB limit

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setPhotos((prev) => [
          ...prev,
          { name: file.name, dataUrl, preview: dataUrl },
        ]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (photos.length < 5) {
      setSubmitError("Please submit at least 5 photos covering all common areas.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/cleaning-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          token,
          photos: photos.map((p) => ({ name: p.name, dataUrl: p.dataUrl })),
        }),
      });

      const result = await res.json();

      if (result.success) {
        setSubmitted(true);
        setSubmitMessage(result.message || "Your cleaning photos have been submitted successfully!");
      } else {
        setSubmitError(result.message || "Submission was rejected. Please try again.");
      }
    } catch {
      setSubmitError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-lg font-medium">{error}</p>
            <p className="text-sm text-muted-foreground">
              If you believe this is a mistake, please contact your property manager.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
            <h2 className="text-2xl font-bold">Submitted!</h2>
            <p className="text-muted-foreground">{submitMessage}</p>
            {assignment && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Property: {assignment.unit.property.address}</p>
                <p>Week of: {new Date(assignment.weekOf).toLocaleDateString()}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!assignment) return null;

  const weekOfDate = new Date(assignment.weekOf);
  const deadlineDate = new Date(weekOfDate);
  deadlineDate.setDate(deadlineDate.getDate() + 7); // Sunday midnight

  return (
    <div className="min-h-screen bg-muted/40 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Cleaning Submission</CardTitle>
            </div>
            <CardDescription>
              Submit photos of your cleaning for the week of{" "}
              {weekOfDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Property:</span>
              <span className="font-medium">{assignment.unit.property.address}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Assigned to:</span>
              <span className="font-medium">
                {assignment.tenant.firstName} {assignment.tenant.lastName}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Deadline:</span>
              <span className="font-medium">
                Sunday, {deadlineDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} midnight
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status:</span>
              <Badge variant={assignment.status === "PENDING" ? "secondary" : "default"}>
                {assignment.status}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Requirements */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1.5 text-muted-foreground list-disc list-inside">
              <li>Submit at least <strong className="text-foreground">5 photos</strong></li>
              <li>Cover all common areas: kitchen, bathroom, living room, hallways</li>
              <li>Photos should clearly show cleaned surfaces</li>
              <li>Include outdoor/porch areas if applicable</li>
              <li>Accepted formats: JPG, PNG, WebP</li>
              <li>Max file size: 10MB per photo</li>
            </ul>
          </CardContent>
        </Card>

        {/* Photo Upload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Photos ({photos.length}/5 minimum)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Photo Grid */}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.preview}
                      alt={photo.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removePhoto(index)}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 truncate">
                      {photo.name}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Button */}
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="mr-2 h-4 w-4" />
                {photos.length === 0 ? "Add Photos" : "Add More Photos"}
              </Button>
            </div>

            {/* Submit Error */}
            {submitError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive">{submitError}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={submitting || photos.length < 5}
            >
              {submitting ? (
                "Submitting..."
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Submit Cleaning Photos ({photos.length} photo{photos.length !== 1 ? "s" : ""})
                </>
              )}
            </Button>

            {photos.length < 5 && photos.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                {5 - photos.length} more photo{5 - photos.length !== 1 ? "s" : ""} needed
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
