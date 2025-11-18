import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";

async function setupProductionDB() {
  console.log("Setting up production database...");
  
  const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!dbUrl) {
    throw new Error("DATABASE_URL or DIRECT_URL environment variable is required");
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required");
  }

  console.log(`Connecting to database: ${dbUrl.replace(/:[^:@]+@/, ":****@")}`);
  
  try {
    console.log("Pushing schema to database...");
    execSync(
      `npx prisma db push --schema=./src/prisma/schema.prisma --skip-generate --accept-data-loss`,
      {
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL: dbUrl },
      }
    );
    
    console.log("✅ Schema pushed successfully!");
    
    console.log("\nSeeding default subscription plans...");
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    });
    
    const existingDefault = await prisma.subscriptionPlan.findFirst({
      where: { isDefault: true },
    });

    if (!existingDefault) {
      await prisma.subscriptionPlan.createMany({
        data: [
          {
            name: "Free",
            isDefault: true,
            isActive: true,
            isCustom: false,
            maxTopics: 5,
            maxQuizzes: 10,
            maxDocuments: 0,
            allowedModels: ["gpt-3.5-turbo"],
          },
          {
            name: "Pro",
            isDefault: false,
            isActive: true,
            isCustom: false,
            maxTopics: 50,
            maxQuizzes: 200,
            maxDocuments: 20,
            allowedModels: ["gpt-3.5-turbo", "gpt-4-turbo"],
          },
          {
            name: "Premium",
            isDefault: false,
            isActive: true,
            isCustom: false,
            maxTopics: 200,
            maxQuizzes: 1000,
            maxDocuments: 50,
            allowedModels: ["gpt-3.5-turbo", "gpt-4-turbo", "gpt-4o"],
          },
        ],
      });
      console.log("✅ Default plans seeded!");
    } else {
      console.log("ℹ️  Default plans already exist, skipping seed.");
    }
    
    // Seed admin user
    console.log("\nSeeding admin user...");
    const adminEmail = "admin@admin.com";
    const adminPassword = "password";
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
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
      console.log(`✅ Created Supabase user: ${adminEmail}`);
    } else {
      console.log(`ℹ️  Supabase user already exists: ${adminEmail}`);
    }

    if (!supabaseUser?.id) {
      throw new Error("Failed to get Supabase user ID");
    }

    // Check if Prisma User already exists
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
      console.log(`✅ Created Prisma user: ${prismaUser.email}`);
    } else {
      console.log(`ℹ️  Prisma user already exists: ${prismaUser.email}`);
    }

    // Check if AdminUser already exists
    const existingAdmin = await prisma.adminUser.findUnique({
      where: { userId: prismaUser.id },
    });

    if (!existingAdmin) {
      // Create AdminUser with SUPER_ADMIN role
      await prisma.adminUser.create({
        data: {
          userId: prismaUser.id,
          role: "SUPER_ADMIN",
          permissions: [],
        },
      });
      console.log(`✅ Created admin profile with SUPER_ADMIN role`);
      
      // Create default subscription
      const { getOrCreateDefaultSubscription } = await import(
        "../src/utils/subscription"
      );
      await getOrCreateDefaultSubscription(prismaUser.id);
      console.log(`✅ Created default subscription for admin`);
    } else {
      console.log(`ℹ️  Admin profile already exists for user: ${prismaUser.email}`);
    }
    
    console.log("\n📧 Admin login credentials:");
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   ⚠️  Please change the password after first login!`);
    
    await prisma.$disconnect();
    console.log("\n✅ Production database setup complete!");
  } catch (error) {
    console.error("❌ Error setting up database:", error);
    process.exit(1);
  }
}

setupProductionDB();

