import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import Stripe from "stripe";

dotenv.config();

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-10-29.clover",
});

async function main() {
  console.log("Verifying Stripe Price IDs for credit packs...\n");

  const packs = await (prisma as any).creditPack.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
  });

  for (const pack of packs) {
    console.log(`\n📦 Pack: ${pack.credits} credits`);
    console.log(`   Price ID: ${pack.stripePriceId || "❌ NOT SET"}`);

    if (!pack.stripePriceId) {
      console.log("   ⚠️  No Stripe Price ID configured");
      continue;
    }

    try {
      const price = await stripe.prices.retrieve(pack.stripePriceId, {
        expand: ["product"],
      });

      const product = typeof price.product === "string" 
        ? await stripe.products.retrieve(price.product)
        : price.product;

      console.log(`   ✅ Price exists`);
      console.log(`   Amount: ${(price.unit_amount || 0) / 100} ${price.currency?.toUpperCase()}`);
      console.log(`   Type: ${price.type}`);
      
      if (price.type === "recurring") {
        console.log(`   ⚠️  WARNING: Price is RECURRING but should be ONE-TIME!`);
        console.log(`   Recurring interval: ${price.recurring?.interval}`);
      } else {
        console.log(`   ✅ Price type is correct (one-time)`);
      }

      const productName = product && !("deleted" in product) ? product.name : product.id;
      console.log(`   Product: ${productName}`);
      console.log(`   Active: ${price.active ? "✅" : "❌"}`);
      
      if (!price.active) {
        console.log(`   ⚠️  WARNING: Price is INACTIVE in Stripe!`);
      }

    } catch (error: any) {
      if (error.code === "resource_missing") {
        console.log(`   ❌ ERROR: Price ID does not exist in Stripe!`);
        console.log(`   This price ID is invalid: ${pack.stripePriceId}`);
      } else {
        console.log(`   ❌ ERROR: ${error.message}`);
      }
    }
  }

  console.log("\n✅ Verification complete!");
  console.log("\n💡 If you see errors:");
  console.log("   1. Check that Price IDs are correct in your .env file");
  console.log("   2. Verify prices are set as 'One-time payment' in Stripe Dashboard");
  console.log("   3. Make sure prices are active in Stripe");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

