import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("Updating job matching credit cost to 5...");

  try {
    const pricing = await prisma.creditPricing.upsert({
      where: {
        feature: "job_matching",
      },
      update: {
        creditCost: 5,
        description: "Match a single job against user's CV (on-demand)",
        isActive: true,
      },
      create: {
        feature: "job_matching",
        creditCost: 5,
        description: "Match a single job against user's CV (on-demand)",
        isActive: true,
      },
    });

    console.log(`✓ Updated job matching credit cost to ${pricing.creditCost} credits`);
    console.log(`  Feature: ${pricing.feature}`);
    console.log(`  Description: ${pricing.description}`);
  } catch (error: any) {
    console.error("Error updating credit pricing:", error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error("Error updating job matching credits:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

