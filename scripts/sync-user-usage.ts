import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("Starting user usage sync...");

  const users = await prisma.user.findMany({
    select: { id: true },
  });

  console.log(`Found ${users.length} users to sync`);

  let synced = 0;
  let created = 0;
  let errors = 0;

  for (const user of users) {
    try {
      // Count actual usage from database
      const [topicsCount, quizzesCount, documentsCount] = await Promise.all([
        prisma.topic.count({ where: { userId: user.id } }),
        prisma.quiz.count({ where: { userId: user.id } }),
        prisma.document.count({ where: { userId: user.id } }),
      ]);

      const existing = await prisma.userUsage.findUnique({
        where: { userId: user.id },
      });

      if (existing) {
        if (
          existing.topicsCount !== topicsCount ||
          existing.quizzesCount !== quizzesCount ||
          existing.documentsCount !== documentsCount
        ) {
          await prisma.userUsage.update({
            where: { userId: user.id },
            data: {
              topicsCount,
              quizzesCount,
              documentsCount,
            },
          });
          synced++;
          console.log(
            `✓ Synced user ${user.id}: ${topicsCount} topics, ${quizzesCount} quizzes, ${documentsCount} documents`,
          );
        }
      } else {
        // Create new UserUsage record
        await prisma.userUsage.create({
          data: {
            userId: user.id,
            topicsCount,
            quizzesCount,
            documentsCount,
          },
        });
        created++;
        console.log(
          `✓ Created usage for user ${user.id}: ${topicsCount} topics, ${quizzesCount} quizzes, ${documentsCount} documents`,
        );
      }
    } catch (error: any) {
      errors++;
      console.error(`✗ Error syncing user ${user.id}:`, error.message);
    }
  }

  console.log("\n=== Sync Complete ===");
  console.log(`Total users: ${users.length}`);
  console.log(`Synced: ${synced}`);
  console.log(`Created: ${created}`);
  console.log(`Errors: ${errors}`);
}

main()
  .catch((e) => {
    console.error("Error running sync:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
