"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Quiz Backend API",
            version: "1.0.0",
            description: "API documentation for the Quiz Backend application. This API handles authentication, topic management, and quiz creation/submission.",
            contact: {
                name: "API Support",
            },
        },
        servers: [
            {
                url: "http://localhost:3000",
                description: "Development server",
            },
            {
                url: process.env.BACKEND_URL || "http://localhost:3000",
                description: "Production server",
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                    description: "Enter Supabase JWT token",
                },
            },
            schemas: {
                Error: {
                    type: "object",
                    properties: {
                        error: {
                            type: "string",
                            description: "Error message",
                        },
                        message: {
                            type: "string",
                            description: "Additional error details",
                        },
                    },
                },
                User: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            format: "uuid",
                        },
                        email: {
                            type: "string",
                            format: "email",
                        },
                        name: {
                            type: "string",
                            nullable: true,
                        },
                        avatarUrl: {
                            type: "string",
                            nullable: true,
                        },
                        createdAt: {
                            type: "string",
                            format: "date-time",
                        },
                        updatedAt: {
                            type: "string",
                            format: "date-time",
                        },
                    },
                },
                Session: {
                    type: "object",
                    properties: {
                        access_token: {
                            type: "string",
                        },
                        refresh_token: {
                            type: "string",
                        },
                        expires_at: {
                            type: "number",
                        },
                        expires_in: {
                            type: "number",
                        },
                        token_type: {
                            type: "string",
                        },
                        user: {
                            $ref: "#/components/schemas/User",
                        },
                    },
                },
                Topic: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            format: "uuid",
                        },
                        name: {
                            type: "string",
                        },
                        description: {
                            type: "string",
                            nullable: true,
                        },
                        createdAt: {
                            type: "string",
                            format: "date-time",
                        },
                        updatedAt: {
                            type: "string",
                            format: "date-time",
                        },
                    },
                },
                Question: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            format: "uuid",
                        },
                        text: {
                            type: "string",
                        },
                        type: {
                            type: "string",
                            enum: ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"],
                        },
                        options: {
                            type: "array",
                            items: {
                                type: "string",
                            },
                        },
                    },
                },
                Quiz: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            format: "uuid",
                        },
                        title: {
                            type: "string",
                        },
                        type: {
                            type: "string",
                            enum: ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"],
                        },
                        difficulty: {
                            type: "string",
                            enum: ["EASY", "INTERMEDIATE", "ADVANCED"],
                        },
                        timer: {
                            type: "number",
                            description: "Timer in seconds",
                        },
                        status: {
                            type: "string",
                            enum: ["PENDING", "ACTIVE", "COMPLETED"],
                        },
                        count: {
                            type: "number",
                            description: "Number of questions",
                        },
                        questions: {
                            type: "array",
                            items: {
                                $ref: "#/components/schemas/Question",
                            },
                        },
                        createdAt: {
                            type: "string",
                            format: "date-time",
                        },
                        updatedAt: {
                            type: "string",
                            format: "date-time",
                        },
                    },
                },
                QuizResult: {
                    type: "object",
                    properties: {
                        score: {
                            type: "number",
                            description: "Number of correct answers",
                        },
                        total: {
                            type: "number",
                            description: "Total number of questions",
                        },
                        percentage: {
                            type: "number",
                            description: "Score percentage",
                        },
                        answers: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    questionId: {
                                        type: "string",
                                        format: "uuid",
                                    },
                                    userAnswer: {
                                        type: "string",
                                    },
                                    correctAnswer: {
                                        type: "string",
                                    },
                                    isCorrect: {
                                        type: "boolean",
                                    },
                                    explanation: {
                                        type: "string",
                                        nullable: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        tags: [
            {
                name: "Authentication",
                description: "Authentication endpoints using Google OAuth",
            },
            {
                name: "Topics",
                description: "Topic management endpoints",
            },
            {
                name: "Quizzes",
                description: "Quiz creation and submission endpoints",
            },
            {
                name: "Results",
                description: "Quiz results, attempts, and analytics endpoints",
            },
        ],
    },
    apis: [
        "./src/modules/**/*.routes.ts",
        "./src/modules/**/*.route.ts",
        "./src/app.ts",
    ],
};
const swaggerSpec = (0, swagger_jsdoc_1.default)(options);
exports.default = swaggerSpec;
//# sourceMappingURL=swagger.js.map