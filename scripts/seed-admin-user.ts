import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:55321";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseServiceKey) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY is required to create admin user");
  console.error("Please set SUPABASE_SERVICE_ROLE_KEY in your .env file");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  console.log("Creating admin user...");

  const adminEmail = process.env.ADMIN_EMAIL || "admin@admin.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "password";

  try {
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      console.error("Error listing users:", listError);
      throw listError;
    }

    let supabaseUser = existingUsers.users.find((u) => u.email === adminEmail);

    if (supabaseUser) {
      console.log(`User with email ${adminEmail} already exists in Supabase`);
    } else {
      // Create user in Supabase Auth
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          name: "Admin User",
        },
      });

      if (createError) {
        console.error("Error creating Supabase user:", createError);
        throw createError;
      }

      supabaseUser = newUser.user;
      console.log(`✓ Created Supabase user: ${adminEmail}`);
    }

    if (!supabaseUser?.id) {
      throw new Error("Failed to get Supabase user ID");
    }

    // Check if Prisma User already exists
    let prismaUser = await prisma.user.findUnique({
      where: { id: supabaseUser.id },
    });

    if (prismaUser) {
      console.log(`User already exists in database: ${prismaUser.email}`);
    } else {
      // Create Prisma User
      prismaUser = await prisma.user.create({
        data: {
          id: supabaseUser.id,
          email: adminEmail,
          name: "Admin User",
        },
      });
      console.log(`✓ Created Prisma user: ${prismaUser.email}`);
    }

    // Check if AdminUser already exists
    const existingAdmin = await prisma.adminUser.findUnique({
      where: { userId: prismaUser.id },
    });

    if (existingAdmin) {
      console.log(`Admin profile already exists for user: ${prismaUser.email}`);
      console.log(`  Role: ${existingAdmin.role}`);
      console.log("\n✓ Admin user setup complete!");
      console.log(`\nLogin credentials:`);
      console.log(`  Email: ${adminEmail}`);
      console.log(`  Password: ${adminPassword}`);
      return;
    }

    // Create AdminUser with SUPER_ADMIN role
    const adminUser = await prisma.adminUser.create({
      data: {
        userId: prismaUser.id,
        role: "SUPER_ADMIN",
        permissions: [], // Super admins have all permissions
      },
    });
    console.log(`✓ Created admin profile with SUPER_ADMIN role`);

    // Create default subscription if it doesn't exist
    const { getOrCreateDefaultSubscription } = await import("../src/utils/subscription");
    await getOrCreateDefaultSubscription(prismaUser.id);
    console.log(`✓ Created default subscription`);

    console.log("\n✓ Admin user setup complete!");
    console.log(`\nLogin credentials:`);
    console.log(`  Email: ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(`\nNote: Make sure to change the password after first login!`);
  } catch (error: any) {
    console.error("Error creating admin user:", error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error("Error seeding admin user:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

