import { Request, Response, NextFunction } from "express";
import { getUserSubscription, getUserUsage } from "../utils/usage";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  file?: Express.Multer.File;
}


export const checkTopicLimit = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const subscription = await getUserSubscription(req.user.id);
    if (!subscription) {
      return res.status(403).json({
        error: "No subscription found",
        message: "Please contact support",
      });
    }

    const usage = await getUserUsage(req.user.id);

    if (usage.topicsCount >= subscription.maxTopics) {
      return res.status(403).json({
        error: "Topic limit exceeded",
        limit: subscription.maxTopics,
        current: usage.topicsCount,
        message: `You have reached your limit of ${subscription.maxTopics} topics. Please upgrade your plan or contact support.`,
      });
    }

    return next();
  } catch (error: any) {
    console.error("Topic limit check error:", error);
    return res.status(500).json({ error: "Failed to check topic limit" });
  }
};


export const checkQuizLimit = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const subscription = await getUserSubscription(req.user.id);
    if (!subscription) {
      return res.status(403).json({
        error: "No subscription found",
        message: "Please contact support",
      });
    }

    const usage = await getUserUsage(req.user.id);

    if (usage.quizzesCount >= subscription.maxQuizzes) {
      return res.status(403).json({
        error: "Quiz limit exceeded",
        limit: subscription.maxQuizzes,
        current: usage.quizzesCount,
        message: `You have reached your limit of ${subscription.maxQuizzes} quizzes. Please upgrade your plan or contact support.`,
      });
    }

    return next();
  } catch (error: any) {
    console.error("Quiz limit check error:", error);
    return res.status(500).json({ error: "Failed to check quiz limit" });
  }
};


export const checkDocumentLimit = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const subscription = await getUserSubscription(req.user.id);
    if (!subscription) {
      return res.status(403).json({
        error: "No subscription found",
        message: "Please contact support",
      });
    }

    const usage = await getUserUsage(req.user.id);

    if (usage.documentsCount >= subscription.maxDocuments) {
      return res.status(403).json({
        error: "Document limit exceeded",
        limit: subscription.maxDocuments,
        current: usage.documentsCount,
        message: `You have reached your limit of ${subscription.maxDocuments} documents. Please upgrade your plan or contact support.`,
      });
    }

    return next();
  } catch (error: any) {
    console.error("Document limit check error:", error);
    return res.status(500).json({ error: "Failed to check document limit" });
  }
};


export const checkModelAccess = (model: string) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const subscription = await getUserSubscription(req.user.id);
      if (!subscription) {
        return res.status(403).json({
          error: "No subscription found",
          message: "Please contact support",
        });
      }

      if (!subscription.allowedModels.includes(model)) {
        return res.status(403).json({
          error: "Model not allowed",
          requestedModel: model,
          allowedModels: subscription.allowedModels,
          message: `Your plan does not allow using ${model}. Allowed models: ${subscription.allowedModels.join(", ")}`,
        });
      }

      return next();
    } catch (error: any) {
      console.error("Model access check error:", error);
      return res.status(500).json({ error: "Failed to check model access" });
    }
  };
};

export const validateModelFromBody = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const model = req.body.model || "gpt-3.5-turbo"; // Default model
    const subscription = await getUserSubscription(req.user.id);
    
    if (!subscription) {
      return res.status(403).json({
        error: "No subscription found",
        message: "Please contact support",
      });
    }

    if (!subscription.allowedModels.includes(model)) {
      return res.status(403).json({
        error: "Model not allowed",
        requestedModel: model,
        allowedModels: subscription.allowedModels,
        message: `Your plan does not allow using ${model}. Allowed models: ${subscription.allowedModels.join(", ")}`,
      });
    }

    req.body.validatedModel = model;
    return next();
  } catch (error: any) {
    console.error("Model validation error:", error);
    return res.status(500).json({ error: "Failed to validate model" });
  }
};

