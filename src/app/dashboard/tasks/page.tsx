"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Check,
  X,
  AlertCircle,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Filter,
  CheckSquare,
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

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source: string;
  sourceId: string | null;
  propertyId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  property: { id: string; address: string } | null;
}

interface Property {
  id: string;
  address: string;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  // Form
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState("MEDIUM");
  const [formPropertyId, setFormPropertyId] = useState("");
  const [formDueDate, setFormDueDate] = useState("");

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter === "active") {
        // default - pending + in_progress
      } else if (statusFilter !== "all") {
        params.set("status", statusFilter);
      } else {
        params.set("includeCompleted", "true");
      }
      if (propertyFilter !== "all") params.set("propertyId", propertyFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);

      const res = await fetch(`/api/tasks?${params}`);
      if (res.ok) {
        let data = await res.json();
        if (priorityFilter !== "all") {
          data = data.filter((t: Task) => t.priority === priorityFilter);
        }
        setTasks(data);
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, propertyFilter, sourceFilter, priorityFilter]);

  useEffect(() => {
    fetch("/api/properties")
      .then((res) => res.json())
      .then((data) => setProperties(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  function resetForm() {
    setFormTitle("");
    setFormDescription("");
    setFormPriority("MEDIUM");
    setFormPropertyId("");
    setFormDueDate("");
    setEditingTask(null);
  }

  function openEditDialog(task: Task) {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDescription(task.description || "");
    setFormPriority(task.priority);
    setFormPropertyId(task.propertyId || "");
    setFormDueDate(task.dueDate ? task.dueDate.split("T")[0] : "");
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!formTitle.trim()) return;

    if (editingTask) {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTask.id,
          title: formTitle,
          description: formDescription,
          priority: formPriority,
          dueDate: formDueDate || null,
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        resetForm();
        fetchTasks();
      }
    } else {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle,
          description: formDescription,
          priority: formPriority,
          propertyId: formPropertyId || null,
          dueDate: formDueDate || null,
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        resetForm();
        fetchTasks();
      }
    }
  }

  async function updateTaskStatus(id: string, status: string) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    fetchTasks();
  }

  async function deleteTask(id: string) {
    await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
    fetchTasks();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            Manage your to-do list and track tasks across all properties.
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTask ? "Edit Task" : "Create Task"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Task title"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Priority</Label>
                  <Select value={formPriority} onValueChange={setFormPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="URGENT">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                  />
                </div>
              </div>
              {!editingTask && (
                <div>
                  <Label>Property</Label>
                  <Select value={formPropertyId} onValueChange={setFormPropertyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.address}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button onClick={handleSubmit} className="w-full">
                {editingTask ? "Update Task" : "Create Task"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="DISMISSED">Dismissed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>

            <Select value={propertyFilter} onValueChange={setPropertyFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Property" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Properties</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="MANUAL">Manual</SelectItem>
                <SelectItem value="AIR_FILTER">Air Filter</SelectItem>
                <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                <SelectItem value="MESSAGE">Message</SelectItem>
                <SelectItem value="SYSTEM">System</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Task List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Tasks ({tasks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Loading...
            </p>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckSquare className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No tasks found. Create one to get started!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                >
                  <PriorityIndicator priority={task.priority} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditDialog(task)}
                        className="text-sm font-medium truncate hover:underline text-left"
                      >
                        {task.title}
                      </button>
                      <SourceBadge source={task.source} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {task.property && (
                        <span className="text-xs text-muted-foreground truncate">
                          {task.property.address}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          Due{" "}
                          {new Date(task.dueDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={task.status} />
                  <div className="flex items-center gap-1">
                    {(task.status === "PENDING" ||
                      task.status === "IN_PROGRESS") && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() =>
                            updateTaskStatus(task.id, "COMPLETED")
                          }
                          title="Complete"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            updateTaskStatus(task.id, "DISMISSED")
                          }
                          title="Dismiss"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {(task.status === "COMPLETED" ||
                      task.status === "DISMISSED") &&
                      task.source === "MANUAL" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteTask(task.id)}
                          title="Delete"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PriorityIndicator({ priority }: { priority: string }) {
  switch (priority) {
    case "URGENT":
      return <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />;
    case "HIGH":
      return <ArrowUp className="h-4 w-4 text-orange-500 shrink-0" />;
    case "MEDIUM":
      return <ArrowRight className="h-4 w-4 text-blue-500 shrink-0" />;
    case "LOW":
      return <ArrowDown className="h-4 w-4 text-gray-400 shrink-0" />;
    default:
      return null;
  }
}

function SourceBadge({ source }: { source: string }) {
  const labels: Record<string, string> = {
    MANUAL: "Manual",
    AIR_FILTER: "Air Filter",
    MAINTENANCE: "Maintenance",
    MESSAGE: "Message",
    SYSTEM: "System",
  };
  return (
    <Badge variant="outline" className="text-xs shrink-0">
      {labels[source] || source}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "PENDING":
      return <Badge variant="secondary">Pending</Badge>;
    case "IN_PROGRESS":
      return <Badge variant="default">In Progress</Badge>;
    case "COMPLETED":
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Done
        </Badge>
      );
    case "DISMISSED":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Dismissed
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
