"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserSubscription = exports.decrementDocumentCount = exports.incrementDocumentCount = exports.decrementQuizCount = exports.incrementQuizCount = exports.decrementTopicCount = exports.incrementTopicCount = exports.getUserUsage = void 0;
const prisma_1 = __importDefault(require("./prisma"));
const getUserUsage = async (userId) => {
    let usage = await prisma_1.default.userUsage.findUnique({
        where: { userId },
    });
    const [actualTopicsCount, actualQuizzesCount, actualDocumentsCount] = await Promise.all([
        prisma_1.default.topic.count({ where: { userId } }),
        prisma_1.default.quiz.count({ where: { userId } }),
        prisma_1.default.document.count({ where: { userId } }),
    ]);
    if (!usage) {
        usage = await prisma_1.default.userUsage.create({
            data: {
                userId,
                topicsCount: actualTopicsCount,
                quizzesCount: actualQuizzesCount,
                documentsCount: actualDocumentsCount,
            },
        });
    }
    else {
        const needsSync = usage.topicsCount !== actualTopicsCount ||
            usage.quizzesCount !== actualQuizzesCount ||
            usage.documentsCount !== actualDocumentsCount;
        if (needsSync) {
            usage = await prisma_1.default.userUsage.update({
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
exports.getUserUsage = getUserUsage;
const incrementTopicCount = async (userId) => {
    await prisma_1.default.userUsage.upsert({
        where: { userId },
        create: { userId, topicsCount: 1 },
        update: { topicsCount: { increment: 1 } },
    });
};
exports.incrementTopicCount = incrementTopicCount;
const decrementTopicCount = async (userId) => {
    await prisma_1.default.userUsage.update({
        where: { userId },
        data: { topicsCount: { decrement: 1 } },
    }).catch(() => {
    });
};
exports.decrementTopicCount = decrementTopicCount;
const incrementQuizCount = async (userId) => {
    await prisma_1.default.userUsage.upsert({
        where: { userId },
        create: { userId, quizzesCount: 1 },
        update: { quizzesCount: { increment: 1 } },
    });
};
exports.incrementQuizCount = incrementQuizCount;
const decrementQuizCount = async (userId) => {
    await prisma_1.default.userUsage.update({
        where: { userId },
        data: { quizzesCount: { decrement: 1 } },
    }).catch(() => {
    });
};
exports.decrementQuizCount = decrementQuizCount;
const incrementDocumentCount = async (userId) => {
    await prisma_1.default.userUsage.upsert({
        where: { userId },
        create: { userId, documentsCount: 1 },
        update: { documentsCount: { increment: 1 } },
    });
};
exports.incrementDocumentCount = incrementDocumentCount;
const decrementDocumentCount = async (userId) => {
    await prisma_1.default.userUsage.update({
        where: { userId },
        data: { documentsCount: { decrement: 1 } },
    }).catch(() => {
    });
};
exports.decrementDocumentCount = decrementDocumentCount;
const getUserSubscription = async (userId) => {
    return await prisma_1.default.userSubscription.findUnique({
        where: { userId },
        include: { plan: true },
    });
};
exports.getUserSubscription = getUserSubscription;
//# sourceMappingURL=usage.js.map