import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:55321";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseServiceKey) {
  console.error(
    "Error: SUPABASE_SERVICE_ROLE_KEY is required to create test users",
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

const testUsers = [
  {
    email: "user-alpha@test.com",
    password: "password",
    name: "Test User Alpha",
  },
  {
    email: "user-beta@test.com",
    password: "password",
    name: "Test User Beta",
  },
];

async function createTestUser(email: string, password: string, name: string) {
  try {
    const { data: existingUsers, error: listError } =
      await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      console.error(`Error listing users for ${email}:`, listError);
      throw listError;
    }

    let supabaseUser = existingUsers.users.find((u) => u.email === email);

    if (supabaseUser) {
      console.log(`User with email ${email} already exists in Supabase`);
    } else {
      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            name,
          },
        });

      if (createError) {
        console.error(`Error creating Supabase user ${email}:`, createError);
        throw createError;
      }

      supabaseUser = newUser.user;
      console.log(`✓ Created Supabase user: ${email}`);
    }

    if (!supabaseUser?.id) {
      throw new Error(`Failed to get Supabase user ID for ${email}`);
    }

    let prismaUser = await prisma.user.findUnique({
      where: { id: supabaseUser.id },
    });

    if (prismaUser) {
      console.log(`User already exists in database: ${prismaUser.email}`);
    } else {
      prismaUser = await prisma.user.create({
        data: {
          id: supabaseUser.id,
          email,
          name,
        },
      });
      console.log(`✓ Created Prisma user: ${prismaUser.email}`);
    }

    const existingSubscription = await prisma.userSubscription.findUnique({
      where: { userId: prismaUser.id },
    });

    if (!existingSubscription) {
      const { getOrCreateDefaultSubscription } = await import(
        "../src/utils/subscription"
      );
      await getOrCreateDefaultSubscription(prismaUser.id);
      console.log(`✓ Created default subscription for ${email}`);
    } else {
      console.log(`✓ Subscription already exists for ${email}`);
    }

    return { email, userId: prismaUser.id };
  } catch (error: any) {
    console.error(`Error creating test user ${email}:`, error);
    throw error;
  }
}

async function main() {

  const results: { userId: string; email: string }[] = [];

  for (const user of testUsers) {
    try {
      const result = await createTestUser(user.email, user.password, user.name);
      results.push(result);
      console.log("");
    } catch (error: any) {
      console.error(`Failed to create ${user.email}:`, error.message);
      console.log("");
    }
  }

  console.log("✓ Test users setup complete!");
  console.log("\nTest user credentials:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const user of testUsers) {
    console.log(`  Email: ${user.email}`);
    console.log(`  Password: ${user.password}`);
    console.log("");
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\nLogin endpoint: POST /api/v1/auth/login");
  console.log("Request body: { email, password }");
}

main()
  .catch((e) => {
    console.error("Error seeding test users:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

