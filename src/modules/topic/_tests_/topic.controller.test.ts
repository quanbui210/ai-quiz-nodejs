import { Request, Response } from "express";
import { createTopic, suggestTopic, validateTopic } from "../topic.controller";

jest.mock("../../../utils/prisma", () => ({
  __esModule: true,
  default: {
    topic: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));
