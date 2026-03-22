"use client";

import { useRef, useState } from "react";
import { ImagePlus, Sparkles, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface Unit {
  id: string;
  name: string;
  status: string;
}

interface UploadedMedia {
  mediaId: string;
  fileName: string;
  mimeType: string;
  previewUrl: string;
}

interface ListingToEdit {
  id: string;
  title: string;
  description: string;
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  availableDate: string | null;
  unitId: string | null;
  photos: string[] | null;
}

interface CreateListingDialogProps {
  propertyId: string;
  units: Unit[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  editListing?: ListingToEdit | null;
}

const initialForm = {
  title: "",
  description: "",
  price: "",
  bedrooms: "",
  bathrooms: "",
  availableDate: "",
  unitId: "",
};

export function CreateListingDialog({
  propertyId,
  units,
  open,
  onOpenChange,
  onCreated,
  editListing,
}: CreateListingDialogProps) {
  const [form, setForm] = useState(initialForm);
  const [uploads, setUploads] = useState<UploadedMedia[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editListing;
  const vacantUnits = units.filter((u) => u.status === "VACANT");

  function handleOpenChange(next: boolean) {
    if (next && editListing) {
      setForm({
        title: editListing.title,
        description: editListing.description,
        price: editListing.price.toString(),
        bedrooms: editListing.bedrooms?.toString() ?? "",
        bathrooms: editListing.bathrooms?.toString() ?? "",
        availableDate: editListing.availableDate
          ? editListing.availableDate.split("T")[0]
          : "",
        unitId: editListing.unitId ?? "",
      });
      setExistingPhotos(editListing.photos ?? []);
    } else if (!next) {
      setForm(initialForm);
      setUploads([]);
      setExistingPhotos([]);
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/media/upload", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          setUploads((prev) => [
            ...prev,
            {
              mediaId: data.mediaId,
              fileName: data.fileName,
              mimeType: data.mimeType,
              previewUrl: URL.createObjectURL(file),
            },
          ]);
        }
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeUpload(mediaId: string) {
    setUploads((prev) => {
      const item = prev.find((u) => u.mediaId === mediaId);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((u) => u.mediaId !== mediaId);
    });
  }

  function removeExistingPhoto(index: number) {
    setExistingPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleGenerateDescription() {
    setGenerating(true);
    setError(null);
    try {
      const selectedUnit = units.find((u) => u.id === form.unitId);
      const res = await fetch("/api/listings/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          title: form.title,
          price: form.price,
          bedrooms: form.bedrooms,
          bathrooms: form.bathrooms,
          unitName: selectedUnit?.name,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setForm((prev) => ({ ...prev, description: data.description }));
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to generate description");
      }
    } catch {
      setError("Failed to generate description");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Combine existing photos + new uploads
    const allPhotos = [
      ...existingPhotos,
      ...uploads.map((u) => `/api/media/${u.mediaId}`),
    ];

    try {
      const payload = {
        propertyId,
        unitId: form.unitId || undefined,
        title: form.title,
        description: form.description,
        price: form.price ? Number(form.price) : undefined,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
        availableDate: form.availableDate || undefined,
        photos: allPhotos.length > 0 ? allPhotos : undefined,
      };

      let res: Response;
      if (isEditing && editListing) {
        res = await fetch("/api/listings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editListing.id, ...payload }),
        });
      } else {
        res = await fetch("/api/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save listing");
      }
      setForm(initialForm);
      setUploads([]);
      setExistingPhotos([]);
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save listing");
    } finally {
      setLoading(false);
    }
  }

  const totalMedia = existingPhotos.length + uploads.length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Listing" : "Create Listing"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the listing details."
              : "Fill in the details to create a new property listing."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="listing-title">Title</Label>
            <Input
              id="listing-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Spacious 3BR home near downtown"
              required
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="listing-description">Description</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleGenerateDescription}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 size-3" />
                )}
                {generating ? "Generating..." : "AI Generate"}
              </Button>
            </div>
            <Textarea
              id="listing-description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={4}
              placeholder="Describe the property..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="listing-price">Price ($/mo)</Label>
              <Input
                id="listing-price"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="listing-bedrooms">Bedrooms</Label>
              <Input
                id="listing-bedrooms"
                type="number"
                min={0}
                value={form.bedrooms}
                onChange={(e) =>
                  setForm({ ...form, bedrooms: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="listing-bathrooms">Bathrooms</Label>
              <Input
                id="listing-bathrooms"
                type="number"
                min={0}
                step={0.5}
                value={form.bathrooms}
                onChange={(e) =>
                  setForm({ ...form, bathrooms: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="listing-date">Available Date</Label>
              <Input
                id="listing-date"
                type="date"
                value={form.availableDate}
                onChange={(e) =>
                  setForm({ ...form, availableDate: e.target.value })
                }
              />
            </div>
          </div>

          {vacantUnits.length > 0 && (
            <div className="grid gap-2">
              <Label>Unit</Label>
              <Select
                value={form.unitId}
                onValueChange={(val) => setForm({ ...form, unitId: val })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Entire property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Entire property</SelectItem>
                  {vacantUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Photos / Videos */}
          <div className="grid gap-2">
            <Label>Photos & Videos ({totalMedia})</Label>

            {isEditing && editListing?.photos && editListing.photos.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {editListing.photos.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Photo ${i + 1}`}
                      className="size-16 rounded object-cover border opacity-75"
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Photos cannot be changed after publishing to Facebook. To use different photos, remove this listing and create a new one.
                </p>
              </>
            ) : !isEditing ? (
              <>
                {/* New uploads */}
                {uploads.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {uploads.map((upload) => (
                      <div key={upload.mediaId} className="relative group">
                        {upload.mimeType.startsWith("video/") ? (
                          <div className="size-16 rounded border bg-muted flex items-center justify-center text-xs">
                            Video
                          </div>
                        ) : (
                          <img
                            src={upload.previewUrl}
                            alt={upload.fileName}
                            className="size-16 rounded object-cover border"
                          />
                        )}
                        <button
                          type="button"
                          className="absolute -top-1 -right-1 size-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeUpload(upload.mediaId)}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : (
                      <ImagePlus className="mr-1 size-3" />
                    )}
                    {uploading ? "Uploading..." : "Add Photos/Videos"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No photos attached.</p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Create Listing"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
