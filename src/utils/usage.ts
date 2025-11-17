import prisma from "./prisma";

export const getUserUsage = async (userId: string) => {
  let usage = await prisma.userUsage.findUnique({
    where: { userId },
  });

  const [actualTopicsCount, actualQuizzesCount, actualDocumentsCount] =
    await Promise.all([
      prisma.topic.count({ where: { userId } }),
      prisma.quiz.count({ where: { userId } }),
      prisma.document.count({ where: { userId } }),
    ]);

  if (!usage) {
    usage = await prisma.userUsage.create({
      data: {
        userId,
        topicsCount: actualTopicsCount,
        quizzesCount: actualQuizzesCount,
        documentsCount: actualDocumentsCount,
      },
    });
  } else {
    const needsSync =
      usage.topicsCount !== actualTopicsCount ||
      usage.quizzesCount !== actualQuizzesCount ||
      usage.documentsCount !== actualDocumentsCount;

    if (needsSync) {
      usage = await prisma.userUsage.update({
        where: { userId },
        data: {
          topicsCount: actualTopicsCount,
          quizzesCount: actualQuizzesCount,
          documentsCount: actualDocumentsCount,
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

export const getUserSubscription = async (userId: string) => {
  return await prisma.userSubscription.findUnique({
    where: { userId },
    include: { plan: true },
  });
};
