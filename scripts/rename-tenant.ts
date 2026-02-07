import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

async function main() {
  // Update Horley to Horlry
  const result = await prisma.tenant.updateMany({
    where: { firstName: "Horley" },
    data: { firstName: "Horlry" },
  });
  console.log("Updated", result.count, "tenant(s)");

  // Show Underbrush tenants
  const underbrush = await prisma.property.findFirst({
    where: { address: { contains: "Underbrush" } },
    include: {
      units: {
        include: { tenants: { where: { active: true } } },
        orderBy: { name: "asc" },
      },
    },
  });

  console.log("\nUnderbrush tenants:");
  for (const u of underbrush!.units) {
    for (const t of u.tenants) {
      console.log("  " + u.name + ": " + t.firstName);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
