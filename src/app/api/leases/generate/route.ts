import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";
import { parseLeaseClausesFromContent } from "@/lib/lease-parser";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { templateId, tenantId, unitId, startDate, endDate, rentAmount, securityDeposit, lessorName, customFields } = body;

    if (!templateId || !tenantId || !unitId || !startDate) {
      return NextResponse.json(
        { error: "templateId, tenantId, unitId, and startDate are required" },
        { status: 400 }
      );
    }

    if (!rentAmount) {
      return NextResponse.json(
        { error: "Rent amount is required" },
        { status: 400 }
      );
    }

    if (!securityDeposit) {
      return NextResponse.json(
        { error: "Security deposit is required" },
        { status: 400 }
      );
    }

    if (!lessorName) {
      return NextResponse.json(
        { error: "Lessor name is required" },
        { status: 400 }
      );
    }

    // Fetch template
    const template = await prisma.leaseTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Fetch tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    // Fetch unit with property
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      include: { property: true },
    });

    if (!unit) {
      return NextResponse.json(
        { error: "Unit not found" },
        { status: 404 }
      );
    }

    // Build replacement map - only the essential variables that change per lease
    const parsedRentAmount = parseFloat(rentAmount);
    const parsedSecurityDeposit = parseFloat(securityDeposit);
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    const fullAddress = `${unit.property.address}, ${unit.property.city}, ${unit.property.state} ${unit.property.zip}`;

    // Map state abbreviations to full names
    const stateNames: Record<string, string> = {
      NC: "North Carolina",
      CA: "California",
      TX: "Texas",
      FL: "Florida",
      NY: "New York",
      // Add more as needed
    };

    const replacements: Record<string, string> = {
      // Lessor name
      LESSOR_NAME: lessorName,

      // Property/Unit
      PROPERTY_ADDRESS: fullAddress,
      ROOM_NUMBER: unit.name,

      // Lease dates
      LEASE_START_DATE: formatDate(start),
      LEASE_END_DATE: end ? formatDate(end) : "Month-to-month",

      // Payment terms
      MONTHLY_RENT: `$${parsedRentAmount.toFixed(2)} (${numberToWords(parsedRentAmount)})`,
      SECURITY_DEPOSIT: `$${parsedSecurityDeposit.toFixed(2)} (${numberToWords(parsedSecurityDeposit)})`,

      // Governing law (varies by property location)
      STATE_NAME: stateNames[unit.property.state] || unit.property.state,
      COUNTY_NAME: unit.property.jurisdiction?.replace(" County", "") || "Durham",

      // Custom fields can override any of the above
      ...(customFields || {}),
    };

    // Apply replacements to template content
    let content = template.content;

    // Apply variable replacements
    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi");
      content = content.replace(regex, value);
    }

    // Check for any remaining unreplaced variables
    const remainingVariables = content.match(/\{\{[^}]+\}\}/g);
    if (remainingVariables && remainingVariables.length > 0) {
      // Filter out any that might be intentional (like conditionals already processed)
      const uniqueVars = [...new Set(remainingVariables)];
      return NextResponse.json(
        {
          error: `Template has unset variables: ${uniqueVars.slice(0, 5).join(", ")}${uniqueVars.length > 5 ? "..." : ""}`,
          missingVariables: uniqueVars
        },
        { status: 400 }
      );
    }

    // Determine version
    const previousLeases = await prisma.lease.count({
      where: { tenantId, unitId },
    });

    // Create the lease
    const lease = await prisma.lease.create({
      data: {
        tenantId,
        unitId,
        templateId,
        content,
        rentAmount: parsedRentAmount,
        startDate: start,
        endDate: end,
        version: previousLeases + 1,
        status: "DRAFT",
      },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true } },
        unit: { include: { property: true } },
      },
    });

    // Parse and store lease clauses
    const parsedClauses = parseLeaseClausesFromContent(content, parsedRentAmount);
    if (parsedClauses.length > 0) {
      await prisma.leaseClause.createMany({
        data: parsedClauses.map((clause) => ({
          leaseId: lease.id,
          type: clause.type,
          content: clause.content,
          metadata: clause.metadata as Prisma.InputJsonValue,
        })),
      });
    }

    // Log event
    await createEvent({
      type: "LEASE",
      payload: {
        leaseId: lease.id,
        action: "CREATED",
        version: lease.version,
      },
      tenantId: lease.tenantId,
      propertyId: lease.unit.propertyId,
    });

    // Return lease with clauses
    const leaseWithClauses = await prisma.lease.findUnique({
      where: { id: lease.id },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true } },
        unit: { include: { property: true } },
        clauses: true,
      },
    });

    return NextResponse.json(leaseWithClauses, { status: 201 });
  } catch (error) {
    console.error("Failed to generate lease:", error);
    return NextResponse.json(
      { error: "Failed to generate lease" },
      { status: 500 }
    );
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function calculateTerm(start: Date, end: Date): string {
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (months === 12) return "1 year";
  if (months > 12) return `${Math.floor(months / 12)} year(s), ${months % 12} month(s)`;
  return `${months} month(s)`;
}

function numberToWords(num: number): string {
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  const dollars = Math.floor(num);
  const cents = Math.round((num - dollars) * 100);

  if (dollars === 0) return "zero dollars";

  let words = "";
  if (dollars >= 1000) {
    words += ones[Math.floor(dollars / 1000)] + " thousand ";
    const remainder = dollars % 1000;
    if (remainder >= 100) {
      words += ones[Math.floor(remainder / 100)] + " hundred ";
      const rem2 = remainder % 100;
      if (rem2 >= 20) {
        words += tens[Math.floor(rem2 / 10)] + " " + ones[rem2 % 10];
      } else if (rem2 > 0) {
        words += ones[rem2];
      }
    } else if (remainder >= 20) {
      words += tens[Math.floor(remainder / 10)] + " " + ones[remainder % 10];
    } else if (remainder > 0) {
      words += ones[remainder];
    }
  } else if (dollars >= 100) {
    words += ones[Math.floor(dollars / 100)] + " hundred ";
    const rem = dollars % 100;
    if (rem >= 20) {
      words += tens[Math.floor(rem / 10)] + " " + ones[rem % 10];
    } else if (rem > 0) {
      words += ones[rem];
    }
  } else if (dollars >= 20) {
    words += tens[Math.floor(dollars / 10)] + " " + ones[dollars % 10];
  } else {
    words += ones[dollars];
  }

  words = words.trim() + " dollars";
  if (cents > 0) {
    words += ` and ${cents}/100`;
  }

  return words;
}
