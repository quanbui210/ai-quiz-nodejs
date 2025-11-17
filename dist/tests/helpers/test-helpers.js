"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupTestData = cleanupTestData;
exports.createTestUser = createTestUser;
exports.createTestTopic = createTestTopic;
exports.createTestQuiz = createTestQuiz;
exports.createTestQuestion = createTestQuestion;
const prisma_1 = __importDefault(require("../../utils/prisma"));
async function cleanupTestData() {
    await prisma_1.default.answer.deleteMany({});
    await prisma_1.default.explanation.deleteMany({});
    await prisma_1.default.question.deleteMany({});
    await prisma_1.default.quiz.deleteMany({});
    await prisma_1.default.progress.deleteMany({});
    await prisma_1.default.suggestion.deleteMany({});
    await prisma_1.default.topic.deleteMany({});
    await prisma_1.default.user.deleteMany({});
}
async function createTestUser(data) {
    return prisma_1.default.user.create({
        data: {
            id: data?.id || "test-user-id",
            email: data?.email || "test@example.com",
            name: data?.name || "Test User",
        },
    });
}
async function createTestTopic(userId, data) {
    return prisma_1.default.topic.create({
        data: {
            name: data?.name || "Test Topic",
            userId,
        },
    });
}
async function createTestQuiz(userId, topicId, data) {
    return prisma_1.default.quiz.create({
        data: {
            title: data?.title || "Test Quiz",
            type: "MULTIPLE_CHOICE",
            difficulty: "INTERMEDIATE",
            count: data?.count || 3,
            status: "PENDING",
            userId,
            topicId,
        },
    });
}
async function createTestQuestion(quizId, data) {
    return prisma_1.default.question.create({
        data: {
            text: data?.text || "What is 2 + 2?",
            type: "MULTIPLE_CHOICE",
            options: ["2", "3", "4", "5"],
            correct: data?.correct || "4",
            quizId,
        },
    });
}
//# sourceMappingURL=test-helpers.js.map