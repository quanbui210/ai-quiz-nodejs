import OpenAI from "openai";
import { Request, Response } from "express";
import prisma from "../../utils/prisma";
import {
  QuizType,
  Difficulty,
  QuestionType,
  QuizStatus,
  AttemptStatus,
  Quiz,
  Question,
  Prisma,
} from "@prisma/client";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const listQuizzes = async (req: Request & { user?: any }, res: Response) => {
  const { topicId } = req.params;
  if (!topicId || typeof topicId !== "string") {
    return res.status(400).json({ error: "topicId is required" });
  }
  try {
    const quizzes = await prisma.quiz.findMany({
      where: { topicId },
    });
    return res.json({ quizzes });
  }
  catch (error: any) {
    console.error("Prisma error:", error);
    return res.status(500).json({ error: "Failed to list quizzes" });
  }
};

export const suggestQuizTopic = async (req: Request, res: Response) => {
  try {
    const { userTopic } = req.body;

    if (
      !userTopic ||
      typeof userTopic !== "string" ||
      userTopic.trim().length === 0
    ) {
      return res.status(400).json({
        error: "userTopic is required and must be a non-empty string",
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ error: "OpenAI API key is not configured" });
    }

    const response = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      temperature: 0.7, 
      messages: [
        {
          role: "system",
          content: `
            You are a quiz topic suggestion assistant. Your task is to suggest 3 specific quiz topics 
            that are suitable for creating practice quizzes and study materials.
            
            Focus on topics that:
            - Are good for quiz questions and practice tests
            - Cover specific concepts, rules, or knowledge areas to study
            - Are suitable for theory practice and self-assessment
            - Help users practice and test their understanding
            
            Examples:
            - Input: "driving license" → Output: "Traffic Signs and Signals", "Road Rules and Regulations", "Vehicle Safety and Maintenance"
            - Input: "math" → Output: "Algebra Basics", "Geometry Fundamentals", "Calculus Derivatives"
            - Input: "history" → Output: "World War II Events", "Ancient Civilizations", "Renaissance Period"
            
            Return ONLY the 3 topic names, one per line, without numbering, bullets, or explanations.
            Make them concise, specific, and quiz-friendly.
          `,
        },
        {
          role: "user",
          content: `Suggest 3 quiz topics for practice and study related to: "${userTopic.trim()}"`,
        },
      ],
    });

    const topicContent = response.choices[0]?.message?.content;
    if (!topicContent) {
      return res.status(400).json({ error: "No topic suggested" });
    }

    const topics = topicContent
      .split("\n")
      .map((line) => {
        let cleaned = line.replace(/^\d+\.\s*/, "");
        cleaned = cleaned.replace(/^[-*•]\s*/, "");
        return cleaned.trim();
      })
      .filter((topic) => topic.length > 0)
      .slice(0, 3);

    if (topics.length === 0) {
      return res.status(400).json({ error: "No valid topics" });
    }
    return res.json({ topics });
  } catch (error: any) {
    console.error("OpenAI API error:", error);
    if (error.status === 429) {
      return res.status(429).json({
        error: "OpenAI API quota exceeded. Please check your billing.",
      });
    }
    if (error.status === 401) {
      return res.status(500).json({
        error: "OpenAI API key is invalid",
      });
    }
    return res.status(500).json({ error: "Failed to suggest quiz topics" });
  }
};


export const validateQuizTopic = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "name is required and must be a non-empty string" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OpenAI API key is not configured" });
    }

    const response = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `
          You are a quiz topic validation assistant. Your task is to validate if the quiz topic name is specific enough for generating quiz questions.
          
          Return true if the topic is specific and suitable for quiz questions and study materials, otherwise return false and provide a reason why the topic is not valid. Also provide a suggestion for a valid topic.

          Rules:
          - Topics must be specific (e.g., "JavaScript Closures" not just "JavaScript")
          - Topics must be suitable for creating multiple quiz questions
          - Single words like "code", "exam", "drive", "test" are too general - return false
          - Nonsense words or characters - return false
          - Topics that are too broad (e.g., "coding", "math", "history") - return false, suggest specific subtopics
          - Topics that are not suitable for quiz questions - return false
          
          Examples:
          - "JavaScript" → false, suggest "JavaScript Closures" or "JavaScript Promises"
          - "driving" → false, suggest "Traffic Signs and Signals" or "Road Safety Rules"
          - "JavaScript Closures" → true
          - "Traffic Signs and Signals" → true
          `,
        },
        {
          role: "user",
          content: `Validate the quiz topic: "${name}"`,
        },
      ],
    });

    const topicContent = response.choices[0]?.message?.content;
    if (!topicContent) {
      return res.status(400).json({ error: "No validation response" });
    }

    const isValid = topicContent.toLowerCase().includes("true");
    if (!isValid) {
      return res.status(400).json({ 
        error: topicContent,
        isValid: false 
      });
    }

    return res.json({ 
      isValid: true, 
      message: "Topic is valid for quiz generation" 
    });
  } catch (error: any) {
    console.error("OpenAI API error:", error);
    if (error.status === 429) {
      return res.status(429).json({
        error: "OpenAI API quota exceeded. Please check your billing.",
      });
    }
    if (error.status === 401) {
      return res.status(500).json({
        error: "OpenAI API key is invalid",
      });
    }
    return res.status(500).json({ error: "Failed to validate quiz topic" });
  }
};

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
    const titleMatch = quizText.match(/^###\s*(.+?)(?:\n|$)/);
    const title = titleMatch ? titleMatch[1]?.trim() : "Untitled Quiz";

    const difficultyMatch = quizText.match(
      /-?\s*Difficulty:\s*(BEGINNER|INTERMEDIATE|ADVANCED)/i,
    );
    const difficulty =
      (difficultyMatch?.[1]?.toUpperCase() as Difficulty) ||
      Difficulty.INTERMEDIATE;

    const topicMatch = quizText.match(/-?\s*Topic:\s*(.+?)(?:\n|$)/i);
    const topic = topicMatch ? topicMatch[1]?.trim() : "";

    const questionBlocks = quizText.match(
      /###\s+Question\s+\d+[\s\S]*?(?=###\s+Question\s+\d+|$)/g,
    );

    if (!questionBlocks || questionBlocks.length === 0) {
      console.error("No questions found in quiz response");
      return null;
    }

    const OPTIONS_PER_QUESTION = 4;
    const questions = questionBlocks
      .map((block, index) => {
        const questionHeaderMatch = block.match(/###\s+Question\s+\d+\s*\n/);
        if (!questionHeaderMatch) {
          console.warn(`Question ${index + 1} has no header. Skipping.`);
          return null;
        }

        const questionTextMatch = block.match(/###\s+Question\s+\d+\s*\n(.+?)(?=\n[A-D]\))/s);
        const questionText = questionTextMatch ? questionTextMatch[1]?.trim() : "";

        if (!questionText) {
          console.warn(`Question ${index + 1} has no text. Skipping.`);
          return null;
        }

        const optionMatches = Array.from(block.matchAll(/^([A-D])\)\s*(.+?)(?=\n[A-D]\)|\n\n|✅|Explanation:|$)/gm));
        const options: string[] = [];
        const optionMap: { [key: string]: string } = {};

        for (const match of optionMatches) {
          const letter = match[1];
          const optionText = match[2]?.trim() || "";
          
          if (letter && optionText) {
            options.push(optionText);
            optionMap[letter] = optionText;
          }
        }

        if (options.length < OPTIONS_PER_QUESTION) {
          console.warn(
            `Question ${index + 1} has only ${options.length} options (expected ${OPTIONS_PER_QUESTION}). Skipping this question.`,
          );
          return null;
        }

        const validOptions = options
          .slice(0, OPTIONS_PER_QUESTION)
          .map(opt => opt.trim())
          .filter(opt => opt.length > 0);

        if (validOptions.length < OPTIONS_PER_QUESTION) {
          console.warn(
            `Question ${index + 1} has ${validOptions.length} valid options (expected ${OPTIONS_PER_QUESTION}). Skipping this question.`,
          );
          return null;
        }

        const correctAnswerMatch = block.match(/✅\s*Correct answer:\s*([A-D])\)\s*(.+?)(?=\n|$)/);
        let correctAnswer = "";
        
        if (correctAnswerMatch && correctAnswerMatch[1]) {
          const answerLetter = correctAnswerMatch[1];
          const answerText = correctAnswerMatch[2]?.trim();
          
          if (answerLetter && optionMap[answerLetter]) {
            correctAnswer = optionMap[answerLetter];
          } else if (answerText) {
            correctAnswer = answerText;
          }
        }

        if (!correctAnswer) {
          console.warn(
            `Question ${index + 1} has no correct answer marked. Skipping this question.`,
          );
          return null;
        }

        const explanationMatch = block.match(/Explanation:\s*(.+?)(?=\n\n|###|$)/s);
        const explanation = explanationMatch ? explanationMatch[1]?.trim() : "";

        const normalizedCorrect = correctAnswer.trim().replace(/\s+/g, " ");

        const correctMatchesOption = validOptions.some(
          (opt) =>
            opt.toLowerCase().trim() === normalizedCorrect.toLowerCase().trim() ||
            opt.toLowerCase().trim().includes(normalizedCorrect.toLowerCase().trim()) ||
            normalizedCorrect.toLowerCase().trim().includes(opt.toLowerCase().trim())
        );

        if (!correctMatchesOption) {
          console.warn(
            `Question ${index + 1}: Correct answer "${normalizedCorrect}" doesn't match any option. Options: ${validOptions.join(", ")}`
          );
        }

        return {
          text: questionText,
          type: QuestionType.MULTIPLE_CHOICE,
          options: validOptions,
          correct: normalizedCorrect,
          explanation: explanation && explanation.length > 0 ? explanation : undefined,
        };
      })
      .filter((q): q is NonNullable<typeof q> =>
        q !== null &&
        q.text.length > 0 &&
        q.options.length === OPTIONS_PER_QUESTION &&
        q.correct.length > 0
      );

    if (questions.length === 0) {
      console.error("No valid questions parsed from quiz response");
      return null;
    }

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

export const createQuiz = async (req: Request & { user?: any }, res: Response) => {
  try {
    const {
      title,
      difficulty,
      questionCount,
      quizType,
      timer,
      topicId,
      topic
    } = req.body;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res
        .status(400)
        .json({ error: "title is required and must be a non-empty string" });
    }
    if (!difficulty || !Object.values(Difficulty).includes(difficulty)) {
      return res.status(400).json({
        error:
          "difficulty is required and must be BEGINNER, INTERMEDIATE, or ADVANCED",
      });
    }
    if (
      !questionCount ||
      typeof questionCount !== "number" ||
      questionCount <= 0
    ) {
      return res.status(400).json({
        error: "questionCount is required and must be a positive number",
      });
    }
    if (!topicId || typeof topicId !== "string") {
      return res.status(400).json({ error: "topicId is required" });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ error: "OpenAI API key is not configured" });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4-turbo", 
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `You are a quiz generation assistant. You MUST follow this EXACT format for every question. No variations allowed.

          CRITICAL FORMAT REQUIREMENTS - FOLLOW EXACTLY:

          For each question, use this EXACT structure:

          ### Question [NUMBER]
          [Question text here]

          A) [First option text]
          B) [Second option text]
          C) [Third option text]
          D) [Fourth option text]
          ✅ Correct answer: [LETTER]) [EXACT OPTION TEXT FROM ABOVE]

          Explanation: [Explanation text here]

          EXAMPLE (copy this structure exactly):

          ### Question 1
          What is 2 + 2?

          A) 3
          B) 4
          C) 5
          D) 6
          ✅ Correct answer: B) 4

          Explanation: 2 + 2 equals 4, which is basic arithmetic.

          ### Question 2
          What is the capital of France?

          A) London
          B) Berlin
          C) Paris
          D) Madrid
          ✅ Correct answer: C) Paris

          Explanation: Paris is the capital and largest city of France.

          STRICT RULES - VIOLATIONS WILL CAUSE ERRORS:
          1. Each question MUST start with "### Question [NUMBER]" (use ###, not **)
          2. Question text MUST be on the line immediately after the header
          3. You MUST have exactly 4 options: A), B), C), D) - NO MORE, NO LESS
          4. Each option MUST be on its own line starting with the letter and )
          5. The correct answer line MUST be: "✅ Correct answer: [LETTER]) [EXACT TEXT]" where [LETTER] is A, B, C, or D
          6. The correct answer text MUST match EXACTLY one of the option texts above (case-sensitive, word-for-word)
          7. The explanation MUST start with "Explanation: " (not "**Explanation:**" or "*Explanation*")
          8. Leave a blank line between each question block
          9. Do NOT add any title, header, or extra text before Question 1
          10. Do NOT add any closing text after the last question

          IMPORTANT: The correct answer format is "✅ Correct answer: B) 4" where "B" is the letter and "4" is the EXACT text from option B above.`,
        },
        {
          role: "user",
          content: `Create exactly ${questionCount} ${difficulty} level multiple-choice questions about "${title}" of topic "${topic}". Follow the format EXACTLY as shown in the example. Start with "### Question 1" and end with the explanation for Question ${questionCount}.`,
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

    if (parsedQuiz.questions.length < questionCount) {
      console.warn(
        `Expected ${questionCount} questions but only ${parsedQuiz.questions.length} passed validation. Some questions were missing required options.`
      );
    }

    const explanationCount = parsedQuiz.questions.filter(q => q.explanation && q.explanation.length > 0).length;
    if (explanationCount < parsedQuiz.questions.length) {
      return res.status(400).json({
        error: "Quiz validation failed",
        message: `The AI did not provide explanations for all questions. Expected ${parsedQuiz.questions.length} explanations but only got ${explanationCount}. Please try generating the quiz again.`,
        expectedExplanations: parsedQuiz.questions.length,
        actualExplanations: explanationCount,
      });
    }

    const invalidQuestions = parsedQuiz.questions.filter(
      (q) => q.options.length !== 4 || q.options.some(opt => !opt || opt.trim().length === 0)
    );

    if (invalidQuestions.length > 0) {
      console.error(`Found ${invalidQuestions.length} questions with invalid options. Questions must have exactly 4 non-empty options.`);
      return res.status(400).json({
        error: "Quiz validation failed",
        message: `Some questions are missing options. Each question must have exactly 4 options. Please try generating the quiz again.`,
        invalidQuestionsCount: invalidQuestions.length,
      });
    }

    const questionsWithInvalidAnswers = parsedQuiz.questions
      .map((q, index) => {
        const normalizedOptions = q.options.map(opt => opt.trim().toLowerCase().replace(/\s+/g, ' '));
        const normalizedCorrect = q.correct.trim().toLowerCase().replace(/\s+/g, ' ');
        
        const exactMatch = normalizedOptions.includes(normalizedCorrect);
        
        const partialMatch = normalizedOptions.some(opt => 
          opt.includes(normalizedCorrect) || normalizedCorrect.includes(opt)
        );
        
        if (!exactMatch && !partialMatch) {
          return {
            questionIndex: index + 1,
            questionText: q.text,
            correctAnswer: q.correct,
            options: q.options,
            normalizedCorrect,
            normalizedOptions,
          };
        }
        
        if (!exactMatch && partialMatch) {
          const matchedOption = q.options.find(opt => 
            opt.trim().toLowerCase().replace(/\s+/g, ' ').includes(normalizedCorrect) ||
            normalizedCorrect.includes(opt.trim().toLowerCase().replace(/\s+/g, ' '))
          );
          if (matchedOption) {
            q.correct = matchedOption.trim();
          }
        }
        
        return null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (questionsWithInvalidAnswers.length > 0) {
      console.error(`Found ${questionsWithInvalidAnswers.length} questions where correct answer doesn't match any option.`);
      console.error('Invalid questions:', JSON.stringify(questionsWithInvalidAnswers, null, 2));
      return res.status(400).json({
        error: "Quiz validation failed",
        message: `Some questions have correct answers that don't match any of the provided options. Please try generating the quiz again.`,
        invalidAnswersCount: questionsWithInvalidAnswers.length,
        details: questionsWithInvalidAnswers.map(q => ({
          question: q.questionText.substring(0, 50) + '...',
          correctAnswer: q.correctAnswer,
          options: q.options,
        })),
      });
    }

    const quiz = await prisma.quiz.create({
      data: {
        title: title.trim(),
        type: (quizType as QuizType) || QuizType.MULTIPLE_CHOICE,
        difficulty: parsedQuiz.difficulty,
        count: parsedQuiz.questions.length,
        timer: timer !== undefined && timer !== null && timer > 0 ? Number(timer) : null,
        status: QuizStatus.PENDING,
        topicId,
        userId: req.user.id,
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


export const getQuiz = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const quiz = await prisma.quiz.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        type: true,
        difficulty: true,
        createdAt: true,
        expiresAt: true,
        timer: true,
        status: true,
        count: true,
        topicId: true,
        userId: true,
        topic: {
          select: {
            id: true,
            name: true,
            description: true,
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
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    return res.json({ quiz });
  } catch (error: any) {
    console.error("Get quiz error:", error);
    return res
      .status(500)
      .json({ error: "Failed to get quiz", message: error.message });
  }
};


export const submitAnswers = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { quizId } = req.params;
    const { answers, timeSpent, attemptId } = req.body;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: "answers array is required" });
    }

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

    const correctCount = results.filter((r: any) => r.isCorrect && !r.error).length;
    const totalQuestions = quiz.questions.length;
    const score = (correctCount / totalQuestions) * 100;

    // If attemptId is provided, update existing attempt (resuming paused quiz)
    // Otherwise, create a new attempt
    let attempt;
    if (attemptId) {
      // Verify the attempt belongs to the user and is in progress/paused
      const existingAttempt = await prisma.quizAttempt.findFirst({
        where: {
          id: attemptId,
          quizId: quiz.id,
          userId: req.user.id,
          status: {
            in: [AttemptStatus.IN_PROGRESS, AttemptStatus.PAUSED],
          },
        },
      });

      if (!existingAttempt) {
        return res.status(404).json({
          error: "Attempt not found or already completed",
        });
      }

      // Delete old answers
      await prisma.answer.deleteMany({
        where: {
          attemptId: attemptId,
        },
      });

      // Update attempt with final answers and mark as completed
      attempt = await prisma.quizAttempt.update({
        where: { id: attemptId },
        data: {
          status: AttemptStatus.COMPLETED,
          score: Math.round(score * 100) / 100,
          correctCount,
          totalQuestions,
          timeSpent: timeSpent ? Number(timeSpent) : null,
          elapsedTime: null, // Clear elapsed time on completion
          completedAt: new Date(),
          pausedAt: null,
          answers: {
            create: answers.map((answer: { questionId: string; userAnswer: string }) => {
              const question = quiz.questions.find((q) => q.id === answer.questionId);
              const isCorrect =
                question?.correct?.toLowerCase().trim() ===
                answer.userAnswer.toLowerCase().trim();

              return {
                questionId: answer.questionId,
                userId: req.user.id,
                userAnswer: answer.userAnswer,
                isCorrect: isCorrect || false,
              };
            }),
          },
        },
        include: {
          answers: {
            include: {
              question: {
                include: {
                  explanation: true,
                },
              },
            },
          },
        },
      });
    } else {
      // Create new attempt
      attempt = await prisma.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: req.user.id,
          status: AttemptStatus.COMPLETED,
          score: Math.round(score * 100) / 100,
          correctCount,
          totalQuestions,
          timeSpent: timeSpent ? Number(timeSpent) : null,
          completedAt: new Date(),
          answers: {
            create: answers.map((answer: { questionId: string; userAnswer: string }) => {
              const question = quiz.questions.find((q) => q.id === answer.questionId);
              const isCorrect =
                question?.correct?.toLowerCase().trim() ===
                answer.userAnswer.toLowerCase().trim();

              return {
                questionId: answer.questionId,
                userId: req.user.id,
                userAnswer: answer.userAnswer,
                isCorrect: isCorrect || false,
              };
            }),
          },
        },
        include: {
          answers: {
            include: {
              question: {
                include: {
                  explanation: true,
                },
              },
            },
          },
        },
      });
    }

-    await prisma.quiz.update({
      where: { id: quizId },
      data: { status: QuizStatus.COMPLETED },
    });

    return res.json({
      attemptId: attempt.id,
      quizId: quiz.id,
      quizTitle: quiz.title,
      score: attempt.score,
      correctCount: attempt.correctCount,
      totalQuestions: attempt.totalQuestions,
      timeSpent: attempt.timeSpent,
      completedAt: attempt.completedAt,
      results: results.filter((r: any) => !r.error),
    });
  } catch (error: any) {
    console.error("Submit answers error:", error);
    return res
      .status(500)
      .json({ error: "Failed to submit answers", message: error.message });
  }
};

// Pause a quiz attempt - save current progress
export const pauseQuiz = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { quizId } = req.params;
    const { answers, elapsedTime } = req.body;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: "answers array is required" });
    }

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: true,
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    // Check if there's an existing in-progress or paused attempt
    const existingAttempt = await prisma.quizAttempt.findFirst({
      where: {
        quizId: quiz.id,
        userId: req.user.id,
        status: {
          in: [AttemptStatus.IN_PROGRESS, AttemptStatus.PAUSED],
        },
      },
      include: {
        answers: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Delete existing answers for this attempt if resuming
    if (existingAttempt) {
      await prisma.answer.deleteMany({
        where: {
          attemptId: existingAttempt.id,
        },
      });
    }

    // Create or update the attempt
    const attempt = existingAttempt
      ? await prisma.quizAttempt.update({
          where: { id: existingAttempt.id },
          data: {
            status: AttemptStatus.PAUSED,
            pausedAt: new Date(),
            elapsedTime: elapsedTime ? Number(elapsedTime) : null,
            totalQuestions: quiz.questions.length,
            answers: {
              create: answers.map((answer: { questionId: string; userAnswer: string }) => ({
                questionId: answer.questionId,
                userId: req.user.id,
                userAnswer: answer.userAnswer,
                isCorrect: false, // Will be calculated on completion
              })),
            },
          },
          include: {
            answers: {
              include: {
                question: {
                  select: {
                    id: true,
                    text: true,
                  },
                },
              },
            },
          },
        })
      : await prisma.quizAttempt.create({
          data: {
            quizId: quiz.id,
            userId: req.user.id,
            status: AttemptStatus.PAUSED,
            pausedAt: new Date(),
            elapsedTime: elapsedTime ? Number(elapsedTime) : null,
            totalQuestions: quiz.questions.length,
            answers: {
              create: answers.map((answer: { questionId: string; userAnswer: string }) => ({
                questionId: answer.questionId,
                userId: req.user.id,
                userAnswer: answer.userAnswer,
                isCorrect: false, 
              })),
            },
          },
          include: {
            answers: {
              include: {
                question: {
                  select: {
                    id: true,
                    text: true,
                  },
                },
              },
            },
          },
        });

    return res.json({
      message: "Quiz paused successfully",
      attemptId: attempt.id,
      quizId: quiz.id,
      status: attempt.status,
      pausedAt: attempt.pausedAt,
      elapsedTime: attempt.elapsedTime,
      answeredQuestions: attempt.answers.length,
      totalQuestions: attempt.totalQuestions,
      savedAnswers: attempt.answers.map((a) => ({
        questionId: a.questionId,
        questionText: a.question.text,
        userAnswer: a.userAnswer,
      })),
    });
  } catch (error: any) {
    console.error("Pause quiz error:", error);
    return res
      .status(500)
      .json({ error: "Failed to pause quiz", message: error.message });
  }
};

// Resume a paused quiz attempt
export const resumeQuiz = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { quizId } = req.params;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
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

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    // Find the most recent paused or in-progress attempt
    const attempt = await prisma.quizAttempt.findFirst({
      where: {
        quizId: quiz.id,
        userId: req.user.id,
        status: {
          in: [AttemptStatus.IN_PROGRESS, AttemptStatus.PAUSED],
        },
      },
      include: {
        answers: {
          include: {
            question: {
              select: {
                id: true,
                text: true,
                type: true,
                options: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!attempt) {
      return res.status(404).json({
        error: "No paused attempt found for this quiz",
        message: "Start a new quiz attempt",
      });
    }

    // Update status to IN_PROGRESS if it was PAUSED
    if (attempt.status === AttemptStatus.PAUSED) {
      await prisma.quizAttempt.update({
        where: { id: attempt.id },
        data: {
          status: AttemptStatus.IN_PROGRESS,
          pausedAt: null,
        },
      });
    }

    // Map saved answers by questionId for easy lookup
    const savedAnswersMap = new Map(
      attempt.answers.map((a) => [a.questionId, a.userAnswer])
    );

    // Return quiz with saved answers
    return res.json({
      attemptId: attempt.id,
      quizId: quiz.id,
      quizTitle: quiz.title,
      status: AttemptStatus.IN_PROGRESS,
      elapsedTime: attempt.elapsedTime,
      totalQuestions: attempt.totalQuestions,
      answeredQuestions: attempt.answers.length,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        options: q.options,
        savedAnswer: savedAnswersMap.get(q.id) || null,
      })),
    });
  } catch (error: any) {
    console.error("Resume quiz error:", error);
    return res
      .status(500)
      .json({ error: "Failed to resume quiz", message: error.message });
  }
};

export const deleteQuiz = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Quiz ID is required" });
    }

    const quiz = await prisma.quiz.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        title: true,
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    if (quiz.userId !== req.user.id) {
      return res.status(403).json({ error: "You don't have permission to delete this quiz" });
    }

    const questions = await prisma.question.findMany({
      where: { quizId: id },
      select: { id: true },
    });
    const questionIds = questions.map((q) => q.id);

    const attempts = await prisma.quizAttempt.findMany({
      where: { quizId: id },
      select: { id: true },
    });
    const attemptIds = attempts.map((a) => a.id);

    await prisma.$transaction([
      prisma.answer.deleteMany({
        where: {
          attemptId: {
            in: attemptIds,
          },
        },
      }),
      prisma.quizAttempt.deleteMany({
        where: {
          quizId: id,
        },
      }),
      prisma.answer.deleteMany({
        where: {
          questionId: {
            in: questionIds,
          },
        },
      }),
      prisma.explanation.deleteMany({
        where: {
          questionId: {
            in: questionIds,
          },
        },
      }),
      prisma.question.deleteMany({
        where: {
          quizId: id,
        },
      }),
      prisma.quiz.delete({
        where: { id },
      }),
    ]);

    return res.json({
      message: "Quiz deleted successfully",
      deletedQuizId: id,
      deletedQuizTitle: quiz.title,
    });
  } catch (error: any) {
    console.error("Delete quiz error:", error);
    return res
      .status(500)
      .json({ error: "Failed to delete quiz", message: error.message });
  }
};

