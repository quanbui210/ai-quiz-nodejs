export declare function cleanupTestData(): Promise<void>;
export declare function createTestUser(data?: {
    id?: string;
    email?: string;
    name?: string;
}): Promise<{
    name: string | null;
    email: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    avatarUrl: string | null;
}>;
export declare function createTestTopic(userId: string, data?: {
    name?: string;
}): Promise<{
    name: string;
    id: string;
    userId: string;
    createdAt: Date;
    description: string | null;
}>;
export declare function createTestQuiz(userId: string, topicId: string, data?: {
    title?: string;
    count?: number;
}): Promise<{
    id: string;
    userId: string;
    status: import(".prisma/client").$Enums.QuizStatus;
    createdAt: Date;
    title: string;
    type: import(".prisma/client").$Enums.QuizType;
    difficulty: import(".prisma/client").$Enums.Difficulty;
    expiresAt: Date | null;
    timer: number | null;
    count: number;
    topicId: string | null;
    documentId: string | null;
}>;
export declare function createTestQuestion(quizId: string, data?: {
    text?: string;
    correct?: string;
}): Promise<{
    id: string;
    createdAt: Date;
    type: import(".prisma/client").$Enums.QuestionType;
    text: string;
    options: import("@prisma/client/runtime/library").JsonValue | null;
    correct: string | null;
    quizId: string;
}>;
//# sourceMappingURL=test-helpers.d.ts.map