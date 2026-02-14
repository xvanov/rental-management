export interface ParsedPayment {
  senderName: string;
  amount: number;
  date: Date;
  note: string | null;
  externalId: string;
  method: "ZELLE" | "VENMO" | "CASHAPP" | "PAYPAL";
}

export interface MatchedPayment extends ParsedPayment {
  tenantId: string | null;
  tenantName: string | null;
  matchConfidence: "exact" | "fuzzy" | "manual" | "unmatched";
}

export interface ImportResult {
  total: number;
  matched: number;
  unmatched: number;
  duplicates: number;
  created: number;
  payments: MatchedPayment[];
}

export interface EmailParseResult {
  senderName: string;
  amount: number;
  date: Date;
  note: string | null;
  externalId: string;
  method: "ZELLE" | "VENMO" | "CASHAPP" | "PAYPAL";
}
