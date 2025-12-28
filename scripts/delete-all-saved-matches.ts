import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("=".repeat(60));
  console.log("DELETE ALL SAVED JOB MATCHES");
  console.log("=".repeat(60));
  console.log();
  console.log("⚠️  WARNING: This will permanently delete ALL saved job matches");
  console.log("   from the database. This action cannot be undone.");
  console.log();

  // Count existing matches
  const matchCount = await (prisma as any).userJobMatch.count();
  console.log(`📊 Current saved matches in database: ${matchCount}`);
  console.log();

  if (matchCount === 0) {
    console.log("✅ No matches to delete. Database is already clean.");
    await prisma.$disconnect();
    return;
  }

  // Get confirmation from command line argument
  const args = process.argv.slice(2);
  const confirmed = args.includes("--confirm") || args.includes("-y");

  if (!confirmed) {
    console.log("❌ This script requires confirmation to run.");
    console.log();
    console.log("To delete all matches, run:");
    console.log("  npx tsx scripts/delete-all-saved-matches.ts --confirm");
    console.log();
    console.log("Or use the short form:");
    console.log("  npx tsx scripts/delete-all-saved-matches.ts -y");
    console.log();
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("🗑️  Deleting all saved matches...");
  console.log();

  try {
    const result = await (prisma as any).userJobMatch.deleteMany({});

    console.log(`✅ Successfully deleted ${result.count} saved match(es)`);
    console.log();
    console.log("=".repeat(60));
    console.log("Cleanup completed!");
    console.log("=".repeat(60));
  } catch (error: any) {
    console.error("❌ Error deleting matches:", error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

