"use client";

import { useState } from "react";
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

interface CreateListingDialogProps {
  propertyId: string;
  units: Unit[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
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
}: CreateListingDialogProps) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);

  const vacantUnits = units.filter((u) => u.status === "VACANT");

  function handleOpenChange(next: boolean) {
    if (!next) {
      setForm(initialForm);
    }
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          unitId: form.unitId || undefined,
          title: form.title,
          description: form.description,
          price: form.price ? Number(form.price) : undefined,
          bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
          bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
          availableDate: form.availableDate || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create listing");
      }
      setForm(initialForm);
      onCreated();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to create listing:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Listing</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new property listing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="listing-title">Title</Label>
            <Input
              id="listing-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="listing-description">Description</Label>
            <Textarea
              id="listing-description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="listing-price">Price</Label>
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
                  <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                  {vacantUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Listing"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
