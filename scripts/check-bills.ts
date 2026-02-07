import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

async function main() {
  // Find King Arthur property
  const kingArthur = await prisma.property.findFirst({
    where: { address: { contains: "King Arthur" } },
    include: { utilityBills: { orderBy: { period: "desc" } } },
  });

  console.log("Property:", kingArthur?.address);
  console.log("\nAll utility bills:");

  for (const bill of kingArthur?.utilityBills || []) {
    console.log(
      "  " +
        bill.period +
        " | " +
        bill.type.padEnd(10) +
        " | " +
        bill.provider.padEnd(20) +
        " | $" +
        bill.amount.toFixed(2)
    );
  }

  // Check for internet bills specifically
  const internetBills =
    kingArthur?.utilityBills.filter((b) => b.type === "internet") || [];
  console.log("\nInternet bills count:", internetBills.length);

  // Check all utility types present
  const types = [
    ...new Set(kingArthur?.utilityBills.map((b) => b.type) || []),
  ];
  console.log("Utility types present:", types.join(", "));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
