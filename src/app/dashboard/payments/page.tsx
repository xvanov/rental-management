import { CreditCard } from "lucide-react";

export default function PaymentsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
      <p className="text-muted-foreground mt-1">
        Track rent, deposits, and fees.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
        <CreditCard className="size-12 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">No payments recorded</p>
        <p className="text-sm text-muted-foreground">
          Payment ledger entries will appear here.
        </p>
      </div>
    </div>
  );
}
