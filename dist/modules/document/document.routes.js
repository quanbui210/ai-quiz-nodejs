"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const document_controller_1 = require("./document.controller");
const document_quiz_controller_1 = require("./document-quiz.controller");
const document_chat_controller_1 = require("./document-chat.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const limit_check_middleware_1 = require("../../middleware/limit-check.middleware");
const router = (0, express_1.Router)();
const storage = multer_1.default.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path_1.default.join(
      require("os").tmpdir(),
      "document-uploads",
    );
    require("fs").mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path_1.default.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});
const fileFilter = (req, file, cb) => {
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
    cb(
      new Error(
        "Invalid file type. Only PDF, Word, and text files are allowed.",
      ),
    );
  }
};
const upload = (0, multer_1.default)({
  storage,
  fileFilter,
  limits: {
    fileSize: 40 * 1024 * 1024,
  },
});
router.post(
  "/upload",
  auth_middleware_1.authenticate,
  limit_check_middleware_1.checkDocumentLimit,
  upload.single("file"),
  document_controller_1.uploadDocument,
);
router.get(
  "/",
  auth_middleware_1.authenticate,
  document_controller_1.listDocuments,
);
router.get(
  "/:documentId/quizzes",
  auth_middleware_1.authenticate,
  document_quiz_controller_1.getDocumentQuizzes,
);
router.get(
  "/:documentId/chats",
  auth_middleware_1.authenticate,
  document_chat_controller_1.getDocumentChatSessions,
);
router.post(
  "/:documentId/quiz",
  auth_middleware_1.authenticate,
  document_quiz_controller_1.generateQuizFromDocument,
);
router.get(
  "/:id",
  auth_middleware_1.authenticate,
  document_controller_1.getDocument,
);
router.delete(
  "/:id",
  auth_middleware_1.authenticate,
  document_controller_1.deleteDocument,
);
exports.default = router;
//# sourceMappingURL=document.routes.js.map
