import { Request, Response } from "express";
import prisma from "../../utils/prisma";

export const listTopics = async (
  req: Request & { user?: any },
  res: Response,
) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const topics = await prisma.topic.findMany({
      where: { userId: req.user.id },
    });
    return res.json({ topics });
  } catch (error: any) {
    console.error("Prisma error:", error);
    return res.status(500).json({ error: "Failed to list topics" });
  }
};

export const getTopic = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const topic = await prisma.topic.findUnique({
      where: { id },
    });
    return res.json(topic);
  } catch (error: any) {
    console.error("Prisma error:", error);
    return res.status(500).json({ error: "Failed to get topic" });
  }
};

export const createTopic = async (
  req: Request & { user?: any },
  res: Response,
) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res
        .status(400)
        .json({ error: "name is required and must be a non-empty string" });
    }

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const topic = await prisma.topic.create({
      data: {
        name,
        userId: req.user.id,
      },
    });

    return res.status(201).json({ topic });
  } catch (error: any) {
    console.error("Create topic error:", error);
    return res.status(500).json({ error: "Failed to create topic" });
  }
};
