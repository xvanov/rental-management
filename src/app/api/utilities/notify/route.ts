import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  sendPropertyUtilityNotifications,
  sendAllUtilityNotifications,
  sendTestUtilityNotification,
} from "@/lib/utilities/tenant-notification";

// Simple in-memory rate limiting (F2)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 10; // Max requests per window
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * POST /api/utilities/notify
 *
 * Send utility bill notifications to tenants.
 *
 * Body options:
 * - { test: true, phone: "+1234567890" } - Send a test message to a specific phone
 * - { propertyId: "xxx", period: "2024-01" } - Send to all tenants at a property
 * - { period: "2024-01" } - Send to all tenants across all properties
 * - { dryRun: true } - Preview what would be sent without actually sending
 */
export async function POST(request: NextRequest) {
  try {
    // F1: Authentication check
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // F2: Rate limiting
    const rateLimitKey = session.user.id || session.user.email || "anonymous";
    if (!checkRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { test, phone, propertyId, period, dryRun } = body;

    // Test mode - send to a specific phone number
    if (test && phone) {
      const result = await sendTestUtilityNotification(phone, propertyId, period);

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: "Test notification sent",
          twilioSid: result.twilioSid,
          sentMessage: result.message,
        });
      } else {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 500 }
        );
      }
    }

    // Validate period is provided for non-test requests
    if (!period) {
      return NextResponse.json(
        { error: "Period is required (format: YYYY-MM)" },
        { status: 400 }
      );
    }

    // Validate period format
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json(
        { error: "Invalid period format. Use YYYY-MM" },
        { status: 400 }
      );
    }

    const options = { dryRun: !!dryRun };

    // Send to specific property or all properties
    if (propertyId) {
      const result = await sendPropertyUtilityNotifications(propertyId, period, options);

      if (!result) {
        return NextResponse.json(
          { error: "No utility bills or tenants found for this property/period" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        dryRun: !!dryRun,
        property: result.propertyAddress,
        period: result.period,
        totalAmount: result.totalAmount,
        sent: result.sent,
        failed: result.failed,
        notifications: result.notifications,
      });
    } else {
      // Send to all properties
      const results = await sendAllUtilityNotifications(period, options);

      const totalSent = results.reduce((sum, r) => sum + r.sent, 0);
      const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

      return NextResponse.json({
        success: true,
        dryRun: !!dryRun,
        period,
        propertiesProcessed: results.length,
        totalSent,
        totalFailed,
        results,
      });
    }
  } catch (error) {
    console.error("Failed to send utility notifications:", error);
    return NextResponse.json(
      { error: "Failed to send notifications" },
      { status: 500 }
    );
  }
}
