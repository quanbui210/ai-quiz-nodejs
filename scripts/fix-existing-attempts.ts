/**
 * One-time script to fix existing QuizAttempt records after schema migration
 * Sets status = COMPLETED for all attempts that have completedAt set
 */

import { PrismaClient, AttemptStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function fixExistingAttempts() {
  try {
    console.log("Starting to fix existing QuizAttempt records...");

    // Find all attempts that have completedAt set but status is not COMPLETED
    const attemptsToFix = await prisma.quizAttempt.findMany({
      where: {
        completedAt: { not: null },
        status: { not: AttemptStatus.COMPLETED },
      },
      select: {
        id: true,
        completedAt: true,
        status: true,
        score: true,
      },
    });

    console.log(`Found ${attemptsToFix.length} attempts to fix`);

    if (attemptsToFix.length === 0) {
      console.log("No attempts need fixing. All done!");
      return;
    }

    // Update all of them to COMPLETED
    const result = await prisma.quizAttempt.updateMany({
      where: {
        completedAt: { not: null },
        status: { not: AttemptStatus.COMPLETED },
      },
      data: {
        status: AttemptStatus.COMPLETED,
      },
    });

    console.log(`Successfully updated ${result.count} attempts to COMPLETED status`);

    // Also fix any attempts that have score/correctCount but no completedAt
    // These should also be marked as COMPLETED
    const attemptsWithScore = await prisma.quizAttempt.findMany({
      where: {
        score: { not: null },
        correctCount: { not: null },
        completedAt: null,
        status: { not: AttemptStatus.COMPLETED },
      },
      select: {
        id: true,
        score: true,
        correctCount: true,
      },
    });

    if (attemptsWithScore.length > 0) {
      console.log(`Found ${attemptsWithScore.length} attempts with scores but no completedAt`);
      
      const result2 = await prisma.quizAttempt.updateMany({
        where: {
          score: { not: null },
          correctCount: { not: null },
          completedAt: null,
          status: { not: AttemptStatus.COMPLETED },
        },
        data: {
          status: AttemptStatus.COMPLETED,
          completedAt: new Date(), // Set to current time or createdAt if available
        },
      });

      console.log(`Successfully updated ${result2.count} more attempts to COMPLETED status`);
    }

    // Verify the fix
    const completedCount = await prisma.quizAttempt.count({
      where: { status: AttemptStatus.COMPLETED },
    });

    const inProgressCount = await prisma.quizAttempt.count({
      where: { status: AttemptStatus.IN_PROGRESS },
    });

    const pausedCount = await prisma.quizAttempt.count({
      where: { status: AttemptStatus.PAUSED },
    });

    console.log("\n Final Status:");
    console.log(`  COMPLETED: ${completedCount}`);
    console.log(`  IN_PROGRESS: ${inProgressCount}`);
    console.log(`  PAUSED: ${pausedCount}`);

    console.log("\n✅ All done! Your data should now be visible in analytics.");
  } catch (error) {
    console.error("❌ Error fixing attempts:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixExistingAttempts()
  .then(() => {
    console.log("\n✨ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });

