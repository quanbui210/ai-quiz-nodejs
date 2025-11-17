import { Router } from "express";
import multer from "multer";
import path from "path";
import {
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
} from "./document.controller";
import { generateQuizFromDocument, getDocumentQuizzes } from "./document-quiz.controller";
import { getDocumentChatSessions } from "./document-chat.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { checkDocumentLimit } from "../../middleware/limit-check.middleware";

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(require("os").tmpdir(), "document-uploads");
    require("fs").mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF, Word, and text files are allowed."));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 40 * 1024 * 1024, // 20MB limit (increased from 10MB)
  },
});

router.post(
  "/upload",
  authenticate,
  checkDocumentLimit,
  upload.single("file"),
  uploadDocument,
);

router.get("/", authenticate, listDocuments);

router.get("/:documentId/quizzes", authenticate, getDocumentQuizzes);
router.get("/:documentId/chats", authenticate, getDocumentChatSessions);
router.post("/:documentId/quiz", authenticate, generateQuizFromDocument);

router.get("/:id", authenticate, getDocument);
router.delete("/:id", authenticate, deleteDocument);

export default router;

