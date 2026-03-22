import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";
import { logSystemEvent } from "@/lib/events";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { id } = await params;

    const property = await prisma.property.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    const profile = await prisma.propertyProfile.findUnique({
      where: { propertyId: id },
    });

    return NextResponse.json(profile ?? {});
  } catch (error) {
    console.error("Failed to fetch property profile:", error);
    return NextResponse.json(
      { error: "Failed to fetch property profile" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { id } = await params;
    const body = await request.json();
    const {
      description, photos, amenities, petPolicy, petDeposit,
      smokingAllowed, maxOccupants, parkingSpaces, laundry,
      customRules, notes,
    } = body;

    const property = await prisma.property.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    const data = {
      description: description ?? null,
      photos: photos ?? null,
      amenities: amenities ?? null,
      petPolicy: petPolicy ?? null,
      petDeposit: petDeposit ?? null,
      smokingAllowed: smokingAllowed ?? false,
      maxOccupants: maxOccupants ?? null,
      parkingSpaces: parkingSpaces ?? null,
      laundry: laundry ?? null,
      customRules: customRules ?? null,
      notes: notes ?? null,
    };

    const profile = await prisma.propertyProfile.upsert({
      where: { propertyId: id },
      create: { propertyId: id, ...data },
      update: data,
    });

    await logSystemEvent(
      {
        action: "PROPERTY_PROFILE_UPDATED",
        description: `Updated profile for property ${property.address}`,
        metadata: { propertyId: id },
      },
      { propertyId: id }
    );

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Failed to update property profile:", error);
    return NextResponse.json(
      { error: "Failed to update property profile" },
      { status: 500 }
    );
  }
}
