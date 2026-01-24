"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  FileText,
  Pencil,
  Trash2,
  Copy,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface LeaseTemplate {
  id: string;
  name: string;
  content: string;
  description: string | null;
  jurisdiction: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { leases: number };
}

const AVAILABLE_MARKERS = [
  { key: "tenant_name", description: "Full tenant name" },
  { key: "tenant_first_name", description: "Tenant first name" },
  { key: "tenant_last_name", description: "Tenant last name" },
  { key: "tenant_email", description: "Tenant email address" },
  { key: "tenant_phone", description: "Tenant phone number" },
  { key: "property_address", description: "Property street address" },
  { key: "property_city", description: "Property city" },
  { key: "property_state", description: "Property state" },
  { key: "property_zip", description: "Property zip code" },
  { key: "property_full_address", description: "Full property address" },
  { key: "unit_name", description: "Unit/room name" },
  { key: "jurisdiction", description: "Property jurisdiction" },
  { key: "rent_amount", description: "Monthly rent amount" },
  { key: "rent_amount_words", description: "Rent amount in words" },
  { key: "start_date", description: "Lease start date" },
  { key: "end_date", description: "Lease end date" },
  { key: "lease_term", description: "Calculated lease term" },
  { key: "current_date", description: "Date of generation" },
  { key: "current_year", description: "Current year" },
];

export default function LeaseTemplatesPage() {
  const [templates, setTemplates] = useState<LeaseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<LeaseTemplate | null>(null);
  const [markersVisible, setMarkersVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formJurisdiction, setFormJurisdiction] = useState("");

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/lease-templates");
      if (res.ok) {
        setTemplates(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const resetForm = () => {
    setFormName("");
    setFormContent("");
    setFormDescription("");
    setFormJurisdiction("");
    setEditingTemplate(null);
  };

  const openEditDialog = (template: LeaseTemplate) => {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormContent(template.content);
    setFormDescription(template.description || "");
    setFormJurisdiction(template.jurisdiction || "");
    setCreateDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName || !formContent) return;
    setSaving(true);
    try {
      if (editingTemplate) {
        // Update existing
        const res = await fetch("/api/lease-templates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingTemplate.id,
            name: formName,
            content: formContent,
            description: formDescription || null,
            jurisdiction: formJurisdiction || null,
          }),
        });
        if (res.ok) {
          setCreateDialogOpen(false);
          resetForm();
          fetchTemplates();
        }
      } else {
        // Create new
        const res = await fetch("/api/lease-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            content: formContent,
            description: formDescription || null,
            jurisdiction: formJurisdiction || null,
          }),
        });
        if (res.ok) {
          setCreateDialogOpen(false);
          resetForm();
          fetchTemplates();
        }
      }
    } catch (error) {
      console.error("Failed to save template:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      const res = await fetch(`/api/lease-templates?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchTemplates();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete template");
      }
    } catch (error) {
      console.error("Failed to delete template:", error);
    }
  };

  const insertMarker = (key: string) => {
    setFormContent((prev) => prev + `{{${key}}}`);
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading templates...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/leases">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Lease Templates</h1>
            <p className="text-muted-foreground">
              Create and manage lease document templates with dynamic markers
            </p>
          </div>
        </div>
        <Dialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Edit Template" : "Create Lease Template"}
              </DialogTitle>
              <DialogDescription>
                Use {`{{marker_name}}`} syntax for dynamic fields that will be
                replaced when generating a lease.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Template Name</Label>
                  <Input
                    placeholder="e.g., Durham Room Sublease"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Jurisdiction</Label>
                  <Input
                    placeholder="e.g., Durham County, NC"
                    value={formJurisdiction}
                    onChange={(e) => setFormJurisdiction(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  placeholder="Brief description of this template"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Lease Content</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMarkersVisible(!markersVisible)}
                  >
                    <Info className="mr-1 h-3 w-3" />
                    {markersVisible ? "Hide" : "Show"} Markers
                  </Button>
                </div>
                {markersVisible && (
                  <div className="mb-3 p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-2">
                      Click a marker to insert it at the end of the content:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {AVAILABLE_MARKERS.map((marker) => (
                        <Button
                          key={marker.key}
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => insertMarker(marker.key)}
                          title={marker.description}
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          {`{{${marker.key}}}`}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <Textarea
                  placeholder={"SUBLEASE AGREEMENT\n\nThis Sublease Agreement is entered into on {{current_date}} between:\n\nLandlord/Sublessor: [Your Name]\nTenant/Sublessee: {{tenant_name}}\n\nProperty: {{property_full_address}}\nUnit: {{unit_name}}\n\nMonthly Rent: ${{rent_amount}} ({{rent_amount_words}})\nLease Term: {{start_date}} to {{end_date}}\n\n..."}
                  className="min-h-[400px] font-mono text-sm"
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!formName || !formContent || saving}
              >
                {saving
                  ? "Saving..."
                  : editingTemplate
                    ? "Update Template"
                    : "Create Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed rounded-lg">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No lease templates</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create a template with dynamic markers to generate leases
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(template)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDelete(template.id)}
                      disabled={template._count.leases > 0}
                      title={
                        template._count.leases > 0
                          ? "Cannot delete: template has leases"
                          : "Delete template"
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {template.description && (
                  <p className="text-sm text-muted-foreground">
                    {template.description}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  {template.jurisdiction && (
                    <Badge variant="outline">{template.jurisdiction}</Badge>
                  )}
                  <Badge variant="secondary">
                    {template._count.leases} lease
                    {template._count.leases !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {template.content.length > 100
                    ? template.content.substring(0, 100) + "..."
                    : template.content}
                </p>
                <p className="text-xs text-muted-foreground">
                  Updated {new Date(template.updatedAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Available Markers Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            Available Template Markers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {AVAILABLE_MARKERS.map((marker) => (
              <div
                key={marker.key}
                className="flex items-center gap-2 text-sm"
              >
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                  {`{{${marker.key}}}`}
                </code>
                <span className="text-muted-foreground text-xs">
                  {marker.description}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
