import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { prisma } from "../src/lib/db";
import { readFileSync } from "fs";
import path from "path";

async function main() {
  const templatePath = path.join(process.cwd(), "templates", "lease", "room-rental-with-guarantor.md");
  const content = readFileSync(templatePath, "utf-8");

  // Find existing template with this name
  const existing = await prisma.leaseTemplate.findFirst({
    where: { name: "Room Rental & Co-Living Agreement (with Guarantor)" },
  });

  if (existing) {
    await prisma.leaseTemplate.update({
      where: { id: existing.id },
      data: { content },
    });
    console.log(`Updated existing template: ${existing.id}`);
  } else {
    // Get the org to associate with
    const org = await prisma.organization.findFirst();
    const template = await prisma.leaseTemplate.create({
      data: {
        name: "Room Rental & Co-Living Agreement (with Guarantor)",
        description: "Standard room rental agreement with guarantor addendum. Requires tenant and guarantor(s) to sign.",
        jurisdiction: "Durham County, NC",
        content,
        organizationId: org?.id || null,
      },
    });
    console.log(`Created template: ${template.id}`);
  }

  console.log("Done!");
  await prisma.$disconnect();
}

main().catch(console.error);
