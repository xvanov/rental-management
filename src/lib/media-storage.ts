import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const MEDIA_DIR = "data/message-media";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/3gpp",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/3gpp": "3gp",
};

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function saveMediaFromUrl(
  url: string,
  messageId: string,
  options?: { authHeader?: string; mimeType?: string }
): Promise<{ filePath: string; fileName: string; mimeType: string; sizeBytes: number }> {
  const headers: Record<string, string> = {};
  if (options?.authHeader) {
    headers["Authorization"] = options.authHeader;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }

  const contentType = options?.mimeType || response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
  const ext = MIME_TO_EXT[contentType] || "bin";
  const fileName = `${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${buffer.length} bytes (max ${MAX_FILE_SIZE})`);
  }

  const dir = path.join(process.cwd(), MEDIA_DIR, messageId);
  ensureDir(dir);

  const filePath = path.join(MEDIA_DIR, messageId, fileName);
  fs.writeFileSync(path.join(process.cwd(), filePath), buffer);

  return { filePath, fileName, mimeType: contentType, sizeBytes: buffer.length };
}

export async function saveMediaFromBuffer(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<{ filePath: string; fileName: string; sizeBytes: number }> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${buffer.length} bytes (max ${MAX_FILE_SIZE})`);
  }

  const ext = MIME_TO_EXT[mimeType] || path.extname(originalName).slice(1) || "bin";
  const fileName = `${randomUUID()}.${ext}`;

  // Store uploads in a temp directory until linked to a message
  const dir = path.join(process.cwd(), MEDIA_DIR, "uploads");
  ensureDir(dir);

  const filePath = path.join(MEDIA_DIR, "uploads", fileName);
  fs.writeFileSync(path.join(process.cwd(), filePath), buffer);

  return { filePath, fileName, sizeBytes: buffer.length };
}

export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE };
