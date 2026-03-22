"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

interface CustomRule {
  rule: string;
  details?: string;
}

interface PropertyRules {
  petPolicy: string;
  smokingAllowed: boolean;
  maxOccupants: number | null;
  parkingSpaces: number | null;
  customRules: CustomRule[];
}

const PET_POLICIES = [
  { value: "NO_PETS", label: "No Pets" },
  { value: "CATS_ONLY", label: "Cats Only" },
  { value: "DOGS_CATS", label: "Dogs & Cats" },
  { value: "ALL_PETS", label: "All Pets" },
] as const;

export function PropertyRulesEditor({
  propertyId,
}: {
  propertyId: string;
}) {
  const [rules, setRules] = useState<PropertyRules>({
    petPolicy: "NO_PETS",
    smokingAllowed: false,
    maxOccupants: null,
    parkingSpaces: null,
    customRules: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function fetchRules() {
      try {
        const res = await fetch(`/api/properties/${propertyId}/rules`);
        if (res.ok) {
          const data = await res.json();
          setRules({
            petPolicy: data.petPolicy ?? "NO_PETS",
            smokingAllowed: data.smokingAllowed ?? false,
            maxOccupants: data.maxOccupants ?? null,
            parkingSpaces: data.parkingSpaces ?? null,
            customRules: data.customRules ?? [],
          });
        }
      } catch (err) {
        console.error("Failed to fetch property rules:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchRules();
  }, [propertyId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/properties/${propertyId}/rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save rules");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save property rules:", err);
    } finally {
      setSaving(false);
    }
  }

  function addCustomRule() {
    setRules((prev) => ({
      ...prev,
      customRules: [...prev.customRules, { rule: "", details: "" }],
    }));
  }

  function removeCustomRule(index: number) {
    setRules((prev) => ({
      ...prev,
      customRules: prev.customRules.filter((_, i) => i !== index),
    }));
  }

  function updateCustomRule(
    index: number,
    field: keyof CustomRule,
    value: string
  ) {
    setRules((prev) => ({
      ...prev,
      customRules: prev.customRules.map((r, i) =>
        i === index ? { ...r, [field]: value } : r
      ),
    }));
  }

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        Loading rules...
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Pet Policy</Label>
          <Select
            value={rules.petPolicy}
            onValueChange={(val) =>
              setRules((prev) => ({ ...prev, petPolicy: val }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PET_POLICIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Smoking</Label>
          <Button
            type="button"
            variant={rules.smokingAllowed ? "default" : "outline"}
            className="w-full justify-start"
            onClick={() =>
              setRules((prev) => ({
                ...prev,
                smokingAllowed: !prev.smokingAllowed,
              }))
            }
          >
            {rules.smokingAllowed ? "Allowed" : "Not Allowed"}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="max-occupants">Max Occupants</Label>
          <Input
            id="max-occupants"
            type="number"
            min={1}
            value={rules.maxOccupants ?? ""}
            onChange={(e) =>
              setRules((prev) => ({
                ...prev,
                maxOccupants: e.target.value ? Number(e.target.value) : null,
              }))
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="parking-spaces">Parking Spaces</Label>
          <Input
            id="parking-spaces"
            type="number"
            min={0}
            value={rules.parkingSpaces ?? ""}
            onChange={(e) =>
              setRules((prev) => ({
                ...prev,
                parkingSpaces: e.target.value ? Number(e.target.value) : null,
              }))
            }
          />
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <Label>Custom Rules</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCustomRule}
          >
            <Plus className="size-4" />
            Add Rule
          </Button>
        </div>
        {rules.customRules.map((cr, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="grid flex-1 gap-1">
              <Input
                placeholder="Rule"
                value={cr.rule}
                onChange={(e) => updateCustomRule(i, "rule", e.target.value)}
              />
              <Input
                placeholder="Details (optional)"
                value={cr.details ?? ""}
                onChange={(e) =>
                  updateCustomRule(i, "details", e.target.value)
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeCustomRule(i)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Rules"}
        </Button>
        {saved && (
          <span className="text-sm text-green-600">Saved successfully</span>
        )}
      </div>
    </div>
  );
}
