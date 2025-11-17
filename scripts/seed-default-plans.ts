import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding default subscription plans...");

  const existingDefault = await prisma.subscriptionPlan.findFirst({
    where: { isDefault: true },
  });

  if (existingDefault) {
    return;
  }

  const freePlan = await prisma.subscriptionPlan.create({
    data: {
      name: "Free",
      isDefault: true,
      isActive: true,
      isCustom: false,
      maxTopics: 5,
      maxQuizzes: 10,
      maxDocuments: 0,
      allowedModels: ["gpt-3.5-turbo"],
    },
  });

  const proPlan = await prisma.subscriptionPlan.create({
    data: {
      name: "Pro",
      isDefault: false,
      isActive: true,
      isCustom: false,
      maxTopics: 50,
      maxQuizzes: 200,
      maxDocuments: 20,

      allowedModels: ["gpt-3.5-turbo", "gpt-4-turbo"],
    },
  });

  const premiumPlan = await prisma.subscriptionPlan.create({
    data: {
      name: "Premium",
      isDefault: false,
      isActive: true,
      isCustom: false,
      maxTopics: 200,
      maxQuizzes: 1000,
      maxDocuments: 50,
      allowedModels: ["gpt-3.5-turbo", "gpt-4-turbo", "gpt-4o"],
    },
  });

  console.log("\nNext steps:");
  console.log("1. Create products and prices in Stripe Dashboard");
  console.log("2. Update stripePriceId and stripeProductId in the database");
  console.log("3. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env");
}

main()
  .catch((e) => {
    console.error("Error seeding plans:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
