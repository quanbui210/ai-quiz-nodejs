import { Types } from "@prisma/client/runtime/library";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const createQuiz = async (req: Request, res: Response) => {
 
};