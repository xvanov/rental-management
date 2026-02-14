import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";
import { getAuthContext } from "@/lib/auth-context";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const token = searchParams.get("token");

    // Fetch single application by token (public access for form - no auth required)
    if (token) {
      const application = await prisma.application.findUnique({
        where: { token },
      });

      if (!application) {
        return NextResponse.json(
          { error: "Application not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(application);
    }

    // Authenticated: fetch all applications (dashboard use)
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const where: Record<string, unknown> = {
      tenant: { unit: { property: { organizationId: ctx.organizationId } } },
    };
    if (status) where.status = status;

    const applications = await prisma.application.findMany({
      where,
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(applications);
  } catch (error) {
    console.error("Failed to fetch applications:", error);
    return NextResponse.json(
      { error: "Failed to fetch applications" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { tenantId, propertyId } = body;

    // Create a new application with a unique token
    const application = await prisma.application.create({
      data: {
        tenantId: tenantId || null,
      },
    });

    // Log event
    await createEvent({
      type: "APPLICATION",
      payload: {
        applicationId: application.id,
        action: "SUBMITTED",
      },
      tenantId: tenantId || undefined,
      propertyId: propertyId || undefined,
    });

    return NextResponse.json(application, { status: 201 });
  } catch (error) {
    console.error("Failed to create application:", error);
    return NextResponse.json(
      { error: "Failed to create application" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, token, status, reviewNotes, ...formData } = body;

    // Find application by id or token
    const findWhere = id ? { id } : token ? { token } : null;
    if (!findWhere) {
      return NextResponse.json(
        { error: "id or token is required" },
        { status: 400 }
      );
    }

    // Token-based updates are public (form submission); id-based updates require auth
    if (id && !token) {
      const ctx = await getAuthContext();
      if (ctx instanceof NextResponse) return ctx;

      // Verify application belongs to org
      const orgApp = await prisma.application.findFirst({
        where: { id, tenant: { unit: { property: { organizationId: ctx.organizationId } } } },
      });
      if (!orgApp) {
        return NextResponse.json(
          { error: "Application not found" },
          { status: 404 }
        );
      }
    }

    const existing = await prisma.application.findUnique({
      where: findWhere,
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    // Form submission data
    if (formData.firstName !== undefined) updateData.firstName = formData.firstName;
    if (formData.lastName !== undefined) updateData.lastName = formData.lastName;
    if (formData.email !== undefined) updateData.email = formData.email;
    if (formData.phone !== undefined) updateData.phone = formData.phone;
    if (formData.currentAddress !== undefined) updateData.currentAddress = formData.currentAddress;
    if (formData.employer !== undefined) updateData.employer = formData.employer;
    if (formData.income !== undefined) updateData.income = formData.income ? parseFloat(formData.income) : null;
    if (formData.rentalHistory !== undefined) updateData.rentalHistory = formData.rentalHistory;
    if (formData.evictionHistory !== undefined) updateData.evictionHistory = formData.evictionHistory;
    if (formData.documents !== undefined) updateData.documents = formData.documents;

    // Status changes (review actions)
    if (status) {
      const validStatuses = ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: "Invalid status" },
          { status: 400 }
        );
      }
      updateData.status = status;

      if (status === "APPROVED" || status === "REJECTED") {
        updateData.reviewedAt = new Date();
      }
    }

    if (reviewNotes !== undefined) updateData.reviewNotes = reviewNotes;

    // Mark submitted when form data is provided and status is PENDING
    if (formData.firstName && existing.status === "PENDING" && !status) {
      updateData.submittedAt = new Date();
      updateData.status = "UNDER_REVIEW";
    }

    const application = await prisma.application.update({
      where: findWhere,
      data: updateData,
    });

    // Log event for status changes
    if (status || updateData.status) {
      const action = (status || updateData.status) as string;
      const eventAction = action === "UNDER_REVIEW" ? "SUBMITTED" : action as "SUBMITTED" | "REVIEWED" | "APPROVED" | "REJECTED";

      await createEvent({
        type: "APPLICATION",
        payload: {
          applicationId: application.id,
          action: eventAction,
          reviewNotes: reviewNotes || undefined,
        },
        tenantId: application.tenantId || undefined,
      });
    }

    return NextResponse.json(application);
  } catch (error) {
    console.error("Failed to update application:", error);
    return NextResponse.json(
      { error: "Failed to update application" },
      { status: 500 }
    );
  }
}
