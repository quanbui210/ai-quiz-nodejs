import prisma from "./prisma";

export const getUserUsage = async (userId: string) => {
  let usage = await prisma.userUsage.findUnique({
    where: { userId },
  });

  const [
    actualTopicsCount,
    actualQuizzesCount,
    actualDocumentsCount,
    actualCareerRoadmapsCount,
    actualResumesCount,
  ] = await Promise.all([
    prisma.topic.count({ where: { userId } }),
    prisma.quiz.count({ where: { userId } }),
    prisma.document.count({ where: { userId } }),
    prisma.careerGoal.count({ where: { userId, status: "ACTIVE" } }), // Only count active roadmaps
    prisma.resume.count({ where: { userId } }),
  ]);

  // Check if we need to reset monthly interview sessions count
  const now = new Date();
  const needsMonthlyReset = usage
    ? now.getMonth() !== usage.lastMonthReset.getMonth() ||
      now.getFullYear() !== usage.lastMonthReset.getFullYear()
    : false;

  if (needsMonthlyReset) {
    // Reset monthly count
    usage = await prisma.userUsage.update({
      where: { userId },
      data: {
        interviewSessionsThisMonth: 0,
        lastMonthReset: now,
      },
    });
  }

  if (!usage) {
    usage = await prisma.userUsage.create({
      data: {
        userId,
        topicsCount: actualTopicsCount,
        quizzesCount: actualQuizzesCount,
        documentsCount: actualDocumentsCount,
        careerRoadmapsCount: actualCareerRoadmapsCount,
        resumesCount: actualResumesCount,
        interviewSessionsThisMonth: 0,
        lastMonthReset: now,
      },
    });
  } else {
    const needsSync =
      usage.topicsCount !== actualTopicsCount ||
      usage.quizzesCount !== actualQuizzesCount ||
      usage.documentsCount !== actualDocumentsCount ||
      usage.careerRoadmapsCount !== actualCareerRoadmapsCount ||
      usage.resumesCount !== actualResumesCount;

    if (needsSync) {
      usage = await prisma.userUsage.update({
        where: { userId },
        data: {
          topicsCount: actualTopicsCount,
          quizzesCount: actualQuizzesCount,
          documentsCount: actualDocumentsCount,
          careerRoadmapsCount: actualCareerRoadmapsCount,
          resumesCount: actualResumesCount,
        },
      });
    }
  }

  return usage;
};

export const incrementTopicCount = async (userId: string) => {
  await prisma.userUsage.upsert({
    where: { userId },
    create: { userId, topicsCount: 1 },
    update: { topicsCount: { increment: 1 } },
  });
};

export const decrementTopicCount = async (userId: string) => {
  await prisma.userUsage
    .update({
      where: { userId },
      data: { topicsCount: { decrement: 1 } },
    })
    .catch(() => {});
};

export const incrementQuizCount = async (userId: string) => {
  await prisma.userUsage.upsert({
    where: { userId },
    create: { userId, quizzesCount: 1 },
    update: { quizzesCount: { increment: 1 } },
  });
};

export const decrementQuizCount = async (userId: string) => {
  await prisma.userUsage
    .update({
      where: { userId },
      data: { quizzesCount: { decrement: 1 } },
    })
    .catch(() => {});
};

export const incrementDocumentCount = async (userId: string) => {
  await prisma.userUsage.upsert({
    where: { userId },
    create: { userId, documentsCount: 1 },
    update: { documentsCount: { increment: 1 } },
  });
};

export const decrementDocumentCount = async (userId: string) => {
  await prisma.userUsage
    .update({
      where: { userId },
      data: { documentsCount: { decrement: 1 } },
    })
    .catch(() => {});
};

export const incrementCareerRoadmapCount = async (userId: string) => {
  await prisma.userUsage.upsert({
    where: { userId },
    create: { userId, careerRoadmapsCount: 1 },
    update: { careerRoadmapsCount: { increment: 1 } },
  });
};

export const decrementCareerRoadmapCount = async (userId: string) => {
  await prisma.userUsage
    .update({
      where: { userId },
      data: { careerRoadmapsCount: { decrement: 1 } },
    })
    .catch(() => {});
};

export const incrementInterviewSessionCount = async (userId: string) => {
  // Check if we need to reset monthly count first
  const usage = await prisma.userUsage.findUnique({ where: { userId } });
  const now = new Date();
  
  if (usage) {
    const needsReset =
      now.getMonth() !== usage.lastMonthReset.getMonth() ||
      now.getFullYear() !== usage.lastMonthReset.getFullYear();
    
    if (needsReset) {
      await prisma.userUsage.update({
        where: { userId },
        data: {
          interviewSessionsThisMonth: 1,
          lastMonthReset: now,
        },
      });
      return;
    }
  }

  await prisma.userUsage.upsert({
    where: { userId },
    create: { userId, interviewSessionsThisMonth: 1, lastMonthReset: now },
    update: { interviewSessionsThisMonth: { increment: 1 } },
  });
};

export const incrementResumeCount = async (userId: string) => {
  await prisma.userUsage.upsert({
    where: { userId },
    create: { userId, resumesCount: 1 },
    update: { resumesCount: { increment: 1 } },
  });
};

export const decrementResumeCount = async (userId: string) => {
  await prisma.userUsage
    .update({
      where: { userId },
      data: { resumesCount: { decrement: 1 } },
    })
    .catch(() => {});
};

export const getUserSubscription = async (userId: string) => {
  return await prisma.userSubscription.findUnique({
    where: { userId },
    include: { plan: true },
  });
};
