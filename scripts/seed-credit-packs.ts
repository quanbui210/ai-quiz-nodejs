import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding credit packs...");

  const creditPacks = [
    {
      credits: 20,
      price: 299, // €2.99
      bonusCredits: 0,
      displayOrder: 1,
      description: "Perfect for testing our features - 4 job matches or 10 quizzes",
      isActive: true,
      stripePriceId: process.env.STRIPE_PRICE_ID_20 || null,
    },
    {
      credits: 30,
      price: 399, // €3.99
      bonusCredits: 0,
      displayOrder: 2,
      description: "Great for small projects - 6 job matches or 15 quizzes",
      isActive: true,
      stripePriceId: process.env.STRIPE_PRICE_ID_30 || null,
    },
    {
      credits: 50,
      price: 599, // €5.99
      bonusCredits: 0,
      displayOrder: 3,
      description: "Most popular - Best value for occasional users",
      isActive: true,
      stripePriceId: process.env.STRIPE_PRICE_ID_50 || null,
    },
    {
      credits: 100,
      price: 999, // €9.99
      bonusCredits: 0,
      displayOrder: 4,
      description: "Best value - Save 33% vs smaller packs. 20 job matches or 50 quizzes",
      isActive: true,
      stripePriceId: process.env.STRIPE_PRICE_ID_100 || null,
    },
  ];

  for (const pack of creditPacks) {
    const existing = await (prisma as any).creditPack.findUnique({
      where: { credits: pack.credits },
    });

    const packData: any = {
      credits: pack.credits,
      price: pack.price,
      bonusCredits: pack.bonusCredits,
      displayOrder: pack.displayOrder,
      description: pack.description,
      isActive: pack.isActive,
    };

    if (pack.stripePriceId) {
      packData.stripePriceId = pack.stripePriceId;
    }

    if (existing) {
      console.log(`Updating pack: ${pack.credits} credits${pack.stripePriceId ? ` with Price ID: ${pack.stripePriceId}` : " (no Price ID)"}`);
      await (prisma as any).creditPack.update({
        where: { credits: pack.credits },
        data: packData,
      });
    } else {
      console.log(`Creating pack: ${pack.credits} credits${pack.stripePriceId ? ` with Price ID: ${pack.stripePriceId}` : " (no Price ID)"}`);
      await (prisma as any).creditPack.create({
        data: packData,
      });
    }
  }

  console.log("\n✅ Credit packs seeded successfully!");
  
  const packsWithPriceIds = creditPacks.filter(p => p.stripePriceId);
  const packsWithoutPriceIds = creditPacks.filter(p => !p.stripePriceId);
  
  if (packsWithPriceIds.length > 0) {
    console.log(`\n✅ ${packsWithPriceIds.length} pack(s) have Stripe Price IDs configured`);
  }
  
  if (packsWithoutPriceIds.length > 0) {
    console.log(`\n⚠️  ${packsWithoutPriceIds.length} pack(s) missing Stripe Price IDs:`);
    packsWithoutPriceIds.forEach(p => {
      console.log(`   - ${p.credits} credits pack (set STRIPE_PRICE_ID_${p.credits} in .env)`);
    });
  }
  
  console.log("\n💡 Make sure these environment variables are set in your .env file:");
  console.log("   STRIPE_PRICE_ID_20=price_...");
  console.log("   STRIPE_PRICE_ID_30=price_...");
  console.log("   STRIPE_PRICE_ID_50=price_...");
  console.log("   STRIPE_PRICE_ID_100=price_...");
}

main()
  .catch((e) => {
    console.error("Error seeding credit packs:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

