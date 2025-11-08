import OpenAI from "openai";
import { Request, Response } from "express";
import prisma from "../../utils/prisma";
import {
  QuizType,
  Difficulty,
  QuestionType,
  QuizStatus,
  Quiz,
  Question,
  Prisma,
} from "@prisma/client";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ParsedQuiz {
  title: string;
  questions: Array<{
    text: string;
    type: QuestionType;
    options: string[];
    correct: string;
    explanation?: string;
  }>;
  difficulty: Difficulty;
  topic: string;
}

function parseQuizResponse(quizText: string): ParsedQuiz | null {
  try {
    const titleMatch = quizText.match(/- Title:\s*(.+)/i);
    const title = titleMatch ? titleMatch[1]?.trim() : "Untitled Quiz";

    const difficultyMatch = quizText.match(
      /- Difficulty:\s*(BEGINNER|INTERMEDIATE|ADVANCED)/i,
    );
    const difficulty =
      (difficultyMatch?.[1]?.toUpperCase() as Difficulty) ||
      Difficulty.INTERMEDIATE;

    const topicMatch = quizText.match(/- Topic:\s*(.+)/i);
    const topic = topicMatch ? topicMatch[1]?.trim() : "";

    const questionsSection = quizText.match(
      /Questions?:([\s\S]*?)(?:Options?:|Correct Answers?:|Explanation?:)/i,
    );
    const questionsText = questionsSection ? questionsSection[1] : "";

    const optionsSection = quizText.match(
      /Options?:([\s\S]*?)(?:Correct Answers?:|Explanation?:)/i,
    );
    const optionsText = optionsSection ? optionsSection[1] : "";

    const correctAnswersSection = quizText.match(
      /Correct Answers?:([\s\S]*?)(?:Explanation?:|Difficulty?:)/i,
    );
    const correctAnswersText = correctAnswersSection
      ? correctAnswersSection[1]
      : "";

    const explanationSection = quizText.match(
      /Explanation:?\s*([\s\S]*?)(?:Difficulty?:|Question Count?:|Topic?:|Created At?:)/i,
    );
    const explanationText = explanationSection
      ? explanationSection[1]?.trim()
      : "";

    const questionLines = questionsText
      ? questionsText
          .split(/\d+\./)
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.match(/^Questions?:/i))
      : [];

    const optionLines = optionsText
      ? optionsText
          .split(/\d+\./)
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.match(/^Options?:/i))
      : [];

    const correctAnswerLines = correctAnswersText
      ? correctAnswersText
          .split(/\d+\./)
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.match(/^Correct Answers?:/i))
      : [];

    const allOptions = optionLines.filter((opt) => opt.length > 0);

    const OPTIONS_PER_QUESTION = 4;
    const questionCount = questionLines.length;

    const expectedOptions = questionCount * OPTIONS_PER_QUESTION;
    if (allOptions.length < expectedOptions) {
      console.warn(
        `Expected ${expectedOptions} options but got ${allOptions.length}. Some questions may have incomplete options.`,
      );
    }

    const questions = questionLines
      .map((questionText, index) => {
        const text = questionText.trim();

        const startIndex = index * OPTIONS_PER_QUESTION;
        const endIndex = startIndex + OPTIONS_PER_QUESTION;
        const questionOptions = allOptions.slice(startIndex, endIndex);

        const correct = correctAnswerLines[index]?.trim() || "";

        if (questionOptions.length < OPTIONS_PER_QUESTION) {
          console.warn(
            `Question ${index + 1} has only ${questionOptions.length} options (expected ${OPTIONS_PER_QUESTION})`,
          );
        }

        return {
          text: text || "",
          type: QuestionType.MULTIPLE_CHOICE,
          options: questionOptions.length > 0 ? questionOptions : [],
          correct: correct || "",
          explanation: explanationText || undefined,
        };
      })
      .filter((q) => q.text.length > 0);

    return {
      title: title || "Untitled Quiz",
      questions,
      difficulty,
      topic: topic || "",
    };
  } catch (error) {
    console.error("Error parsing quiz:", error);
    return null;
  }
}

export const testCreateQuiz = async (req: Request, res: Response) => {
  const { topic, difficulty, questionCount } = req.body;

  const response = await client.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content: `You are a quiz creator assistant. Create a ${difficulty} level quiz with ${questionCount} questions about "${topic}".

Return the quiz in this EXACT format:
- Title: [Quiz Title]
- Questions:
1. [Question 1]
2. [Question 2]
...
- Options:
1. [Option A for Q1]
2. [Option B for Q1]
3. [Option C for Q1]
4. [Option D for Q1]
5. [Option A for Q2]
... (continue for all questions)
- Correct Answers:
1. [Correct answer for Q1 - must match one of the options exactly]
2. [Correct answer for Q2]
...
- Explanation: [General explanation about the topic]
- Difficulty: ${difficulty}
- Topic: ${topic}

IMPORTANT: Each question must have exactly 4 options. The correct answer must exactly match one of the options.`,
      },
      {
        role: "user",
        content: `Create a ${difficulty} level quiz about "${topic}" with ${questionCount} multiple choice questions.`,
      },
    ],
  });

  const quizText = response.choices[0]?.message?.content;
  if (!quizText) {
    return res.status(400).json({ error: "No quiz generated" });
  }

  const parsedQuiz = parseQuizResponse(quizText);
  if (!parsedQuiz || parsedQuiz.questions.length === 0) {
    return res
      .status(400)
      .json({ error: "Failed to parse quiz. Please try again." });
  }

  return res.json(parsedQuiz);
};

export const createQuiz = async (req: Request, res: Response) => {
  try {
    const {
      topic,
      difficulty,
      questionCount,
      quizType,
      timer,
      topicId,
      userId,
    } = req.body;

    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return res
        .status(400)
        .json({ error: "topic is required and must be a non-empty string" });
    }
    if (!difficulty || !Object.values(Difficulty).includes(difficulty)) {
      return res
        .status(400)
        .json({
          error:
            "difficulty is required and must be BEGINNER, INTERMEDIATE, or ADVANCED",
        });
    }
    if (
      !questionCount ||
      typeof questionCount !== "number" ||
      questionCount <= 0
    ) {
      return res
        .status(400)
        .json({
          error: "questionCount is required and must be a positive number",
        });
    }
    if (!topicId || typeof topicId !== "string") {
      return res.status(400).json({ error: "topicId is required" });
    }
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId is required" });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ error: "OpenAI API key is not configured" });
    }

    const response = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a quiz creator assistant. Create a ${difficulty} level quiz with ${questionCount} questions about "${topic}".

Return the quiz in this EXACT format:
- Title: [Quiz Title]
- Questions:
  1. [Question 1]
  2. [Question 2]
  ...
- Options:
  1. [Option A for Q1]
  2. [Option B for Q1]
  3. [Option C for Q1]
  4. [Option D for Q1]
  5. [Option A for Q2]
  ... (continue for all questions)
- Correct Answers:
  1. [Correct answer for Q1 - must match one of the options exactly]
  2. [Correct answer for Q2]
  ...
- Explanation: [General explanation about the topic]
- Difficulty: ${difficulty}
- Topic: ${topic}

IMPORTANT: Each question must have exactly 4 options. The correct answer must exactly match one of the options.`,
        },
        {
          role: "user",
          content: `Create a ${difficulty} level quiz about "${topic}" with ${questionCount} multiple choice questions.`,
        },
      ],
    });

    const quizText = response.choices[0]?.message?.content;
    if (!quizText) {
      return res.status(400).json({ error: "No quiz generated" });
    }

    const parsedQuiz = parseQuizResponse(quizText);
    if (!parsedQuiz || parsedQuiz.questions.length === 0) {
      return res
        .status(400)
        .json({ error: "Failed to parse quiz. Please try again." });
    }

    const quiz = await prisma.quiz.create({
      data: {
        title: parsedQuiz.title,
        type: (quizType as QuizType) || QuizType.MULTIPLE_CHOICE,
        difficulty: parsedQuiz.difficulty,
        count: parsedQuiz.questions.length,
        timer: timer || null,
        status: QuizStatus.PENDING,
        topicId,
        userId,
        questions: {
          create: parsedQuiz.questions.map((q) => ({
            text: q.text,
            type: q.type,
            options: q.options as Prisma.InputJsonValue,
            correct: q.correct,
            explanation: q.explanation
              ? {
                  create: {
                    content: q.explanation,
                  },
                }
              : undefined,
          })),
        },
      } as Prisma.QuizUncheckedCreateInput,
      include: {
        questions: {
          select: {
            id: true,
            text: true,
            type: true,
            options: true,
          },
        },
      },
    });

    const safeQuiz = {
      id: quiz.id,
      title: quiz.title,
      type: quiz.type,
      difficulty: quiz.difficulty,
      count: parsedQuiz.questions.length,
      timer: quiz.timer,
      status: quiz.status,
      createdAt: quiz.createdAt,
      questions: "questions" in quiz ? quiz.questions : [],
    } as any;

    return res.status(201).json(safeQuiz);
  } catch (error: any) {
    console.error("Quiz creation error:", error);
    return res
      .status(500)
      .json({ error: "Failed to create quiz", message: error.message });
  }
};

/**
 * Get quiz by ID (without correct answers)
 */
export const getQuiz = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const quiz = await prisma.quiz.findUnique({
      where: { id },
      include: {
        topic: {
          select: {
            id: true,
            name: true,
          },
        },
        questions: {
          select: {
            id: true,
            text: true,
            type: true,
            options: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      } as Prisma.QuizInclude,
    });

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    return res.json(quiz);
  } catch (error: any) {
    console.error("Get quiz error:", error);
    return res
      .status(500)
      .json({ error: "Failed to get quiz", message: error.message });
  }
};

/**
 * Submit answers and get results
 */
export const submitAnswers = async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;
    const { answers, userId } = req.body;

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: "answers array is required" });
    }
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId is required" });
    }

    // Get quiz with correct answers
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          include: {
            explanation: true,
          },
        },
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const results = answers.map(
      (answer: { questionId: string; userAnswer: string }) => {
        const question = quiz.questions.find((q) => q.id === answer.questionId);
        if (!question) {
          return {
            questionId: answer.questionId,
            error: "Question not found",
          };
        }

        const isCorrect =
          question.correct?.toLowerCase().trim() ===
          answer.userAnswer.toLowerCase().trim();

        prisma.answer
          .create({
            data: {
              questionId: answer.questionId,
              userId,
              userAnswer: answer.userAnswer,
              isCorrect,
            },
          })
          .catch((err) => console.error("Error saving answer:", err));

        return {
          questionId: question.id,
          questionText: question.text,
          userAnswer: answer.userAnswer,
          correctAnswer: question.correct,
          isCorrect,
          explanation: question.explanation?.content || null,
        };
      },
    );

    const correctCount = results.filter((r: any) => r.isCorrect).length;
    const totalQuestions = quiz.questions.length;
    const score = (correctCount / totalQuestions) * 100;

    await prisma.quiz.update({
      where: { id: quizId },
      data: { status: QuizStatus.COMPLETED },
    });

    return res.json({
      quizId: quiz.id,
      quizTitle: quiz.title,
      score: Math.round(score * 100) / 100, 
      correctCount,
      totalQuestions,
      results,
    });
  } catch (error: any) {
    console.error("Submit answers error:", error);
    return res
      .status(500)
      .json({ error: "Failed to submit answers", message: error.message });
  }
};
