import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:55321";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseServiceKey) {
  console.error(
    "Error: SUPABASE_SERVICE_ROLE_KEY is required to reset and seed database",
  );
  console.error("Please set SUPABASE_SERVICE_ROLE_KEY in your .env file");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function resetDatabase() {
  console.log("Resetting database...");

  try {
    // Delete in reverse dependency order (children first, parents last)
    await prisma.chatMessage.deleteMany();
    console.log("  Deleted ChatMessage records");

    await prisma.chatSession.deleteMany();
    console.log("  Deleted ChatSession records");

    await prisma.documentEmbedding.deleteMany();
    console.log("  Deleted DocumentEmbedding records");

    await prisma.document.deleteMany();
    console.log("  Deleted Document records");

    await prisma.answer.deleteMany();
    console.log("  Deleted Answer records");

    await prisma.explanation.deleteMany();
    console.log("  ✓ Deleted Explanation records");

    await prisma.question.deleteMany();
    console.log("  ✓ Deleted Question records");

    await prisma.quizAttempt.deleteMany();
    console.log("  ✓ Deleted QuizAttempt records");

    await prisma.quiz.deleteMany();
    console.log("  ✓ Deleted Quiz records");

    await prisma.progress.deleteMany();
    console.log("  ✓ Deleted Progress records");

    await prisma.suggestion.deleteMany();
    console.log("  ✓ Deleted Suggestion records");

    await prisma.topic.deleteMany();
    console.log("  ✓ Deleted Topic records");

    await prisma.adminUser.deleteMany();
    console.log("  ✓ Deleted AdminUser records");

    await prisma.userSubscription.deleteMany();
    console.log("  ✓ Deleted UserSubscription records");

    await prisma.userUsage.deleteMany();
    console.log("  ✓ Deleted UserUsage records");

    await prisma.user.deleteMany();
    console.log("  ✓ Deleted User records");

    await prisma.subscriptionPlan.deleteMany();
    console.log("  ✓ Deleted SubscriptionPlan records");

    console.log("\n✅ Database reset complete!\n");
  } catch (error: any) {
    console.error("❌ Error resetting database:", error);
    throw error;
  }
}

async function seedPlans() {
  console.log("📦 Seeding subscription plans...");

  try {
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
    console.log(`  ✓ Created Free plan (${freePlan.id})`);

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
    console.log(`  ✓ Created Pro plan (${proPlan.id})`);

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
    console.log(`  ✓ Created Premium plan (${premiumPlan.id})`);

    console.log("\n✅ Plans seeded successfully!\n");
  } catch (error: any) {
    console.error("❌ Error seeding plans:", error);
    throw error;
  }
}

async function seedAdmin() {
  console.log("👤 Seeding admin user...");

  const adminEmail = process.env.ADMIN_EMAIL || "admin@admin.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "password";

  try {
    // Check if user exists in Supabase
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    let supabaseUser = existingUsers?.users.find((u) => u.email === adminEmail);

    if (!supabaseUser) {
      // Create user in Supabase Auth
      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: adminEmail,
          password: adminPassword,
          email_confirm: true,
          user_metadata: {
            name: "Admin User",
          },
        });

      if (createError) {
        throw new Error(`Failed to create Supabase user: ${createError.message}`);
      }

      supabaseUser = newUser.user;
      console.log(`  ✓ Created Supabase user: ${adminEmail}`);
    } else {
      console.log(`  ℹ️  Supabase user already exists: ${adminEmail}`);
    }

    if (!supabaseUser?.id) {
      throw new Error("Failed to get Supabase user ID");
    }

    // Create Prisma User
    let prismaUser = await prisma.user.findUnique({
      where: { id: supabaseUser.id },
    });

    if (!prismaUser) {
      prismaUser = await prisma.user.create({
        data: {
          id: supabaseUser.id,
          email: adminEmail,
          name: "Admin User",
        },
      });
      console.log(`  ✓ Created Prisma user: ${prismaUser.email}`);
    } else {
      console.log(`  ℹ️  Prisma user already exists: ${prismaUser.email}`);
    }

    // Create AdminUser
    const existingAdmin = await prisma.adminUser.findUnique({
      where: { userId: prismaUser.id },
    });

    if (!existingAdmin) {
      await prisma.adminUser.create({
        data: {
          userId: prismaUser.id,
          role: "SUPER_ADMIN",
          permissions: [],
        },
      });
      console.log(`  ✓ Created admin profile with SUPER_ADMIN role`);
    } else {
      console.log(`  ℹ️  Admin profile already exists`);
    }

    // Create default subscription
    const { getOrCreateDefaultSubscription } = await import(
      "../src/utils/subscription"
    );
    await getOrCreateDefaultSubscription(prismaUser.id);
    console.log(`  ✓ Created default subscription`);

    console.log("\n✅ Admin user seeded successfully!");
    console.log("\n📧 Admin login credentials:");
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   ⚠️  Please change the password after first login!\n`);
  } catch (error: any) {
    console.error("❌ Error seeding admin user:", error);
    throw error;
  }
}

async function main() {
  console.log("🚀 Starting database reset and seed...\n");

  try {
    // Step 1: Reset database
    await resetDatabase();

    // Step 2: Seed plans
    await seedPlans();

    // Step 3: Seed admin user
    await seedAdmin();

    console.log("✅ Database reset and seed complete!");
  } catch (error: any) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

