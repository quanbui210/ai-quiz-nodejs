import dotenv from "dotenv";
import prisma from "../src/utils/prisma";
import { storeMarketTrends } from "../src/modules/jobs/job-trends.service";

dotenv.config();

async function main() {
  console.log("Starting market trends regeneration...\n");

  try {
    // Step 1: Delete existing cached market trends
    console.log("Step 1: Deleting existing cached market trends...");
    
    // Delete all market trends for Finland (general analysis)
    // Using raw SQL to delete records
    const deleteResult = await prisma.$executeRaw`
      DELETE FROM "MarketTrends"
      WHERE "country" = 'fi'
        AND ("location" IS NULL OR "location" = '')
        AND ("role" IS NULL OR "role" = '')
    `;
    
    console.log(`Deleted existing cached market trends\n`);

    // Step 2: Regenerate market trends with new prompt
    console.log("Step 2: Regenerating market trends with updated AI prompt...");
    console.log("   (This will use the new prompt that includes economic context)\n");
    
    await storeMarketTrends("fi", undefined, undefined); // Generate general analysis
    
    console.log("Market trends regenerated and cached\n");

    console.log("Regeneration complete!");
    console.log(`   - Old cache deleted`);
    console.log(`   - New analysis generated with updated prompt`);
    console.log(`   - Ready for frontend to fetch!`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

