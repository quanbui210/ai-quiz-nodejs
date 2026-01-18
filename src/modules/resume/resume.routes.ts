import { Router } from "express";
import multer from "multer";
import path from "path";
import {
  analyzeResumeManually,
  getResumePreview,
  deleteResume,
  getResume,
  listResumes,
  uploadResume,
  getAtsHygieneReport,
} from "./resume.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { checkResumeLimit } from "../../middleware/limit-check.middleware";

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(require("os").tmpdir(), "resume-uploads");
    require("fs").mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "resume-" + uniqueSuffix + ext);
  },
});

const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only PDF and Word documents are allowed for resumes.",
      ),
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

router.post("/upload", authenticate, checkResumeLimit, upload.single("file"), uploadResume);
router.get("/", authenticate, listResumes);
router.get("/:resumeId/preview", authenticate, getResumePreview);
router.get("/:resumeId/ats-hygiene", authenticate, getAtsHygieneReport);
router.post("/:resumeId/analyze", authenticate, analyzeResumeManually);
router.get("/:resumeId", authenticate, getResume);
router.delete("/:resumeId", authenticate, deleteResume);

export default router;

