"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Wind,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Pencil,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface AirFilter {
  id: string;
  label: string | null;
  dimensions: string;
  lastChangedDate: string | null;
}

interface AirFilterConfig {
  id: string;
  propertyId: string;
  cadence: string;
  lastChangedDate: string | null;
  notes: string | null;
  isOverdue: boolean;
  nextDueDate: string | null;
  effectiveLastChanged: string | null;
  property: { id: string; address: string; city: string; state: string };
  filters: AirFilter[];
}

interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
}

interface FilterEntry {
  dimensions: string;
  label: string;
}

export default function MaintenancePage() {
  const [configs, setConfigs] = useState<AirFilterConfig[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  // Add config dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addPropertyId, setAddPropertyId] = useState("");
  const [addCadence, setAddCadence] = useState("MONTHS_3");
  const [addFilters, setAddFilters] = useState<FilterEntry[]>([
    { dimensions: "", label: "" },
  ]);
  const [addNotes, setAddNotes] = useState("");

  // Edit config dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editConfig, setEditConfig] = useState<AirFilterConfig | null>(null);
  const [editCadence, setEditCadence] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Log change dialog
  const [logOpen, setLogOpen] = useState(false);
  const [logConfig, setLogConfig] = useState<AirFilterConfig | null>(null);
  const [logDate, setLogDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [logFilterIds, setLogFilterIds] = useState<string[]>([]);

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/air-filters");
      if (res.ok) {
        setConfigs(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch air filter configs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/properties")
      .then((res) => res.json())
      .then((data) => setProperties(data))
      .catch(() => {});
    fetchConfigs();
  }, [fetchConfigs]);

  const configuredPropertyIds = new Set(configs.map((c) => c.propertyId));
  const availableProperties = properties.filter(
    (p) => !configuredPropertyIds.has(p.id)
  );

  async function handleAddConfig() {
    const validFilters = addFilters.filter((f) => f.dimensions.trim());
    if (!addPropertyId || validFilters.length === 0) return;

    const res = await fetch("/api/air-filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: addPropertyId,
        cadence: addCadence,
        filters: validFilters,
        notes: addNotes || null,
      }),
    });

    if (res.ok) {
      setAddOpen(false);
      setAddPropertyId("");
      setAddCadence("MONTHS_3");
      setAddFilters([{ dimensions: "", label: "" }]);
      setAddNotes("");
      fetchConfigs();
    }
  }

  async function handleEditConfig() {
    if (!editConfig) return;

    const res = await fetch("/api/air-filters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editConfig.id,
        cadence: editCadence,
        notes: editNotes,
      }),
    });

    if (res.ok) {
      setEditOpen(false);
      setEditConfig(null);
      fetchConfigs();
    }
  }

  async function handleDeleteConfig(id: string) {
    const res = await fetch(`/api/air-filters?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) fetchConfigs();
  }

  async function handleLogChange() {
    if (!logConfig) return;

    const res = await fetch("/api/air-filters/log-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        configId: logConfig.id,
        date: logDate,
        filterIds: logFilterIds.length > 0 ? logFilterIds : null,
      }),
    });

    if (res.ok) {
      setLogOpen(false);
      setLogConfig(null);
      setLogFilterIds([]);
      fetchConfigs();
    }
  }

  async function handleAddFilter(configId: string, dimensions: string, label: string) {
    const res = await fetch("/api/air-filters/filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configId, dimensions, label: label || null }),
    });
    if (res.ok) fetchConfigs();
  }

  async function handleDeleteFilter(filterId: string) {
    const res = await fetch(`/api/air-filters/filters?id=${filterId}`, {
      method: "DELETE",
    });
    if (res.ok) fetchConfigs();
  }

  function openEditDialog(config: AirFilterConfig) {
    setEditConfig(config);
    setEditCadence(config.cadence);
    setEditNotes(config.notes || "");
    setEditOpen(true);
  }

  function openLogDialog(config: AirFilterConfig) {
    setLogConfig(config);
    setLogDate(new Date().toISOString().split("T")[0]);
    setLogFilterIds([]);
    setLogOpen(true);
  }

  function toggleLogFilter(filterId: string) {
    setLogFilterIds((prev) =>
      prev.includes(filterId)
        ? prev.filter((id) => id !== filterId)
        : [...prev, filterId]
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Maintenance</h1>
        <p className="text-muted-foreground mt-1">
          Track maintenance schedules and tasks for your properties.
        </p>
      </div>

      <Tabs defaultValue="air-filters">
        <TabsList>
          <TabsTrigger value="air-filters" className="gap-2">
            <Wind className="h-4 w-4" />
            Air Filters
          </TabsTrigger>
        </TabsList>

        <TabsContent value="air-filters" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {configs.length} propert{configs.length === 1 ? "y" : "ies"}{" "}
              tracked
            </p>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button disabled={availableProperties.length === 0}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Property
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Air Filter Tracking</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Property</Label>
                    <Select
                      value={addPropertyId}
                      onValueChange={setAddPropertyId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select property" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableProperties.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.address}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Change Cadence</Label>
                    <Select value={addCadence} onValueChange={setAddCadence}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MONTHS_3">Every 3 months</SelectItem>
                        <SelectItem value="MONTHS_4">Every 4 months</SelectItem>
                        <SelectItem value="MONTHS_6">Every 6 months</SelectItem>
                        <SelectItem value="MONTHS_12">Every 12 months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Filters</Label>
                    <div className="space-y-2 mt-1">
                      {addFilters.map((f, i) => (
                        <div key={i} className="flex gap-2">
                          <Input
                            placeholder="Dimensions (e.g. 14x25)"
                            value={f.dimensions}
                            onChange={(e) => {
                              const updated = [...addFilters];
                              updated[i].dimensions = e.target.value;
                              setAddFilters(updated);
                            }}
                          />
                          <Input
                            placeholder="Label (optional)"
                            value={f.label}
                            onChange={(e) => {
                              const updated = [...addFilters];
                              updated[i].label = e.target.value;
                              setAddFilters(updated);
                            }}
                          />
                          {addFilters.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setAddFilters(
                                  addFilters.filter((_, j) => j !== i)
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setAddFilters([
                            ...addFilters,
                            { dimensions: "", label: "" },
                          ])
                        }
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Filter
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea
                      value={addNotes}
                      onChange={(e) => setAddNotes(e.target.value)}
                      placeholder="Optional notes"
                    />
                  </div>
                  <Button onClick={handleAddConfig} className="w-full">
                    Save Configuration
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Loading...
            </p>
          ) : configs.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center justify-center text-center">
                  <Wind className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No air filter tracking configured. Add a property to get
                    started.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {configs.map((config) => (
                <Card
                  key={config.id}
                  className={
                    config.isOverdue ? "border-destructive/50" : undefined
                  }
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {config.property.address}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {config.property.city}, {config.property.state}
                        </p>
                      </div>
                      {config.isOverdue ? (
                        <Badge variant="destructive" className="shrink-0">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Overdue
                        </Badge>
                      ) : (
                        <Badge
                          className="bg-green-100 text-green-800 hover:bg-green-100 shrink-0"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          OK
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cadence</span>
                        <span>{formatCadence(config.cadence)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Last Changed
                        </span>
                        <span>
                          {config.effectiveLastChanged
                            ? new Date(
                                config.effectiveLastChanged
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "Never"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Next Due</span>
                        <span>
                          {config.nextDueDate
                            ? new Date(config.nextDueDate).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                }
                              )
                            : "N/A"}
                        </span>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Filters ({config.filters.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {config.filters.map((f) => (
                          <Badge key={f.id} variant="outline" className="text-xs">
                            {f.dimensions}
                            {f.label ? ` (${f.label})` : ""}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {config.notes && (
                      <p className="text-xs text-muted-foreground italic">
                        {config.notes}
                      </p>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1"
                        onClick={() => openLogDialog(config)}
                      >
                        <Calendar className="h-3 w-3 mr-1" />
                        Log Change
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(config)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteConfig(config.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Config Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditConfig(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Edit Config - {editConfig?.property.address}
            </DialogTitle>
          </DialogHeader>
          {editConfig && (
            <div className="space-y-4">
              <div>
                <Label>Change Cadence</Label>
                <Select value={editCadence} onValueChange={setEditCadence}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHS_3">Every 3 months</SelectItem>
                    <SelectItem value="MONTHS_4">Every 4 months</SelectItem>
                    <SelectItem value="MONTHS_6">Every 6 months</SelectItem>
                    <SelectItem value="MONTHS_12">Every 12 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>
                  Filters ({editConfig.filters.length})
                </Label>
                <div className="space-y-2 mt-1">
                  {editConfig.filters.map((f) => (
                    <div key={f.id} className="flex items-center gap-2">
                      <Badge variant="outline">{f.dimensions}</Badge>
                      {f.label && (
                        <span className="text-xs text-muted-foreground">
                          {f.label}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-auto"
                        onClick={async () => {
                          await handleDeleteFilter(f.id);
                          setEditConfig({
                            ...editConfig,
                            filters: editConfig.filters.filter(
                              (ef) => ef.id !== f.id
                            ),
                          });
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <AddFilterInline
                    onAdd={(dimensions, label) =>
                      handleAddFilter(editConfig.id, dimensions, label)
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Optional notes"
                />
              </div>
              <Button onClick={handleEditConfig} className="w-full">
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Log Change Dialog */}
      <Dialog
        open={logOpen}
        onOpenChange={(open) => {
          setLogOpen(open);
          if (!open) {
            setLogConfig(null);
            setLogFilterIds([]);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Log Filter Change - {logConfig?.property.address}
            </DialogTitle>
          </DialogHeader>
          {logConfig && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="log-date">Date</Label>
                <Input
                  id="log-date"
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                />
              </div>
              <div>
                <Label>
                  Filters to update (leave unchecked for all)
                </Label>
                <div className="space-y-2 mt-1">
                  {logConfig.filters.map((f) => (
                    <label
                      key={f.id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={logFilterIds.includes(f.id)}
                        onChange={() => toggleLogFilter(f.id)}
                        className="rounded"
                      />
                      <span className="text-sm">
                        {f.dimensions}
                        {f.label ? ` (${f.label})` : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={handleLogChange} className="w-full">
                Log Change
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddFilterInline({
  onAdd,
}: {
  onAdd: (dimensions: string, label: string) => void;
}) {
  const [dimensions, setDimensions] = useState("");
  const [label, setLabel] = useState("");
  const [show, setShow] = useState(false);

  if (!show) {
    return (
      <Button variant="outline" size="sm" onClick={() => setShow(true)}>
        <Plus className="h-3 w-3 mr-1" />
        Add Filter
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      <Input
        placeholder="Dimensions"
        value={dimensions}
        onChange={(e) => setDimensions(e.target.value)}
        className="flex-1"
      />
      <Input
        placeholder="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="flex-1"
      />
      <Button
        size="sm"
        onClick={() => {
          if (dimensions.trim()) {
            onAdd(dimensions, label);
            setDimensions("");
            setLabel("");
            setShow(false);
          }
        }}
      >
        Add
      </Button>
    </div>
  );
}

function formatCadence(cadence: string): string {
  switch (cadence) {
    case "MONTHS_3":
      return "Every 3 months";
    case "MONTHS_4":
      return "Every 4 months";
    case "MONTHS_6":
      return "Every 6 months";
    case "MONTHS_12":
      return "Every 12 months";
    default:
      return cadence;
  }
}
