"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const resume_controller_1 = require("./resume.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const tempDir = path_1.default.join(require("os").tmpdir(), "resume-uploads");
        require("fs").mkdirSync(tempDir, { recursive: true });
        cb(null, tempDir);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path_1.default.extname(file.originalname);
        cb(null, "resume-" + uniqueSuffix + ext);
    },
});
const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error("Invalid file type. Only PDF and Word documents are allowed for resumes."));
    }
};
const upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});
router.post("/upload", auth_middleware_1.authenticate, upload.single("file"), resume_controller_1.uploadResume);
router.get("/", auth_middleware_1.authenticate, resume_controller_1.listResumes);
router.get("/:resumeId/preview", auth_middleware_1.authenticate, resume_controller_1.getResumePreview);
router.post("/:resumeId/analyze", auth_middleware_1.authenticate, resume_controller_1.analyzeResumeManually);
router.get("/:resumeId", auth_middleware_1.authenticate, resume_controller_1.getResume);
router.delete("/:resumeId", auth_middleware_1.authenticate, resume_controller_1.deleteResume);
exports.default = router;
//# sourceMappingURL=resume.routes.js.map