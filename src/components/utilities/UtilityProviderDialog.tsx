"use client";

import { useState, useCallback, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  RefreshCw,
  Droplets,
  Zap,
  Flame,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Generic bill interface that works for both Durham Water and Duke Energy
export interface UtilityBill {
  document_type: string;
  account_number: string;
  service_location?: string;
  service_address?: string;
  bill_date: string | null;
  due_date: string | null;
  amount_due: number;
  billing_period_start: string | null;
  billing_period_end: string | null;
  requires_attention: boolean;
  attention_reason: string | null;
  matched_property_id: string | null;
  imported?: boolean;
  stored_id?: string;
  parsed_at?: string;
  // Duke Energy specific
  kwh_used?: number;
  // Durham Water specific
  disconnect_date?: string | null;
}

export interface UtilityProviderConfig {
  name: string;
  type: "water" | "electric" | "gas" | "internet";
  apiEndpoint: string;
  icon: React.ReactNode;
  iconColor: string;
  credentialsEnvPrefix: string;
}

interface UtilityProviderDialogProps {
  config: UtilityProviderConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

export function UtilityProviderDialog({
  config,
  open,
  onOpenChange,
  onImportComplete,
}: UtilityProviderDialogProps) {
  const [loading, setLoading] = useState(false);
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [attentionBills, setAttentionBills] = useState<UtilityBill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<"parse" | "fetch">("parse");
  const [source, setSource] = useState<"stored" | "parsed" | null>(null);

  const getServiceLocation = (bill: UtilityBill) =>
    bill.service_location || bill.service_address || "Unknown";

  const loadStoredBills = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${config.apiEndpoint}?stored=true`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load stored bills");
        return;
      }

      setBills(data.bills || []);
      setAttentionBills(data.attention_required || []);
      setSource("stored");
    } catch {
      setError("Failed to connect to service");
    } finally {
      setLoading(false);
    }
  }, [config.apiEndpoint]);

  useEffect(() => {
    if (open && bills.length === 0 && attentionBills.length === 0) {
      loadStoredBills();
    }
  }, [open, bills.length, attentionBills.length, loadStoredBills]);

  const handleFetch = async (fetchMode: "parse" | "fetch") => {
    setLoading(true);
    setError(null);
    setBills([]);
    setAttentionBills([]);
    setMode(fetchMode);

    try {
      const url = fetchMode === "parse"
        ? `${config.apiEndpoint}?parseOnly=true`
        : config.apiEndpoint;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `Failed to fetch ${config.name} bills`);
        return;
      }

      setBills(data.bills || []);
      setAttentionBills(data.attention_required || []);
      setSource(data.source || "parsed");

      if ((data.bills?.length || 0) === 0 && (data.attention_required?.length || 0) === 0) {
        if (fetchMode === "parse") {
          setError(
            `No PDF bills found. Use 'Download from Portal' to fetch bills from the ${config.name} website, or manually place PDF files in the download directory.`
          );
        } else {
          setError(
            `No bills were downloaded. Check that ${config.credentialsEnvPrefix}_USER and ${config.credentialsEnvPrefix}_PASS are set in your environment.`
          );
        }
      }
    } catch {
      setError(`Failed to connect to ${config.name} service`);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    const allBills = [...bills, ...attentionBills];
    if (allBills.length === 0) return;

    setImporting(true);
    try {
      const res = await fetch(config.apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bills: allBills }),
      });

      const data = await res.json();

      if (res.ok) {
        alert(`Imported ${data.created} bills. ${data.skipped} skipped, ${data.errors} errors.`);
        onOpenChange(false);
        onImportComplete?.();
      } else {
        alert(data.error || "Failed to import bills");
      }
    } catch {
      alert("Failed to import bills");
    } finally {
      setImporting(false);
    }
  };

  const importableCount = [...bills, ...attentionBills].filter(b => b.matched_property_id).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={config.iconColor}>{config.icon}</span>
            {config.name} Bills
            {source === "stored" && (
              <Badge variant="secondary" className="ml-2 text-xs">
                From Database
              </Badge>
            )}
            {source === "parsed" && (
              <Badge variant="outline" className="ml-2 text-xs text-green-600 border-green-600">
                Freshly Parsed
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Fetch and import {config.type} bills from {config.name} utility portal.
            Parsed bills are automatically saved to the database for persistence.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={loadStoredBills}
              disabled={loading}
              variant="secondary"
              size="sm"
            >
              {loading && source === "stored" ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Clock className="mr-2 h-4 w-4" />
              )}
              Load Stored
            </Button>
            <Button
              onClick={() => handleFetch("parse")}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              {loading && mode === "parse" ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Parse Local PDFs
            </Button>
            <Button
              onClick={() => handleFetch("fetch")}
              disabled={loading}
              size="sm"
            >
              {loading && mode === "fetch" ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download from Portal
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Load Stored:</strong> View previously parsed bills from database.{" "}
            <strong>Parse Local PDFs:</strong> Re-parse PDFs in download directory.{" "}
            <strong>Download from Portal:</strong> Fetch latest bills from {config.name} website (requires credentials).
          </p>

          {error && (
            <div className={`p-3 rounded-md text-sm ${
              error.includes("No PDF") || error.includes("No bills")
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                : "bg-destructive/10 text-destructive"
            }`}>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {(bills.length > 0 || attentionBills.length > 0) && (
            <div className="space-y-2">
              <h4 className="font-semibold">
                {config.name} Accounts ({bills.length + attentionBills.length})
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account #</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Bill Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Billing Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attentionBills.map((bill, idx) => (
                    <TableRow key={`att-${idx}`} className="bg-destructive/5">
                      <TableCell className="font-mono text-sm">{bill.account_number}</TableCell>
                      <TableCell className="font-medium">{getServiceLocation(bill)}</TableCell>
                      <TableCell className="text-sm">
                        {bill.bill_date ? new Date(bill.bill_date).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {bill.due_date ? new Date(bill.due_date).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {bill.billing_period_start && bill.billing_period_end
                          ? `${new Date(bill.billing_period_start).toLocaleDateString()} - ${new Date(bill.billing_period_end).toLocaleDateString()}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-bold text-destructive">
                        ${bill.amount_due.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="whitespace-nowrap">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {bill.disconnect_date
                            ? `Disconnect ${new Date(bill.disconnect_date).toLocaleDateString()}`
                            : "Attention"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {bills.map((bill, idx) => (
                    <TableRow key={`bill-${idx}`} className={bill.imported ? "opacity-60" : ""}>
                      <TableCell className="font-mono text-sm">{bill.account_number}</TableCell>
                      <TableCell className="font-medium">{getServiceLocation(bill)}</TableCell>
                      <TableCell className="text-sm">
                        {bill.bill_date ? new Date(bill.bill_date).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {bill.due_date ? new Date(bill.due_date).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {bill.billing_period_start && bill.billing_period_end
                          ? `${new Date(bill.billing_period_start).toLocaleDateString()} - ${new Date(bill.billing_period_end).toLocaleDateString()}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${bill.amount_due.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {bill.imported ? (
                          <Badge variant="secondary" className="whitespace-nowrap">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Imported
                          </Badge>
                        ) : bill.matched_property_id ? (
                          <Badge variant="outline" className="text-green-600 border-green-600 whitespace-nowrap">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Ready
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-600 whitespace-nowrap">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            No Match
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {bills.length === 0 && attentionBills.length === 0 && !loading && !error && (
            <div className="text-center py-8 text-muted-foreground">
              <span className={config.iconColor}>{config.icon}</span>
              <p className="font-medium mt-2">No {config.name} bills found</p>
              <p className="text-sm mt-1">
                <strong>Load Stored</strong> to view previously saved bills,<br />
                <strong>Parse Local PDFs</strong> if you have bill PDFs,<br />
                or <strong>Download from Portal</strong> to fetch fresh bills.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {importableCount > 0 && (
            <Button onClick={handleImport} disabled={importing}>
              {importing ? "Importing..." : `Import ${importableCount} Bills`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Pre-configured providers
export const DURHAM_WATER_CONFIG: UtilityProviderConfig = {
  name: "Durham Water",
  type: "water",
  apiEndpoint: "/api/utilities/durham-water",
  icon: <Droplets className="h-5 w-5" />,
  iconColor: "text-blue-500",
  credentialsEnvPrefix: "DURHAM_WATER",
};

export const DUKE_ENERGY_CONFIG: UtilityProviderConfig = {
  name: "Duke Energy",
  type: "electric",
  apiEndpoint: "/api/utilities/duke-energy",
  icon: <Zap className="h-5 w-5" />,
  iconColor: "text-yellow-500",
  credentialsEnvPrefix: "DUKE_ELECTRIC",
};

export const ENBRIDGE_GAS_CONFIG: UtilityProviderConfig = {
  name: "Enbridge Gas",
  type: "gas",
  apiEndpoint: "/api/utilities/enbridge-gas",
  icon: <Flame className="h-5 w-5" />,
  iconColor: "text-orange-500",
  credentialsEnvPrefix: "DOMINION_GAS",
};

export const WAKE_ELECTRIC_CONFIG: UtilityProviderConfig = {
  name: "Wake Electric",
  type: "electric",
  apiEndpoint: "/api/utilities/wake-electric",
  icon: <Zap className="h-5 w-5" />,
  iconColor: "text-green-500",
  credentialsEnvPrefix: "WAKE_ELECTRIC",
};

export const GRAHAM_UTILITIES_CONFIG: UtilityProviderConfig = {
  name: "Graham Utilities",
  type: "water",
  apiEndpoint: "/api/utilities/graham-utilities",
  icon: <Droplets className="h-5 w-5" />,
  iconColor: "text-cyan-500",
  credentialsEnvPrefix: "GRAHAM_UTILITIES",
};

export const SMUD_CONFIG: UtilityProviderConfig = {
  name: "SMUD",
  type: "electric",
  apiEndpoint: "/api/utilities/smud",
  icon: <Zap className="h-5 w-5" />,
  iconColor: "text-purple-500",
  credentialsEnvPrefix: "SMUD",
};

export const SPECTRUM_CONFIG: UtilityProviderConfig = {
  name: "Spectrum",
  type: "internet",
  apiEndpoint: "/api/utilities/spectrum",
  icon: <Wifi className="h-5 w-5" />,
  iconColor: "text-blue-600",
  credentialsEnvPrefix: "SPECTRUM",
};

export const XFINITY_CONFIG: UtilityProviderConfig = {
  name: "Xfinity",
  type: "internet",
  apiEndpoint: "/api/utilities/xfinity",
  icon: <Wifi className="h-5 w-5" />,
  iconColor: "text-purple-600",
  credentialsEnvPrefix: "XFINITY_INTERENT",
};
