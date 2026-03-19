import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext, orgScope } from "@/lib/auth-context";
import fs from "fs";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params;

    const media = await prisma.messageMedia.findUnique({
      where: { id: mediaId },
      include: {
        message: {
          select: { tenantId: true, tenant: { select: { unit: { select: { property: { select: { organizationId: true } } } } } } },
        },
      },
    });

    if (!media) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    // Allow public access with MEDIA_SERVE_SECRET (for Twilio outbound MMS)
    const token = new URL(request.url).searchParams.get("token");
    const serveSecret = process.env.MEDIA_SERVE_SECRET;

    if (token && serveSecret && token === serveSecret) {
      // Valid token — serve without auth
    } else {
      // Require auth and verify org ownership
      const ctx = await getAuthContext();
      if (ctx instanceof NextResponse) return ctx;

      const orgId = media.message?.tenant?.unit?.property?.organizationId;
      if (orgId && orgId !== ctx.organizationId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    const filePath = path.join(process.cwd(), media.filePath);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": media.mimeType,
        "Content-Disposition": `inline; filename="${media.fileName}"`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Failed to serve media:", error);
    return NextResponse.json({ error: "Failed to serve media" }, { status: 500 });
  }
}
