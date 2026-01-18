import prisma from "../../utils/prisma";
import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";
import { calculateLengthCheck, type AtsHygieneReport } from "../jobs/job-matching.service";

type ParsingReadiness = "Excellent" | "Good" | "Warning" | "Critical";
type FileTypeRecommendation = "PDF" | "DOCX" | "Both acceptable";

const openai = observeOpenAI(
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
);

const DEFAULT_MODEL = process.env.OPENAI_JOB_MATCHING_MODEL || "gpt-4o-mini";

export async function getOrGenerateAtsHygieneReport(
  resumeId: string,
): Promise<{ report: AtsHygieneReport; cached: boolean }> {
  const resume = await (prisma as any).resume.findUnique({
    where: { id: resumeId },
    select: {
      id: true,
      parsedText: true,
      pageCount: true,
      yearsOfExperience: true,
      status: true,
      mimeType: true,
      atsHygieneReport: true,
      atsHygieneReportGeneratedAt: true,
      updatedAt: true,
    },
  });

  if (!resume) {
    throw new Error("Resume not found");
  }

  if (resume.status !== "READY") {
    throw new Error("Resume must be processed and ready");
  }

  if (!resume.parsedText) {
    throw new Error("Resume text not available");
  }

  const isCacheValid = checkCacheValidity(resume);

  if (isCacheValid && resume.atsHygieneReport) {
    return {
      report: resume.atsHygieneReport as AtsHygieneReport,
      cached: true,
    };
  }

  const report = await generateAtsHygieneReport({
    resumeText: resume.parsedText,
    pageCount: resume.pageCount || undefined,
    experienceYears: resume.yearsOfExperience || undefined,
    mimeType: resume.mimeType,
  });

  await (prisma as any).resume.update({
    where: { id: resumeId },
    data: {
      atsHygieneReport: report as any,
      atsHygieneReportGeneratedAt: new Date(),
    },
  });

  return {
    report,
    cached: false,
  };
}

function checkCacheValidity(resume: any): boolean {
  if (!resume.atsHygieneReport || !resume.atsHygieneReportGeneratedAt) {
    return false;
  }

  if (resume.status !== "READY") {
    return false;
  }

  if (resume.atsHygieneReportGeneratedAt < resume.updatedAt) {
    return false;
  }

  return true;
}

export async function generateAtsHygieneReport(params: {
  resumeText: string;
  pageCount?: number;
  experienceYears?: number;
  mimeType: string;
}): Promise<AtsHygieneReport> {
  const { resumeText, pageCount, experienceYears, mimeType } = params;

  const isPdf = mimeType === "application/pdf";
  const isDocx = mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                 mimeType === "application/msword";
  const currentFileType = isPdf ? "PDF" : isDocx ? "DOCX" : "Unknown";

  const preCalculatedLengthCheck = calculateLengthCheck(pageCount, experienceYears);

  const resumeExcerpt = resumeText.substring(0, 4000);

  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.3,
    max_tokens: 800,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an ATS (Applicant Tracking System) parsing expert. Analyze a resume for ATS compatibility and return a JSON report.

Your task is to identify:
1. Parsing risks: tables, images, two-column layouts, complex formatting
2. File type recommendation: PDF vs DOCX based on employer preferences
3. Formatting issues that break ATS parsers

IMPORTANT: The length check has been pre-calculated. Use the provided lengthCheck value in your response.

Return JSON with this EXACT structure:
{
  "parsingReadiness": "Excellent" | "Good" | "Warning" | "Critical",
  "warnings": ["warning 1", "warning 2"],
  "fileTypeRecommendation": "PDF" | "DOCX" | "Both acceptable",
  "formattingRisks": ["risk 1", "risk 2"]
}

PARSING READINESS GUIDELINES:
- "Excellent": Clean, simple formatting, standard sections, no tables/images
- "Good": Minor formatting quirks, but generally ATS-friendly
- "Warning": Some formatting that may cause parsing issues (tables, two-column layouts)
- "Critical": Major formatting issues that will likely break ATS parsing

FILE TYPE RECOMMENDATION:
The user uploaded a ${currentFileType} file. Your recommendation should be:
- If user uploaded PDF: Return "PDF" (they already have the optimal format)
- If user uploaded DOCX: Return "PDF" (recommend changing to PDF for better ATS compatibility)
- Always recommend PDF as it's the industry standard for ATS systems

CRITICAL: The current file type is ${currentFileType}. Use this information to make your recommendation.`,
      },
      {
        role: "user",
        content: `Analyze this resume for ATS compatibility:

PRE-CALCULATED LENGTH CHECK (use this exact value):
${pageCount !== undefined ? `The resume has ${pageCount} page${pageCount !== 1 ? 's' : ''}.` : 'Page count not available.'}
Length Check Status: ${preCalculatedLengthCheck.status}
Length Check Detail: ${preCalculatedLengthCheck.detail}

CURRENT FILE TYPE: ${currentFileType}

RESUME EXCERPT:
${resumeExcerpt}

Analyze the resume for:
1. Parsing risks (tables, images, two-column layouts, complex formatting)
2. File type recommendation (remember: if DOCX, recommend PDF; if PDF, confirm PDF is good)
3. Formatting issues that break ATS parsers

Return the JSON report with the pre-calculated lengthCheck included.`,
      },
    ],
  });

  const response = completion.choices[0]?.message?.content;
  if (!response) {
    throw new Error("No response from LLM");
  }

  try {
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const validReadiness: ParsingReadiness[] = ["Excellent", "Good", "Warning", "Critical"];
    const validFileTypes: FileTypeRecommendation[] = ["PDF", "DOCX", "Both acceptable"];

    let fileTypeRecommendation: FileTypeRecommendation = "PDF";
    
    if (validFileTypes.includes(parsed.fileTypeRecommendation)) {
      fileTypeRecommendation = parsed.fileTypeRecommendation;
    }
    
    if (isPdf) {
      fileTypeRecommendation = "PDF";
    } else if (isDocx) {
      fileTypeRecommendation = "PDF";
    }

    return {
      parsingReadiness: validReadiness.includes(parsed.parsingReadiness)
        ? parsed.parsingReadiness
        : "Good",
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.filter((w: any) => typeof w === "string")
        : [],
      lengthCheck: preCalculatedLengthCheck,
      fileTypeRecommendation,
      formattingRisks: Array.isArray(parsed.formattingRisks)
        ? parsed.formattingRisks.filter((r: any) => typeof r === "string")
        : undefined,
    };
  } catch (error) {
    console.error("[ATS Hygiene] Failed to parse LLM response:", error);
    console.error("[ATS Hygiene] Raw response:", response);
    throw new Error("Failed to parse ATS Hygiene Report");
  }
}

export async function invalidateAtsHygieneCache(resumeId: string): Promise<void> {
  await (prisma as any).resume.update({
    where: { id: resumeId },
    data: {
      atsHygieneReport: null,
      atsHygieneReportGeneratedAt: null,
    },
  });
}

