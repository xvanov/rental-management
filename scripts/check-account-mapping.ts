import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

async function main() {
  // Get all parsed bills to build account -> address mapping
  console.log("=== Account to Address Mapping ===\n");

  // Duke Energy
  const dukeBills = await prisma.dukeEnergyParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceAddress: true },
  });
  console.log("Duke Energy:");
  for (const b of dukeBills) {
    console.log(`  ${b.accountNumber} -> ${b.serviceAddress}`);
  }

  // Enbridge Gas
  const enbridgeBills = await prisma.enbridgeGasParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceAddress: true },
  });
  console.log("\nEnbridge Gas:");
  for (const b of enbridgeBills) {
    console.log(`  ${b.accountNumber} -> ${b.serviceAddress}`);
  }

  // SMUD
  const smudBills = await prisma.smudParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceAddress: true },
  });
  console.log("\nSMUD:");
  for (const b of smudBills) {
    console.log(`  ${b.accountNumber} -> ${b.serviceAddress}`);
  }

  // Durham Water
  const durhamBills = await prisma.durhamWaterParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceLocation: true },
  });
  console.log("\nDurham Water:");
  for (const b of durhamBills) {
    console.log(`  ${b.accountNumber} -> ${b.serviceLocation}`);
  }

  // Graham Utilities
  const grahamBills = await prisma.grahamUtilitiesParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceLocation: true },
  });
  console.log("\nGraham Utilities:");
  for (const b of grahamBills) {
    console.log(`  ${b.accountNumber} -> ${b.serviceLocation}`);
  }

  // Wake Electric
  const wakeBills = await prisma.wakeElectricParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceAddress: true },
  });
  console.log("\nWake Electric:");
  for (const b of wakeBills) {
    console.log(`  ${b.accountNumber} -> ${b.serviceAddress}`);
  }

  // Spectrum
  const spectrumBills = await prisma.spectrumParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceAddress: true },
  });
  console.log("\nSpectrum:");
  for (const b of spectrumBills) {
    console.log(`  ${b.accountNumber} -> ${b.serviceAddress}`);
  }

  // Xfinity
  const xfinityBills = await prisma.xfinityParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceAddress: true },
  });
  console.log("\nXfinity:");
  for (const b of xfinityBills) {
    console.log(`  ${b.accountNumber} -> ${b.serviceAddress}`);
  }

  // Get all properties
  console.log("\n=== Properties ===\n");
  const properties = await prisma.property.findMany({
    select: { id: true, address: true },
  });
  for (const p of properties) {
    console.log(`  ${p.address}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
