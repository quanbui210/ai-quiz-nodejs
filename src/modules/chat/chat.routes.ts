import { Router } from "express";
import multer from "multer";
import path from "path";
import {
  createChatSession,
  sendMessage,
  getChatSession,
  getChatMessages,
  listChatSessions,
  deleteChatSession,
  getAvailableModels,
  updateChatSessionModel,
  uploadChatImage,
} from "./chat.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

// Multer configuration for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(require("os").tmpdir(), "chat-image-uploads");
    require("fs").mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "chat-image-" + uniqueSuffix + ext);
  },
});

const imageFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.",
      ),
    );
  }
};

const imageUpload = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per image
    files: 10, // Maximum 10 images per upload (can be increased)
  },
});

router.get("/models", authenticate, getAvailableModels);

// Image upload endpoint (must be before session routes to avoid conflicts)
// Supports multiple images: accepts both "image" (singular) and "images" (plural) field names
// Use multer.fields to accept both field names for backward compatibility
router.post(
  "/images/upload",
  authenticate,
  imageUpload.fields([
    { name: "images", maxCount: 10 },
    { name: "image", maxCount: 10 },
  ]),
  uploadChatImage
);

router.post("/sessions", authenticate, createChatSession);
router.get("/sessions", authenticate, listChatSessions);
router.get("/sessions/:sessionId", authenticate, getChatSession);
router.put("/sessions/:sessionId/model", authenticate, updateChatSessionModel);
router.delete("/sessions/:sessionId", authenticate, deleteChatSession);

router.get("/sessions/:sessionId/messages", authenticate, getChatMessages);
router.post("/sessions/:sessionId/messages", authenticate, sendMessage);

export default router;
