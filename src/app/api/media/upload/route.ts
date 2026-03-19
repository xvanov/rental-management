import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";
import { saveMediaFromBuffer, ALLOWED_MIME_TYPES } from "@/lib/media-storage";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveMediaFromBuffer(buffer, file.name, file.type);

    const media = await prisma.messageMedia.create({
      data: {
        messageId: null,
        fileName: saved.fileName,
        filePath: saved.filePath,
        mimeType: file.type,
        sizeBytes: saved.sizeBytes,
      },
    });

    return NextResponse.json({
      mediaId: media.id,
      fileName: media.fileName,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload media:", error);
    return NextResponse.json({ error: "Failed to upload media" }, { status: 500 });
  }
}
