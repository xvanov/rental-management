import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { propertyId, title, price, bedrooms, bathrooms, unitName } = body;

    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required" },
        { status: 400 }
      );
    }

    // Load property + profile for context
    const property = await prisma.property.findFirst({
      where: { id: propertyId, organizationId: ctx.organizationId },
      include: { profile: true },
    });
    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    const { isAIConfigured } = await import("@/lib/ai");
    if (!isAIConfigured()) {
      return NextResponse.json(
        { error: "AI not configured" },
        { status: 503 }
      );
    }

    const { generateText } = await import("ai");
    const { getLanguageModel } = await import("@/lib/ai/provider");
    const model = getLanguageModel();
    if (!model) {
      return NextResponse.json(
        { error: "AI model not available" },
        { status: 503 }
      );
    }

    const profile = property.profile;
    const profileContext = profile
      ? [
          profile.amenities
            ? `Amenities: ${(profile.amenities as string[]).join(", ")}`
            : null,
          profile.petPolicy ? `Pet policy: ${profile.petPolicy}` : null,
          profile.laundry ? `Laundry: ${profile.laundry}` : null,
          profile.parkingSpaces != null
            ? `Parking: ${profile.parkingSpaces} spaces`
            : null,
          profile.description ? `Notes: ${profile.description}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    const result = await generateText({
      model,
      system: `You are a real estate copywriter creating Facebook rental listing descriptions.
Write compelling, concise descriptions (3-5 sentences). Be warm and professional.
Include key details naturally. End with a call to action to message for a showing.
Do NOT use excessive emojis. Use at most 2-3 relevant ones.
Do NOT include the price or title — those are shown separately.`,
      prompt: `Write a listing description for:
Property: ${property.address}, ${property.city}, ${property.state} ${property.zip}
${title ? `Title: ${title}` : ""}
${price ? `Price: $${price}/month` : ""}
${bedrooms ? `Bedrooms: ${bedrooms}` : ""}
${bathrooms ? `Bathrooms: ${bathrooms}` : ""}
${unitName ? `Unit: ${unitName}` : ""}
${profileContext}`,
    });

    return NextResponse.json({ description: result.text });
  } catch (error) {
    console.error("Failed to generate description:", error);
    return NextResponse.json(
      { error: "Failed to generate description" },
      { status: 500 }
    );
  }
}
