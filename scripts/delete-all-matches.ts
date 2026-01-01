import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("⚠️  WARNING: This script will DELETE ALL UserJobMatch records from the database.");
  console.log("This action cannot be undone.\n");

  try {
    const count = await prisma.userJobMatch.count();
    console.log(`Found ${count} UserJobMatch records to delete.`);

    if (count === 0) {
      console.log("No records to delete. Exiting.");
      return;
    }

    console.log("\nDeleting all UserJobMatch records...");
    const result = await prisma.userJobMatch.deleteMany({});
    
    console.log(`✅ Successfully deleted ${result.count} UserJobMatch records.`);
  } catch (error) {
    console.error("❌ Error deleting UserJobMatch records:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

