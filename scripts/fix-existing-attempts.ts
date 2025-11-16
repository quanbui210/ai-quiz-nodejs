/**
 * One-time script to fix existing QuizAttempt records after schema migration
 * Sets status = COMPLETED for all attempts that have completedAt set
 */

import { PrismaClient, AttemptStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function fixExistingAttempts() {
  try {

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


    if (attemptsToFix.length === 0) {
      console.log("No attempts need fixing. All done!");
      return;
    }

    const result = await prisma.quizAttempt.updateMany({
      where: {
        completedAt: { not: null },
        status: { not: AttemptStatus.COMPLETED },
      },
      data: {
        status: AttemptStatus.COMPLETED,
      },
    });


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
          completedAt: new Date(), 
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

  } catch (error) {
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixExistingAttempts()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    process.exit(1);
  });

