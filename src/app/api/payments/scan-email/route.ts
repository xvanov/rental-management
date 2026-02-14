import { NextRequest, NextResponse } from "next/server";
import { scanAndCreatePayments } from "@/lib/payment-import/scan-service";

export async function POST(req: NextRequest) {
  try {
    // Validate CRON_SECRET in production
    if (process.env.NODE_ENV === "production") {
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.replace("Bearer ", "");
      if (!token || token !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await scanAndCreatePayments();

    return NextResponse.json({
      message: `Scanned ${result.emailsScanned} emails, parsed ${result.paymentsParsed} payments`,
      count: result.created,
      duplicates: result.duplicates,
      unmatched: result.unmatched,
    });
  } catch (error) {
    console.error("Failed to scan payment emails:", error);
    return NextResponse.json(
      { error: "Failed to scan payment emails" },
      { status: 500 }
    );
  }
}
