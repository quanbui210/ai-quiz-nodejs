import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("Updating CreditPack Stripe Price IDs...\n");

  const packs = [
    {
      credits: 20,
      stripePriceId: process.env.STRIPE_PRICE_ID_20 || "", // Replace with your actual Price ID
    },
    {
      credits: 30,
      stripePriceId: process.env.STRIPE_PRICE_ID_30 || "", // Replace with your actual Price ID
    },
    {
      credits: 50,
      stripePriceId: process.env.STRIPE_PRICE_ID_50 || "", // Replace with your actual Price ID
    },
    {
      credits: 100,
      stripePriceId: process.env.STRIPE_PRICE_ID_100 || "", // Replace with your actual Price ID
    },
  ];

  for (const pack of packs) {
    if (!pack.stripePriceId) {
      console.log(`⚠️  Skipping ${pack.credits} credits pack - no Stripe Price ID provided`);
      continue;
    }

    try {
      const updated = await (prisma as any).creditPack.update({
        where: { credits: pack.credits },
        data: { stripePriceId: pack.stripePriceId },
      });

      console.log(`✅ Updated ${pack.credits} credits pack with Price ID: ${pack.stripePriceId}`);
    } catch (error: any) {
      if (error.code === "P2025") {
        console.error(`❌ Credit pack with ${pack.credits} credits not found. Run seed script first.`);
      } else {
        console.error(`❌ Error updating ${pack.credits} credits pack:`, error.message);
      }
    }
  }

  console.log("\n✨ Done! All Price IDs updated.");
  console.log("\n💡 Tip: You can also update directly in Supabase/Prisma Studio:");
  console.log("   npx prisma studio");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

