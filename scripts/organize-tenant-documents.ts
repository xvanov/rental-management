import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { prisma } from "../src/lib/db";
import { logSystemEvent } from "../src/lib/events";
import * as fs from "fs";
import * as path from "path";

// ─── Name Mapping ───────────────────────────────────────────────────────────

const CSV_NAME_TO_TENANT: Record<string, string> = {
  "anayely rojas": "Anayeli",
  "ana laura soto hernández": "Ana",
  "ana laura soto hernandez": "Ana",
  "oswaldo aguila": "Oswaldo",
  "adonis gnanho": "Adonis",
  "josé enriquez": "José",
  "jose enriquez": "José",
  "james alexander carr": "James",
  "william beau brandon": "William",
  "cameron leach": "Cameron",
  "ibrahim musa yusuf": "Musa",
  "christopher thomas": "Christopher",
  "christopher gibbs": "Christopher",
  "amy rodriguez": "Amy",
  "ikea leann powell": "Ikea",
  "latasha cheatam": "Latasha",
  "tenzin palzom": "Tenzin",
  "david landry": "David Landry",
  "deja windham": "Deja",
  "jorge hernández": "Jorge",
  "jorge hernandez": "Jorge",
  "alexis mondragon gonzález": "Alex",
  "alexis mondragon gonzalez": "Alex",
  "daniel james worline": "Daniel",
  "jennifer laws": "Jennifer",
  "horlry antoine": "Horley",
};

// ─── Category Inference ─────────────────────────────────────────────────────

type DocumentCategory = "PAYSTUB" | "BANK_STATEMENT" | "ID";

function inferCategory(subdirName: string): DocumentCategory | null {
  const lower = subdirName.toLowerCase();
  if (lower.includes("income") || lower.includes("paystub")) return "PAYSTUB";
  if (lower.includes("savings") || lower.includes("bank")) return "BANK_STATEMENT";
  if (lower.includes("id") || lower.includes("identification")) return "ID";
  return null;
}

// ─── MIME Type ──────────────────────────────────────────────────────────────

function inferMimeType(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".pdf":
      return "application/pdf";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".heic":
      return "image/heic";
    default:
      return "application/octet-stream";
  }
}

// ─── Name Normalization ─────────────────────────────────────────────────────

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function extractApplicantName(filename: string): string | null {
  // Pattern: {anything} - {Applicant Name}.{ext}
  const withoutExt = filename.replace(/\.[^.]+$/, "");
  const dashIndex = withoutExt.lastIndexOf(" - ");
  if (dashIndex === -1) return null;
  return withoutExt.substring(dashIndex + 3).trim();
}

// ─── File Discovery ─────────────────────────────────────────────────────────

interface SourceFile {
  absolutePath: string;
  originalFilename: string;
  applicantName: string;
  category: DocumentCategory;
  subdirName: string;
}

function discoverFiles(sourceDir: string): SourceFile[] {
  const files: SourceFile[] = [];

  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory does not exist: ${sourceDir}`);
    process.exit(1);
  }

  const subdirs = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const subdir of subdirs) {
    if (!subdir.isDirectory()) continue;

    const category = inferCategory(subdir.name);
    if (!category) {
      console.warn(`  Skipping unrecognized subdirectory: ${subdir.name}`);
      continue;
    }

    const subdirPath = path.join(sourceDir, subdir.name);
    const entries = fs.readdirSync(subdirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const applicantName = extractApplicantName(entry.name);
      if (!applicantName) {
        console.warn(`  Skipping file (no name pattern): ${entry.name}`);
        continue;
      }

      files.push({
        absolutePath: path.join(subdirPath, entry.name),
        originalFilename: entry.name,
        applicantName,
        category,
        subdirName: subdir.name,
      });
    }
  }

  return files;
}

// ─── Tenant Matching ────────────────────────────────────────────────────────

interface MatchedFile extends SourceFile {
  tenantFirstName: string | null;
  tenantId: string | null;
  targetPath: string | null;
  mimeType: string;
}

async function matchFilesToTenants(files: SourceFile[]): Promise<MatchedFile[]> {
  // Load all tenants once
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true, firstName: true },
  });

  const tenantByFirstName = new Map<string, { id: string; firstName: string }>();
  for (const t of tenants) {
    tenantByFirstName.set(t.firstName, t);
  }

  const matched: MatchedFile[] = [];

  for (const file of files) {
    const normalized = file.applicantName.toLowerCase().trim();
    const ext = path.extname(file.originalFilename);
    const mimeType = inferMimeType(ext);

    // Try exact match in CSV_NAME_TO_TENANT
    let tenantFirstName = CSV_NAME_TO_TENANT[normalized] ?? null;

    // Try without accents
    if (!tenantFirstName) {
      const noAccent = removeAccents(normalized);
      tenantFirstName = CSV_NAME_TO_TENANT[noAccent] ?? null;
    }

    let tenantId: string | null = null;
    let targetPath: string | null = null;

    if (tenantFirstName) {
      const tenant = tenantByFirstName.get(tenantFirstName);
      if (tenant) {
        tenantId = tenant.id;
        targetPath = path.join(
          "data",
          "tenant-documents",
          tenant.id,
          file.category,
          file.originalFilename
        );
      }
    }

    matched.push({
      ...file,
      tenantFirstName,
      tenantId,
      targetPath,
      mimeType,
    });
  }

  return matched;
}

// ─── Commit ─────────────────────────────────────────────────────────────────

async function commitFiles(files: MatchedFile[]): Promise<number> {
  let created = 0;

  for (const file of files) {
    if (!file.tenantId || !file.targetPath) continue;

    try {
      // Create target directory
      const targetDir = path.dirname(file.targetPath);
      fs.mkdirSync(targetDir, { recursive: true });

      // Copy file
      fs.copyFileSync(file.absolutePath, file.targetPath);

      // Create DB record
      await prisma.tenantDocument.create({
        data: {
          tenantId: file.tenantId,
          category: file.category,
          fileName: file.originalFilename,
          filePath: file.targetPath,
          mimeType: file.mimeType,
        },
      });

      created++;
      console.log(`  Created: ${file.targetPath}`);
    } catch (error) {
      console.error(
        `  Failed: ${file.originalFilename}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return created;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const shouldCommit = args.includes("--commit");

  // Parse --source flag
  const sourceIndex = args.indexOf("--source");
  if (sourceIndex === -1 || !args[sourceIndex + 1]) {
    console.error("Usage: npx tsx scripts/organize-tenant-documents.ts --source /path/to/folder [--commit]");
    process.exit(1);
  }
  const sourceDir = path.resolve(args[sourceIndex + 1]);

  console.log("=== Organize Tenant Documents ===\n");
  console.log(`Source: ${sourceDir}`);
  console.log(`Mode:   ${shouldCommit ? "COMMIT" : "DRY RUN"}\n`);

  // Step 1: Discover files
  console.log("Scanning source directory...");
  const files = discoverFiles(sourceDir);
  console.log(`  Found ${files.length} files\n`);

  if (files.length === 0) {
    console.log("No files found. Exiting.");
    await prisma.$disconnect();
    return;
  }

  // Step 2: Match to tenants
  console.log("Matching files to tenants...");
  const matched = await matchFilesToTenants(files);

  const matchedFiles = matched.filter((f) => f.tenantId);
  const unmatchedFiles = matched.filter((f) => !f.tenantId);

  // Step 3: Print details
  if (shouldCommit) {
    console.log(`\n--- Committing ${matchedFiles.length} files ---\n`);
    const created = await commitFiles(matchedFiles);

    // Log system event
    await logSystemEvent({
      action: "DOCUMENT_IMPORT",
      description: `Imported ${created} tenant documents from Google Forms export`,
      metadata: {
        sourceDir,
        totalFiles: files.length,
        matched: matchedFiles.length,
        unmatched: unmatchedFiles.length,
      },
    });

    console.log(`\nDone! Created ${created} document records.`);
  } else {
    console.log("\n--- DRY RUN ---\n");
    console.log("Would process the following files:\n");

    for (const file of matchedFiles) {
      console.log(`  ${file.originalFilename}`);
      console.log(`    Category: ${file.category}`);
      console.log(`    Tenant:   ${file.tenantFirstName} (${file.tenantId})`);
      console.log(`    Source:   ${file.absolutePath}`);
      console.log(`    Target:   ${file.targetPath}`);
      console.log();
    }

    console.log("No changes were made. Use --commit to copy files and create DB records.");
  }

  // Step 4: Summary
  console.log("\n--- Summary ---");
  console.log(`  Total files found:    ${files.length}`);
  console.log(`  Matched to tenants:   ${matchedFiles.length}`);
  console.log(`  Unmatched:            ${unmatchedFiles.length}`);

  if (unmatchedFiles.length > 0) {
    console.log("\n  Unmatched files:");
    for (const file of unmatchedFiles) {
      const reason = file.tenantFirstName
        ? `mapped to "${file.tenantFirstName}" but tenant not found in DB`
        : `"${file.applicantName}" not in name map`;
      console.log(`    ${file.originalFilename} — ${reason}`);
    }
  }

  // By category
  const byCat: Record<string, number> = {};
  for (const file of matchedFiles) {
    byCat[file.category] = (byCat[file.category] || 0) + 1;
  }
  console.log("\n  By category:");
  for (const [cat, count] of Object.entries(byCat).sort()) {
    console.log(`    ${cat}: ${count}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Organize failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
