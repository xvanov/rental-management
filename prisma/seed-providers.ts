import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const utilityProviders = [
    {
      name: "Durham Water",
      type: "water",
      description: "Water & sewer services",
      website: "https://billpay.onlinebiller.com/ebpp/durhamub/Login/Index",
      phone: "(919) 560-4381",
    },
    {
      name: "Duke Energy",
      type: "electric",
      description: "Electric service",
      website: "https://www.duke-energy.com/sign-in",
      phone: "(800) 452-2777",
    },
    {
      name: "Enbridge Gas",
      type: "gas",
      description: "Natural gas service",
      website: "https://account.dominionenergync.com",
      phone: "(800) 752-7504",
    },
    {
      name: "Wake Electric",
      type: "electric",
      description: "Electric cooperative",
      website: "https://wemc.smarthub.coop/Login.html",
      phone: "(919) 863-6300",
    },
    {
      name: "Graham Utilities",
      type: "water",
      description: "Water, sewer & refuse (City of Graham)",
      website: "https://wipp.edmundsassoc.com/Wipp/?wippid=GRAM",
      phone: "(336) 570-6700",
    },
    {
      name: "SMUD",
      type: "electric",
      description: "Sacramento Municipal Utility District",
      website: "https://myaccount.smud.org",
      phone: "(888) 742-7683",
    },
  ];

  console.log("Seeding utility providers...");

  for (const provider of utilityProviders) {
    const result = await prisma.utilityProvider.upsert({
      where: { name: provider.name },
      update: {
        type: provider.type,
        description: provider.description,
        website: provider.website,
        phone: provider.phone,
      },
      create: provider,
    });
    console.log(`  - ${result.name} (${result.type}) - ${result.phone}`);
  }

  console.log(`\nSeeded ${utilityProviders.length} utility providers successfully.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
