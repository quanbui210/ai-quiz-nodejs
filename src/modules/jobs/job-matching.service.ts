import prisma from "../../utils/prisma";
import { generateEmbedding } from "../../utils/embeddings";
import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";

const openai = observeOpenAI(
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
);

const DEFAULT_MODEL = process.env.OPENAI_JOB_MATCHING_MODEL || "gpt-4o-mini";

type AtsShortlistDecision = "STRONG" | "MAYBE" | "WEAK";
type RequirementType = "MUST_HAVE" | "NICE_TO_HAVE" | "RESPONSIBILITY" | "DOMAIN" | "CONSTRAINT";
type RequirementStatus = "MET" | "PARTIAL" | "NOT_MET";
type MatchTier = "Tier 1: Reality Check" | "Tier 2: Optimizer" | "Tier 3: Interviewer";
type MatchLabel = "Low Compatibility" | "Moderate Match" | "Strong Match" | "Excellent Match";
type ImpactFactor = "HIGH" | "MEDIUM" | "LOW";
type KeywordImportance = "Critical" | "High" | "Medium" | "Low";
type ParsingReadiness = "Excellent" | "Good" | "Warning" | "Critical";
type LengthStatus = "Optimal" | "Too Short" | "Too Long";
type FileTypeRecommendation = "PDF" | "DOCX" | "Both acceptable";

interface AtsAssessment {
  matchScore: number;
  matchLabel: MatchLabel;
  executiveSummary: string; 
  hiringManagerVibe: string;
  tier: MatchTier;
  disclaimer?: string; 
}

interface AtsKeywordMatch {
  keyword: string;
  context: string; 
  status: "met" | "partial" | "not_met";
  evidenceQuotes?: string[]; 
}

interface AtsMissingKeyword {
  keyword: string;
  importance: KeywordImportance;
  recommendation: string; 
  whereToAdd: string; 
  impactIfAdded?: string; 
}

interface AtsKeywordGapAnalysis {
  criticalMatches: AtsKeywordMatch[];
  missingHighPriority: AtsMissingKeyword[];
  softSkillAlignment?: {
    found: string[];
    missing: string[];
  };
}

interface AtsContentOptimization {
  originalBullet: string; 
  suggestedBullet: string; 
  logic: string; 
  impactFactor: ImpactFactor;
  atsStrategy: string; 
  section: "EXPERIENCE" | "PROJECTS" | "SKILLS" | "SUMMARY";
  target: string; 
}

export interface AtsHygieneReport {
  parsingReadiness: ParsingReadiness;
  warnings: string[]; 
  lengthCheck: {
    status: LengthStatus;
    detail: string;
  };
  fileTypeRecommendation: FileTypeRecommendation;
  formattingRisks?: string[]; 
}

interface AtsStrategicAdvice {
  top3Strengths: string[]; 
  top3Gaps: string[]; 
  careerPivot?: string; 
  quickWins?: string[]; 
  polishSuggestions?: string[]; 
}

interface AtsRequirementMatrixItem {
  requirement: string;
  type: RequirementType;
  status: RequirementStatus;
  evidenceQuotes: string[];
  notes?: string;
}

interface AtsMatchDetails {
  assessment: AtsAssessment;
  keywordGapAnalysis: AtsKeywordGapAnalysis;
  contentOptimization: AtsContentOptimization[];
  atsHygieneReport: AtsHygieneReport;
  strategicAdvice: AtsStrategicAdvice;
  nextSteps: string[];
  requirementsMatrix: AtsRequirementMatrixItem[];
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, " ").trim();
}


export function calculateLengthCheck(
  pageCount?: number,
  experienceYears?: number,
): { status: LengthStatus; detail: string } {
  if (pageCount === undefined || pageCount === null) {
    return {
      status: "Optimal",
      detail: "Unable to determine page count. For most roles, 1-2 pages is optimal.",
    };
  }

  const experienceKnown = experienceYears !== undefined && experienceYears !== null;
  const years = experienceYears || 0;

  if (pageCount === 1) {
    if (experienceKnown && years <= 3) {
      return {
        status: "Optimal",
        detail: "1 page is ideal for a candidate with up to 3 years of experience.",
      };
    } else if (experienceKnown && years > 3) {
      return {
        status: "Too Short",
        detail: "1 page may be too short for a candidate with 4+ years of experience. Consider expanding to 2 pages to highlight your achievements.",
      };
    } else {
      return {
        status: "Optimal",
        detail: "1 page is ideal for early-career candidates (0-3 years). If you have 4+ years of experience, consider expanding to 2 pages to better showcase your achievements.",
      };
    }
  } else if (pageCount === 2) {
    if (experienceKnown && years <= 3) {
      return {
        status: "Optimal",
        detail: "2 pages is acceptable for a candidate with up to 3 years of experience, though 1 page is preferred for early-career roles.",
      };
    } else if (experienceKnown && years > 3 && years <= 10) {
      return {
        status: "Optimal",
        detail: "2 pages is ideal for a candidate with 4-10 years of experience.",
      };
    } else if (experienceKnown && years > 10) {
      return {
        status: "Optimal",
        detail: "2 pages is appropriate for a candidate with 10+ years of experience.",
      };
    } else {
      return {
        status: "Optimal",
        detail: "2 pages is ideal for most candidates. This length works well for candidates with 2-10 years of experience. For early-career (0-3 years), 1 page is preferred. For very experienced candidates (10+ years), 2 pages is still appropriate.",
      };
    }
  } else if (pageCount === 3) {
    if (experienceKnown && years < 10) {
      return {
        status: "Too Long",
        detail: "3 pages may be too long for a candidate with less than 10 years of experience. Most recruiters prefer 1-2 pages.",
      };
    } else if (experienceKnown && years >= 10) {
      return {
        status: "Optimal",
        detail: "3 pages is acceptable for a candidate with 10+ years of experience, though 2 pages is preferred by most recruiters.",
      };
    } else {
      return {
        status: "Too Long",
        detail: "3 pages may be too long for most roles. Most recruiters prefer 1-2 pages. For candidates with less than 10 years of experience, 3 pages is typically too long. Even for very experienced candidates (10+ years), 2 pages is usually preferred.",
      };
    }
  } else {
    return {
      status: "Too Long",
      detail: `${pageCount} pages is too long for most roles. Recruiters typically prefer 1-2 pages regardless of experience level. Consider condensing your resume to highlight only the most relevant achievements.`,
    };
  }
}

function validateAtsMatchDetails(ats: any): AtsMatchDetails | undefined {
  if (!ats || typeof ats !== "object") {
    console.warn("[Job Matching] validateAtsMatchDetails: ats is missing or invalid", { 
      hasAts: !!ats, 
      type: typeof ats,
      isObject: ats && typeof ats === "object"
    });
    return undefined;
  }

  const validTypes: RequirementType[] = ["MUST_HAVE", "NICE_TO_HAVE", "RESPONSIBILITY", "DOMAIN", "CONSTRAINT"];
  const validStatuses: RequirementStatus[] = ["MET", "PARTIAL", "NOT_MET"];
  const validTiers: MatchTier[] = ["Tier 1: Reality Check", "Tier 2: Optimizer", "Tier 3: Interviewer"];
  const validLabels: MatchLabel[] = ["Low Compatibility", "Moderate Match", "Strong Match", "Excellent Match"];
  const validImpactFactors: ImpactFactor[] = ["HIGH", "MEDIUM", "LOW"];
  const validImportance: KeywordImportance[] = ["Critical", "High", "Medium", "Low"];
  const validReadiness: ParsingReadiness[] = ["Excellent", "Good", "Warning", "Critical"];
  const validLengthStatus: LengthStatus[] = ["Optimal", "Too Short", "Too Long"];
  const validFileTypes: FileTypeRecommendation[] = ["PDF", "DOCX", "Both acceptable"];

  const assessment = ats.assessment && typeof ats.assessment === "object" ? {
    matchScore: typeof ats.assessment.matchScore === "number" 
      ? Math.max(0, Math.min(100, Math.round(ats.assessment.matchScore)))
      : 50,
    matchLabel: validLabels.includes(ats.assessment.matchLabel) 
      ? ats.assessment.matchLabel 
      : "Moderate Match",
    executiveSummary: typeof ats.assessment.executiveSummary === "string"
      ? ats.assessment.executiveSummary
      : "Match analysis available.",
    hiringManagerVibe: typeof ats.assessment.hiringManagerVibe === "string"
      ? ats.assessment.hiringManagerVibe
      : "Analysis in progress.",
    disclaimer: typeof ats.assessment.disclaimer === "string"
      ? ats.assessment.disclaimer
      : "This is an ATS Visibility Score. It predicts the likelihood that a recruiter's search query will find your resume. A high score does not guarantee an interview.",
    tier: validTiers.includes(ats.assessment.tier)
      ? ats.assessment.tier
      : "Tier 2: Optimizer",
  } : {
    matchScore: 50,
    matchLabel: "Moderate Match" as MatchLabel,
    executiveSummary: "Match analysis available.",
    hiringManagerVibe: "Analysis in progress.",
    tier: "Tier 2: Optimizer" as MatchTier,
    disclaimer: "This is an ATS Visibility Score. It predicts the likelihood that a recruiter's search query will find your resume. A high score does not guarantee an interview.",
  };

  const keywordGapAnalysis = ats.keywordGapAnalysis && typeof ats.keywordGapAnalysis === "object" ? {
    criticalMatches: Array.isArray(ats.keywordGapAnalysis.criticalMatches)
      ? ats.keywordGapAnalysis.criticalMatches
          .filter((item: any) => 
            item &&
            typeof item.keyword === "string" &&
            typeof item.context === "string" &&
            ["met", "partial", "not_met"].includes(item.status)
          )
          .map((item: any) => ({
            keyword: item.keyword,
            context: item.context,
            status: item.status as "met" | "partial" | "not_met",
            evidenceQuotes: Array.isArray(item.evidenceQuotes)
              ? item.evidenceQuotes.filter((q: any) => typeof q === "string").slice(0, 3)
              : [],
          }))
      : [],
    missingHighPriority: Array.isArray(ats.keywordGapAnalysis.missingHighPriority)
      ? ats.keywordGapAnalysis.missingHighPriority
          .filter((item: any) => 
            item &&
            typeof item.keyword === "string" &&
            validImportance.includes(item.importance) &&
            typeof item.recommendation === "string" &&
            typeof item.whereToAdd === "string"
          )
          .map((item: any) => ({
            keyword: item.keyword,
            importance: item.importance as KeywordImportance,
            recommendation: item.recommendation,
            whereToAdd: item.whereToAdd,
            impactIfAdded: typeof item.impactIfAdded === "string" ? item.impactIfAdded : undefined,
          }))
      : [],
    softSkillAlignment: ats.keywordGapAnalysis.softSkillAlignment && typeof ats.keywordGapAnalysis.softSkillAlignment === "object"
      ? {
          found: Array.isArray(ats.keywordGapAnalysis.softSkillAlignment.found)
            ? ats.keywordGapAnalysis.softSkillAlignment.found.filter((s: any) => typeof s === "string")
            : [],
          missing: Array.isArray(ats.keywordGapAnalysis.softSkillAlignment.missing)
            ? ats.keywordGapAnalysis.softSkillAlignment.missing.filter((s: any) => typeof s === "string")
            : [],
        }
      : undefined,
  } : {
    criticalMatches: [],
    missingHighPriority: [],
  };

  const contentOptimization = Array.isArray(ats.contentOptimization)
    ? ats.contentOptimization
        .filter((item: any) => 
          item &&
          typeof item.originalBullet === "string" &&
          typeof item.suggestedBullet === "string" &&
          typeof item.logic === "string" &&
          validImpactFactors.includes(item.impactFactor) &&
          typeof item.atsStrategy === "string" &&
          ["EXPERIENCE", "PROJECTS", "SKILLS", "SUMMARY"].includes(item.section) &&
          typeof item.target === "string"
        )
        .map((item: any) => ({
          originalBullet: item.originalBullet,
          suggestedBullet: item.suggestedBullet,
          logic: item.logic,
          impactFactor: item.impactFactor as ImpactFactor,
          atsStrategy: item.atsStrategy,
          section: item.section as "EXPERIENCE" | "PROJECTS" | "SKILLS" | "SUMMARY",
          target: item.target,
        }))
    : [];

  const atsHygieneReport = ats.atsHygieneReport && typeof ats.atsHygieneReport === "object" ? {
    parsingReadiness: validReadiness.includes(ats.atsHygieneReport.parsingReadiness)
      ? ats.atsHygieneReport.parsingReadiness
      : "Good",
    warnings: Array.isArray(ats.atsHygieneReport.warnings)
      ? ats.atsHygieneReport.warnings.filter((w: any) => typeof w === "string")
      : [],
    lengthCheck: ats.atsHygieneReport.lengthCheck && typeof ats.atsHygieneReport.lengthCheck === "object" ? {
      status: validLengthStatus.includes(ats.atsHygieneReport.lengthCheck.status)
        ? ats.atsHygieneReport.lengthCheck.status
        : "Optimal",
      detail: typeof ats.atsHygieneReport.lengthCheck.detail === "string"
        ? ats.atsHygieneReport.lengthCheck.detail
        : "",
    } : {
      status: "Optimal" as LengthStatus,
      detail: "",
    },
    fileTypeRecommendation: validFileTypes.includes(ats.atsHygieneReport.fileTypeRecommendation)
      ? ats.atsHygieneReport.fileTypeRecommendation
      : "PDF",
    formattingRisks: Array.isArray(ats.atsHygieneReport.formattingRisks)
      ? ats.atsHygieneReport.formattingRisks.filter((r: any) => typeof r === "string")
      : undefined,
  } : {
    parsingReadiness: "Good" as ParsingReadiness,
    warnings: [],
    lengthCheck: {
      status: "Optimal" as LengthStatus,
      detail: "",
    },
    fileTypeRecommendation: "PDF" as FileTypeRecommendation,
  };

  const strategicAdvice = ats.strategicAdvice && typeof ats.strategicAdvice === "object" ? {
    top3Strengths: Array.isArray(ats.strategicAdvice.top3Strengths)
      ? ats.strategicAdvice.top3Strengths.filter((s: any) => typeof s === "string").slice(0, 3)
      : [],
    top3Gaps: Array.isArray(ats.strategicAdvice.top3Gaps)
      ? ats.strategicAdvice.top3Gaps.filter((g: any) => typeof g === "string").slice(0, 3)
      : [],
    careerPivot: typeof ats.strategicAdvice.careerPivot === "string" ? ats.strategicAdvice.careerPivot : undefined,
    quickWins: Array.isArray(ats.strategicAdvice.quickWins)
      ? ats.strategicAdvice.quickWins.filter((w: any) => typeof w === "string").slice(0, 5)
      : undefined,
    polishSuggestions: Array.isArray(ats.strategicAdvice.polishSuggestions)
      ? ats.strategicAdvice.polishSuggestions.filter((p: any) => typeof p === "string").slice(0, 5)
      : undefined,
  } : {
    top3Strengths: [],
    top3Gaps: [],
  };

  const nextSteps = Array.isArray(ats.nextSteps)
    ? ats.nextSteps.filter((s: any) => typeof s === "string").slice(0, 10)
    : [];

  const requirementsMatrix = Array.isArray(ats.requirementsMatrix)
    ? ats.requirementsMatrix
        .filter((item: any) => 
          item &&
          typeof item.requirement === "string" &&
          validTypes.includes(item.type) &&
          validStatuses.includes(item.status) &&
          Array.isArray(item.evidenceQuotes)
        )
        .map((item: any) => ({
          requirement: item.requirement,
          type: item.type,
          status: item.status,
          evidenceQuotes: item.evidenceQuotes
            .filter((q: any) => typeof q === "string")
            .slice(0, 3),
          notes: typeof item.notes === "string" ? item.notes : undefined,
        }))
    : [];

  return {
    assessment,
    keywordGapAnalysis,
    contentOptimization,
    atsHygieneReport,
    strategicAdvice,
    nextSteps,
    requirementsMatrix,
  };
}

function buildSkillSearchTerms(skill: string): string[] {
  const s = skill.trim();
  if (!s) return [];

  const terms = new Set<string>();
  terms.add(s);
  terms.add(s.toLowerCase());
  terms.add(s.toUpperCase());

  const lower = s.toLowerCase();
  
  // Common variations
  if (lower === "node.js" || lower === "nodejs" || lower === "node") {
    terms.add("Node");
    terms.add("NodeJS");
    terms.add("Node.js");
    terms.add("node");
  }
  if (lower === "react.js" || lower === "reactjs" || lower === "react") {
    terms.add("React");
    terms.add("React.js");
    terms.add("react");
  }
  if (lower === "next.js" || lower === "nextjs" || lower === "next") {
    terms.add("Next");
    terms.add("Next.js");
    terms.add("next");
  }
  if (lower === "vue.js" || lower === "vuejs" || lower === "vue") {
    terms.add("Vue");
    terms.add("Vue.js");
    terms.add("vue");
  }
  if (lower === "typescript" || lower === "ts") {
    terms.add("TypeScript");
    terms.add("TS");
    terms.add("typescript");
    terms.add("ts");
  }
  if (lower === "javascript" || lower === "js" || lower.includes("es6") || lower === "es6+" || lower === "es6") {
    terms.add("JavaScript");
    terms.add("JS");
    terms.add("javascript");
    terms.add("js");
    terms.add("ES6");
    terms.add("ES6+");
    terms.add("es6");
    terms.add("es6+");
    terms.add("ECMAScript 6");
    terms.add("ECMAScript");
  }
  if (lower === "html" || lower === "html5" || lower.startsWith("html")) {
    terms.add("HTML");
    terms.add("html");
    terms.add("HTML5");
    terms.add("html5");
  }
  if (lower === "css" || lower === "css3" || lower.startsWith("css")) {
    terms.add("CSS");
    terms.add("css");
    terms.add("CSS3");
    terms.add("css3");
  }
  if (lower === "aws" || lower === "amazon web services") {
    terms.add("AWS");
    terms.add("aws");
    terms.add("Amazon Web Services");
    terms.add("amazon web services");
  }
  if (lower === "azure") {
    terms.add("Azure");
    terms.add("azure");
    terms.add("Microsoft Azure");
  }
  if (lower === "gcp" || lower === "google cloud" || lower === "google cloud platform") {
    terms.add("GCP");
    terms.add("gcp");
    terms.add("Google Cloud");
    terms.add("Google Cloud Platform");
  }
  if (lower.includes("version control") || lower === "git" || lower === "github" || lower === "gitlab") {
    terms.add("Git");
    terms.add("git");
    terms.add("GitHub");
    terms.add("github");
    terms.add("GitLab");
    terms.add("gitlab");
    terms.add("version control");
    terms.add("Version Control");
    terms.add("version control systems");
  }
  if (lower.includes("payment") || lower.includes("stripe") || lower.includes("paypal") || lower.includes("square")) {
    terms.add("Stripe");
    terms.add("stripe");
    terms.add("PayPal");
    terms.add("paypal");
    terms.add("Square");
    terms.add("square");
    terms.add("payment integration");
    terms.add("Payment Integration");
    terms.add("payment gateway");
    terms.add("Payment Gateway");
  }
  if (lower.includes("docker") || lower.includes("container")) {
    terms.add("Docker");
    terms.add("docker");
    terms.add("containerization");
    terms.add("Containerization");
    terms.add("containers");
  }
  if (lower.includes("rest") || lower.includes("api")) {
    terms.add("REST");
    terms.add("rest");
    terms.add("REST API");
    terms.add("API");
    terms.add("api");
    terms.add("API development");
    terms.add("API integration");
  }

  if (s.includes(".")) {
    terms.add(s.replace(/\./g, ""));
    terms.add(s.replace(/\./g, " "));
  }
  if (s.includes("-")) {
    terms.add(s.replace(/-/g, " "));
    terms.add(s.replace(/-/g, ""));
  }
  if (s.includes(" ")) {
    terms.add(s.replace(/\s+/g, ""));
    terms.add(s.replace(/\s+/g, "-"));
  }

  return Array.from(terms).filter(Boolean);
}

function extractEvidenceSnippets(params: {
  text: string;
  terms: string[];
  maxSnippetsPerTerm?: number;
  windowChars?: number;
}): Record<string, string[]> {
  const { text, terms, maxSnippetsPerTerm = 3, windowChars = 90 } = params;
  const source = text || "";
  const out: Record<string, string[]> = {};

  for (const term of terms) {
    const searchTerms = buildSkillSearchTerms(term);
    const snippets: string[] = [];
    const seen = new Set<string>();

    for (const st of searchTerms) {
      if (snippets.length >= maxSnippetsPerTerm) break;
      const pattern = escapeRegex(st);
      // More flexible regex: allows word boundaries OR start/end of string, case-insensitive
      const re = new RegExp(`\\b${pattern}\\b|^${pattern}|${pattern}$`, "gi");

      let match: RegExpExecArray | null;
      let lastIndex = 0;
      while ((match = re.exec(source)) !== null) {
        // Prevent infinite loop
        if (match.index === lastIndex) {
          re.lastIndex++;
          continue;
        }
        lastIndex = match.index;
        
        const start = Math.max(0, match.index - windowChars);
        const end = Math.min(source.length, match.index + match[0].length + windowChars);
        const snippet = normalizeSnippet(source.slice(start, end));
        if (!snippet) continue;
        if (seen.has(snippet)) continue;
        seen.add(snippet);
        snippets.push(snippet);
        if (snippets.length >= maxSnippetsPerTerm) break;
      }
    }

    out[term] = snippets;
  }

  return out;
}

interface JobMatchResult {
  job: {
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    url: string | null;
    postedDate: Date | null;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
  };
  analysis: {
    mustHaveSkills: string[];
    niceToHaveSkills: string[];
    experienceYears: number | null;
    educationLevel: string | null;
    languageRequirements: string[];
  };
  matchScore: number; // 0-100
  skillMatch: {
    score: number;
    matchingMustHave: string[];
    missingMustHave: string[];
    matchingNiceToHave: string[];
    missingNiceToHave: string[];
  };
  experienceMatch: boolean;
  educationMatch: boolean;
  languageMatch: boolean;
  matchExplanation: {
    summary: string;
    strengths: string[];
    gaps: string[];
    recommendations: string[];
    experienceAnalysis?: string;
    skillAnalysis?: string;
    titleMatch?: string;
    ats?: AtsMatchDetails;
  };
}

interface MatchJobsParams {
  userId: string;
  cvEmbedding: number[];
  cvText?: string; // CV text content for LLM analysis
  userSkills: string[];
  userExperienceYears?: number;
  userEducationLevel?: string;
  userLanguages?: string[];
  userCurrentPosition?: string; // User's current job title/position
  location?: string;
  role?: string;
  limit?: number;
  minMatchScore?: number;
}


export async function analyzeJobMatchWithLLM(params: {
  job: any;
  cvText?: string; 
  userSkills: string[];
  userExperienceYears?: number;
  userEducationLevel?: string;
  userLanguages: string[];
  userCurrentPosition?: string;
  vectorSimilarity: number;
  pageCount?: number;
  cachedAtsHygieneReport?: AtsHygieneReport | null;
}): Promise<{
  matchScore: number; // 0-100
  skillMatch: {
    score: number;
    matchingMustHave: string[];
    missingMustHave: string[];
    matchingNiceToHave: string[];
    missingNiceToHave: string[];
  };
  experienceMatch: boolean;
  educationMatch: boolean;
  languageMatch: boolean;
  matchExplanation: {
    summary: string;
    strengths: string[];
    gaps: string[];
    recommendations: string[];
    experienceAnalysis?: string;
    skillAnalysis?: string;
    titleMatch?: string;
    ats?: AtsMatchDetails;
  };
}> {
  const {
    job,
    cvText,
    userSkills,
    userExperienceYears,
    userEducationLevel,
    userLanguages,
    userCurrentPosition,
    vectorSimilarity,
    pageCount,
    cachedAtsHygieneReport,
  } = params;

  if (!cvText || cvText.trim().length === 0) {
    console.log(`[Job Matching] CV text is missing or empty for job ${job.id}`);
  } else {
    console.log(`[Job Matching] CV text provided (${cvText.length} chars) for job ${job.id}`);
  }

  const userProfile = {
    skills: userSkills,
    experienceYears: userExperienceYears,
    educationLevel: userEducationLevel,
    languages: userLanguages,
    currentPosition: userCurrentPosition,
  };

  const jobRequirements = {
    title: job.title,
    company: job.company,
    location: job.location,
    mustHaveSkills: job.analysis.mustHaveSkills || [],
    niceToHaveSkills: job.analysis.niceToHaveSkills || [],
    experienceYears: job.analysis.experienceYears,
    educationLevel: job.analysis.educationLevel,
    languageRequirements: job.analysis.languageRequirements || [],
    description: job.descriptionRaw?.substring(0, 3000) || "", // Context only
  };

  const cvTextForReasoning = (cvText || "").substring(0, 6000);
  
  // Filter out vague terms that shouldn't be treated as skills
  const vagueTerms = [
    "modern web applications", "web applications", "modern applications",
    "best practices", "industry best practices",
    "collaboration", "team collaboration", "working with teams",
    "ux", "working with ux", "ux collaboration",
    "design", "working with designers",
    "software development", "application development", "web development",
    "ai-assisted", "ai assisted", "ai-assisted development", "ai assisted development",
    "open minded", "open-minded", "openminded",
    "problem solving", "problem-solving",
    "communication", "communication skills",
    "teamwork", "team work",
    "leadership", "leadership skills",
    "adaptability", "flexibility",
    "critical thinking", "analytical thinking",
    "self-motivated", "self motivated",
    "proactive", "initiative",
    "creative", "creativity",
    "detail-oriented", "detail oriented", "attention to detail"
  ];
  
  const evidenceTerms = [
    ...jobRequirements.mustHaveSkills,
    ...jobRequirements.niceToHaveSkills,
  ]
    .filter((s: any) => typeof s === "string" && s.trim().length > 0)
    .filter((s: string) => {
      const sLower = s.toLowerCase();
      return !vagueTerms.some(vague => sLower.includes(vague));
    });

  const evidenceSnippets = cvTextForReasoning.trim().length
    ? extractEvidenceSnippets({
        text: cvTextForReasoning,
        terms: evidenceTerms,
        maxSnippetsPerTerm: 5,
        windowChars: 120, // Increased window to get more context
      })
    : {};

  // Log evidence snippets for debugging
  console.log(`[Job Matching] Evidence snippets found for job ${job.id}:`, {
    totalSkills: evidenceTerms.length,
    skillsWithEvidence: Object.keys(evidenceSnippets).filter(k => evidenceSnippets[k] && evidenceSnippets[k].length > 0).length,
    skillsWithEvidenceList: Object.keys(evidenceSnippets).filter(k => evidenceSnippets[k] && evidenceSnippets[k].length > 0),
    sampleSnippets: Object.entries(evidenceSnippets)
      .filter(([_, snippets]) => snippets && snippets.length > 0)
      .slice(0, 3)
      .reduce((acc, [skill, snippets]) => {
        if (snippets && snippets.length > 0) {
          acc[skill] = snippets.slice(0, 2);
        }
        return acc;
      }, {} as Record<string, string[]>),
  });

  const preCalculatedLengthCheck = calculateLengthCheck(pageCount, userExperienceYears);

  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.35,
    max_tokens: 2600,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a Senior ATS (Applicant Tracking System) Optimization Expert and Career Coach. Your goal is to analyze a Candidate CV against a Job Description and provide a high-precision, actionable JSON diagnostic.

CRITICAL: The match score represents "ATS PASSING PROBABILITY" - the likelihood that this resume will PASS the ATS filter and reach human review. It is NOT the probability of getting hired.

ATS SCORING PHILOSOPHY:
- ATS systems are keyword-based filters, not comprehensive hiring assessments
- If core skills match, the resume should PASS the ATS (score 60-75%+)
- Missing styling frameworks or advanced concepts should NOT prevent ATS passing if core skills are present
- A score of 60-75% means "Will likely pass ATS, reach human review"
- A score of 40-59% means "May pass ATS, but needs optimization"
- A score below 40% means "Unlikely to pass ATS filter"

IMPORTANT: Be more lenient with scoring. If a candidate has the CORE skills for the role, they should score 60-75% even if missing some nice-to-haves. The goal is to predict ATS passing, not perfect job fit.

CRITICAL: Adapt your coaching style based on the match score:
- 0-40%: "Tier 1: Reality Check" mode - Be blunt, identify fundamental gaps (missing CORE skills), suggest pivots
- 41-75%: "Tier 2: Optimizer" mode - Be tactical, focus on keyword optimization and rewrites (has core skills, needs polish)
- 76-100%: "Tier 3: Interviewer" mode - Be polished, focus on summary and cultural fit (will definitely pass ATS)

ADDITIVE SCORING MODEL (ATS Visibility Score):

CRITICAL: This is an ADDITIVE scoring system. Start at 0 points and ADD points for presence. DO NOT subtract points for missing items.

PHASE 1: CATEGORIZATION
First, categorize all skills from the job requirements:
- CORE/FOUNDATION: Primary stack technologies (React, TypeScript, Python, Node.js, etc.)
- SECONDARY: Supporting libraries/frameworks (Redux, Express, Jest, etc.)
- TOOLING: Styling/DevTools (TailwindCSS, Git, npm, etc.)

SKILL CATEGORIZATION (Apply to ALL roles):

1. CORE/FOUNDATION SKILLS (+12 to +15 points each):
   These are the fundamental technologies required for the role.
   
   Frontend Roles:
   - React, Vue, Angular, TypeScript, JavaScript, HTML, CSS
   - State management: Redux, Zustand, MobX
   - Build tools: Webpack, Vite, Next.js, Nuxt.js
   
   Backend Roles:
   - Node.js, Python, Java, Go, C#, Ruby, PHP
   - Databases: PostgreSQL, MySQL, MongoDB, Redis
   - APIs: REST, GraphQL
   
   Full Stack:
   - Combination of Frontend + Backend core skills
   
   Data Roles:
   - Python, SQL, Spark, Hadoop, Pandas, NumPy
   - Data warehouses: Snowflake, BigQuery, Redshift
   
   DevOps/Cloud:
   - AWS, Azure, GCP, Docker, Kubernetes, Terraform
   - CI/CD: Jenkins, GitHub Actions, GitLab CI

2. FRAMEWORK/LIBRARY SKILLS (+5 points each):
   Important supporting technologies.
   - UI Libraries: Material-UI, Ant Design, Chakra UI
   - Testing: Jest, Cypress, Playwright, Vitest
   - Backend frameworks: Express, FastAPI, Spring Boot, Django
   - ORMs: Prisma, Sequelize, TypeORM, SQLAlchemy

3. STYLING/TOOLING SKILLS (+1 to +2 points each):
   Nice to have but low priority. CSS frameworks are especially low.
   - Styling: TailwindCSS, Styled Components, CSS Modules, SASS, LESS, Bootstrap
   - Build tools: Parcel, Rollup, esbuild
   - Package managers: npm, yarn, pnpm
   - Version control: Git, GitHub, GitLab

4. ADVANCED/CONCEPTUAL SKILLS (+2 to +5 points each):
   Advanced concepts that are nice-to-have.
   - Architecture: Microfrontend, Microservices, Serverless, Event-driven
   - Patterns: Design patterns, SOLID principles, Clean Architecture
   - Performance: Web Workers, Service Workers, CDN optimization

5. NICE-TO-HAVE SKILLS (+0 to +1 points each):
   Should barely impact score. Soft skills should be IGNORED completely.
   - Specific libraries: MUI, Zustand, Jotai, React Query
   - Tools: Jira, Confluence, Slack, Notion
   - Soft skills: IGNORE completely - Communication, Problem Solving, Open Minded, AI-assisted, etc.

PHASE 2: ADDITIVE SCORING

Start at 0 points. Add points based on PRESENCE in EVIDENCE_SNIPPETS:

I. HARD SKILLS (Add points for each skill found in EVIDENCE_SNIPPETS):
   - CORE skills: +12 to +15 points each
   - SECONDARY skills: +5 points each
   - TOOLING skills: +1 to +2 points each
   - ADVANCED skills: +2 to +5 points each
   - NICE-TO-HAVE skills: +0 to +1 points each
   
   CRITICAL: Only add points if the skill appears in EVIDENCE_SNIPPETS. If a skill is NOT in EVIDENCE_SNIPPETS, simply do NOT add points for it. DO NOT subtract points.

II. EXPERIENCE ALIGNMENT:
   - If candidate meets/exceeds required years of experience: +30 points
   - If candidate is 1 year under: +25 points
   - If candidate is 2 years under: +20 points
   - If candidate is 3 years under: +12 points
   - If candidate is 4+ years under: +5 points
   - If overqualified (1-2 years over): +25 points
   - If very overqualified (3+ years over): +18 points

III. SENIORITY & ROLE FIT:
   - Title match (Senior → Senior): +20 points
   - Related level (Mid → Senior): +15 points
   - Mismatch (Junior → Senior): +5 points
   - Lane alignment (Frontend → Frontend): +20 points
   - Related lane (Frontend → Full Stack): +15 points
   - Different lane (Frontend → Data): +5 points

FINAL SCORE = Sum of all points added (Hard Skills + Experience + Seniority)
Cap at 0-100 range.

CRITICAL RULES:
1. Start at 0 points - never start with a base score
2. Only ADD points for presence - never subtract for absence
3. If a skill is not in EVIDENCE_SNIPPETS, simply don't add points - that's it
4. The score represents "ATS Visibility" - how likely the resume will be found by keyword searches

SCORING EXAMPLES (Additive Model):

Example 1: Frontend Dev (2 years) applying to Frontend role
- Has in EVIDENCE_SNIPPETS: React (+15), TypeScript (+15), JavaScript (+12) = +42 points
- Experience: 2 years (meets requirement) = +30 points
- Title match: Frontend → Frontend = +20 points
- Total: 42 + 30 + 20 = 92 points (Excellent Match - will definitely pass ATS)

Example 2: Frontend Dev (2 years) applying to Frontend role
- Has in EVIDENCE_SNIPPETS: React (+15), TypeScript (+15) = +30 points
- Missing: JavaScript (not in snippets, so +0 points - DO NOT subtract)
- Experience: 2 years = +30 points
- Title match: Frontend → Frontend = +20 points
- Total: 30 + 30 + 20 = 80 points (Strong Match - will likely pass ATS)

Example 3: Frontend Dev applying to Frontend role
- Has in EVIDENCE_SNIPPETS: TailwindCSS (+1), CSS (+2) = +3 points
- Missing: React, TypeScript, JavaScript (not in snippets, so +0 points each)
- Experience: 1 year (2 years under) = +20 points
- Title match: Frontend → Frontend = +20 points
- Total: 3 + 20 + 20 = 43 points (Moderate Match - may pass ATS, needs optimization)

Example 4: Backend Dev (3 years) applying to Backend role requiring 3 years
- Has in EVIDENCE_SNIPPETS: Python (+15), Node.js (+15), PostgreSQL (+12) = +42 points
- Missing: Docker, Kubernetes (not in snippets, so +0 points - DO NOT subtract)
- Experience: 3 years (perfect match) = +30 points
- Title match: Backend → Backend = +20 points
- Total: 42 + 30 + 20 = 92 points (Excellent Match - will definitely pass ATS)

Example 5: Full Stack Dev (2 years) applying to Full Stack role
- Has in EVIDENCE_SNIPPETS: React (+15), TypeScript (+15), JavaScript (+12), Node.js (+15), Express (+5) = +62 points
- Missing: TailwindCSS, Docker (not in snippets, so +0 points - DO NOT subtract)
- Experience: 2 years = +30 points
- Title match: Full Stack → Full Stack = +20 points
- Total: 62 + 30 + 20 = 112 points → capped at 100 (Excellent Match - will definitely pass ATS)

KEY PRINCIPLES:
1. ATS systems check for core keywords. If core skills match, resume passes ATS (60-75%+)
2. For full stack roles: If candidate has frontend CORE (React/TypeScript) AND backend CORE (Node.js/Python), score should be 70-80%+ even if missing CSS frameworks or advanced concepts
3. CSS frameworks (TailwindCSS, Bootstrap) should have 0.5 points max impact - they are NOT critical
4. Soft skills (AI-assisted, open minded, communication) should be IGNORED completely - do NOT list as gaps
5. The score reflects "will this get past the filter?" not "is this person perfect for the job?"

TIER DETERMINATION:
- Score 0-40: Tier 1: Reality Check
- Score 41-75: Tier 2: Optimizer
- Score 76-100: Tier 3: Interviewer

MATCH LABEL (ATS Passing Probability):
- 0-40: "Low Compatibility" (Unlikely to pass ATS filter)
- 41-65: "Moderate Match" (May pass ATS, needs optimization)
- 66-85: "Strong Match" (Will likely pass ATS, reach human review)
- 86-100: "Excellent Match" (Will definitely pass ATS, strong candidate)

EVIDENCE RULES (CRITICAL - READ THIS FIRST):

STEP 1: CHECK EVIDENCE_SNIPPETS BEFORE MARKING ANY SKILL AS MISSING
- You will receive EVIDENCE_SNIPPETS - these are verbatim text excerpts from the candidate's resume
- EVIDENCE_SNIPPETS are organized by keyword/skill name
- If EVIDENCE_SNIPPETS contains entries for a skill (e.g., "React" or "TypeScript"), that skill IS PRESENT in the resume
- You MUST mark skills as "MET" if they appear in EVIDENCE_SNIPPETS, even if the snippets are short
- DO NOT mark a skill as missing if it appears in EVIDENCE_SNIPPETS - this is a critical error

STEP 2: HOW TO USE EVIDENCE_SNIPPETS
- Check EVIDENCE_SNIPPETS[skillName] - if it has entries (even 1), the skill is present
- For example: If EVIDENCE_SNIPPETS["React"] = ["...built React applications..."], then React is MET
- If EVIDENCE_SNIPPETS["TypeScript"] = ["...TypeScript experience..."], then TypeScript is MET
- Include 1-3 evidenceQuotes from the snippets when marking as MET or PARTIAL
- Do NOT mark skills as NOT_MET if they appear in EVIDENCE_SNIPPETS

STEP 3: ONLY MARK AS MISSING IF:
- The skill does NOT appear in EVIDENCE_SNIPPETS at all
- OR EVIDENCE_SNIPPETS[skillName] is empty or undefined

CRITICAL: If you see React or TypeScript in EVIDENCE_SNIPPETS, you MUST mark them as MET in requirementsMatrix and criticalMatches. Do NOT say the candidate lacks these skills if they appear in evidence snippets.

CRITICAL SKILL EQUIVALENCIES (These are THE SAME - do NOT treat as different):

GENERAL RULE: Many technologies have version numbers or naming variations that are THE SAME technology. If a candidate has the base technology, they have ALL versions of it. Do NOT penalize for version numbers or naming variations.

Examples of equivalent skills (treat as THE SAME):
- HTML = HTML5 (if candidate has "HTML", they have "HTML5" - same technology)
- CSS = CSS3 (if candidate has "CSS", they have "CSS3" - same technology)
- JavaScript = JS = ES6 = ES6+ = ECMAScript 6 = ECMAScript (if candidate has "JavaScript" or "JS", they have "ES6+" - same technology)
- Python = Python 3 = Python3 (if candidate has "Python", they have "Python 3" - same language)
- Java = Java 8 = Java 11 = Java 17 (if candidate has "Java", they have "Java 8/11/17" - same language)
- React = React.js = ReactJS = React 18 = React 17 (if candidate has "React", they have all React versions - same framework)
- Node.js = NodeJS = Node = Node.js 18 = Node.js 20 (if candidate has "Node.js", they have all Node versions - same runtime)
- TypeScript = TS = TypeScript 5 = TypeScript 4 (if candidate has "TypeScript", they have all TS versions - same language)
- AWS = Amazon Web Services (same cloud platform)
- Git = GitHub = GitLab = Version Control = Version Control Systems (if candidate has "Git" or "GitHub", they have "version control systems" experience)
- Stripe = PayPal = Payment Gateway = Payment Integration (if candidate has "Stripe" or "PayPal", they have "payment integration" knowledge)
- Docker = Containerization = Container Technologies (if candidate has "Docker", they have containerization experience)
- REST API = REST = API Development = API Integration (if candidate has "REST" or "REST API", they have API development/integration experience)

CRITICAL RULES:
1. If job requires "HTML5" and candidate has "HTML" in EVIDENCE_SNIPPETS → MARK AS MET (same technology)
2. If job requires "CSS3" and candidate has "CSS" in EVIDENCE_SNIPPETS → MARK AS MET (same technology)
3. If job requires "JS ES6+" or "ES6+" and candidate has "JavaScript" or "JS" in EVIDENCE_SNIPPETS → MARK AS MET (same technology)
4. If job requires "Python 3" and candidate has "Python" in EVIDENCE_SNIPPETS → MARK AS MET (same language)
5. If job requires "React 18" and candidate has "React" in EVIDENCE_SNIPPETS → MARK AS MET (same framework)
6. If job requires "version control systems" or "version control" and candidate has "Git", "GitHub", or "GitLab" in EVIDENCE_SNIPPETS → MARK AS MET (Git IS version control)
7. If job requires "payment integration" or "payment gateway" and candidate has "Stripe", "PayPal", "Square", or similar in EVIDENCE_SNIPPETS → MARK AS MET (these ARE payment integration tools)
8. If job requires generic category (e.g., "API development") and candidate has specific tool in that category (e.g., "REST", "GraphQL") → MARK AS MET
9. Apply this logic to ALL technologies: base technology name = all versions of that technology
10. Do NOT list version-specific requirements as missing if the base technology is present
11. Do NOT list generic category requirements as missing if candidate has specific tools in that category
12. Version numbers are just specifications - having the technology means you can work with any version

DIAGNOSTIC GUIDELINES:

1. KEYWORD GAP ANALYSIS:
   - FIRST: Filter out vague/non-actionable terms (see SKILL FILTERING rules below)
   - THEN: Categorize each keyword (Core/Foundation, Framework/Library, Styling/Tooling, Advanced/Conceptual, Nice-to-Have)
   - Prioritize by importance: Critical (Core skills) > High (Frameworks) > Medium (Advanced concepts) > Low (Styling/Tooling)
   - For each missing keyword, provide:
     * Specific recommendation (where to add it)
     * Impact if added (estimated score increase - be realistic based on category)
     * Context (why it matters for this role)
   - IGNORE these vague/soft skill terms (do NOT list as missing):
     * Soft skills: "AI-assisted", "AI assisted", "open minded", "open-minded", "problem solving", "communication", "teamwork", "leadership", "adaptability", "critical thinking", "self-motivated", "proactive", "creative", "detail-oriented"
     * Vague terms: "Modern web applications", "Web applications", "Modern applications", "Best practices", "Industry best practices", "Collaboration", "Team collaboration", "Working with teams", "UX", "Working with UX", "UX collaboration", "Design", "Working with designers", "Software development", "Application development"
     * CSS frameworks: "TailwindCSS", "Bootstrap", "Material-UI" (styling) - these should have 0.5 points max impact
     * Any term that's not a specific technology/tool/framework
   - IMPORTANT: Missing styling frameworks (TailwindCSS, CSS-in-JS) should be marked as "Low" priority and have minimal impact (0.5-1 points)
   - IMPORTANT: Missing advanced concepts (microfrontend, serverless) should be marked as "Medium" priority and moderate impact (1-3 points)
   - IMPORTANT: Missing core skills (React, TypeScript, Python) should be marked as "Critical" priority and high impact (8-12 points)
   - CRITICAL: If a skill appears in EVIDENCE_SNIPPETS, it IS present - do NOT list it as missing

2. XYZ FORMULA FOR BULLET REWRITES:
   When suggesting bullet improvements, ALWAYS follow this structure:
   "Accomplished [X] as measured by [Y], by doing [Z]"
   
   - X: Action Verb + Result (e.g., "Increased user retention")
   - Y: Quantifiable Metric (%, $, time, count) (e.g., "by 15%")
   - Z: Specific Keyword/Technology from JD (e.g., "by migrating to React.js")
   
   Example:
   Original: "Responsible for developing the frontend."
   Suggested: "Engineered a high-performance frontend using React and Redux, resulting in a 25% increase in page load speed."
   
   CRITICAL: Never fabricate experience. Only rewrite existing bullets to include keywords/metrics truthfully.

3. ATS HYGIENE CHECK:
   - Check for parsing risks: tables, images, two-column layouts
   - Length check: ${pageCount !== undefined ? `The resume has ${pageCount} page${pageCount !== 1 ? 's' : ''}. The length check has been pre-calculated server-side based on page count and experience. Use the provided lengthCheck status and detail in your response.` : 'Page count is not available. Infer the page count from the text length if possible, but prioritize parsing risks and formatting issues.'}
   - Recommend file type (PDF vs DOCX based on employer)
   - Flag formatting issues that break ATS parsers

4. TIER-APPROPRIATE ADVICE:
   - Tier 1 (0-40%): Focus on fundamental gaps (missing CORE skills), career pivot suggestions, core certifications
   - Tier 2 (41-75%): Focus on keyword optimization, XYZ rewrites, missing frameworks/advanced concepts to highlight (NOT styling tools)
   - Tier 3 (76-100%): Focus on professional summary, cultural fit, interview prep, subtle improvements
   
   IMPORTANT: If candidate has core skills but is in Tier 1 due to missing styling/advanced concepts, reconsider the tier. Core skills should push to Tier 2 (41-75%) even if styling frameworks are missing.

SKILL FILTERING & CATEGORIZATION RULES:
- Only list SPECIFIC, ACTIONABLE technical skills as missing
- FOCUS ON: Languages (JavaScript, TypeScript, Python, Java, etc.) and Core Frameworks (React, Node.js, Express, etc.)
- IGNORE: CSS frameworks (TailwindCSS, Bootstrap, etc.) - these should have minimal/no impact
- IGNORE: Soft skills completely (AI-assisted, open minded, communication, problem solving, etc.)
- Categorize each skill before listing it:
  * CORE: React, TypeScript, Python, Java, Node.js, PostgreSQL, AWS, Docker, Kubernetes, JavaScript, HTML, CSS
  * FRAMEWORK: Redux, Next.js, Express, Django, Spring Boot, Jest, Cypress
  * STYLING/TOOLING: TailwindCSS, Styled Components, SASS, CSS Modules, Git, npm (VERY LOW PRIORITY)
  * ADVANCED: Microfrontend, Microservices, Serverless, Event-driven architecture
  * NICE-TO-HAVE: MUI, Zustand, Jotai, Jira, Slack
- Invalid/Vague terms to IGNORE completely (do NOT list as missing, do NOT search for):
  * Soft skills: "AI-assisted", "AI assisted", "open minded", "open-minded", "problem solving", "communication", "teamwork", "leadership", "adaptability", "critical thinking", "self-motivated", "proactive", "creative", "detail-oriented"
  * Vague terms: "Engineering", "Development", "Modern web applications", "Web applications", "Best practices", "Collaboration", "UX", "Design", "Software development"
  * Any term that's not a specific technology, tool, or framework
- Never list soft skills or vague terms
- CRITICAL: If candidate has core skills (e.g., React + TypeScript for frontend), missing styling frameworks (TailwindCSS) should NOT be listed - ignore them or mark as "Low" priority with 0.5 points max impact
- CRITICAL: If candidate has core skills, missing advanced concepts (microfrontend) should be listed as "Medium" priority, not "Critical"
- CRITICAL: If a skill appears in EVIDENCE_SNIPPETS (like AWS, Git), it IS present - do NOT mark as missing
- CRITICAL: For full stack roles, if candidate has frontend CORE (React/TypeScript) AND backend CORE (Node.js/Python), score should be 65-75%+ even if missing CSS frameworks or advanced concepts

IMPORTANT: Always include the disclaimer field in the assessment object to help users understand what the score means.

Return JSON with this EXACT structure:
{
  "matchScore": 75,
  "skillMatch": {
    "score": 80,
    "matchingMustHave": ["React", "TypeScript"],
    "missingMustHave": ["Docker"],
    "matchingNiceToHave": ["AWS"],
    "missingNiceToHave": ["Kubernetes"]
  },
  "experienceMatch": true,
  "educationMatch": true,
  "languageMatch": true,
  "matchExplanation": {
    "summary": "Good match (75%). Your 3 years of React/TypeScript experience aligns well with the role, and your AI project work is highly relevant. Main gaps: Azure experience (job requires Azure, you have AWS) and healthcare domain knowledge.",
    "strengths": ["Specific strength 1", "Specific strength 2"],
    "gaps": ["Specific gap 1", "Specific gap 2"],
    "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2"],
    "experienceAnalysis": "You have X years vs Y years required. [Specific analysis]",
    "skillAnalysis": "You match X% of must-have skills. Strong in [areas]. Could improve [areas].",
    "titleMatch": "Your [current role] aligns [well/moderately/poorly] with [job title]. [Specific reasoning]",
    "ats": {
      "assessment": {
        "matchScore": 75,
        "matchLabel": "Strong Match",
        "executiveSummary": "Your technical background in React and Node.js aligns well with the core requirements. However, the ATS may rank you lower because your resume lacks specific mentions of 'Cloud Deployment' and 'System Design', which are emphasized in the job description.",
        "hiringManagerVibe": "The candidate has the hard skills but needs to demonstrate more ownership of the full software lifecycle.",
        "tier": "Tier 2: Optimizer",
        "disclaimer": "This is an ATS Visibility Score. It predicts the likelihood that a recruiter's search query will find your resume. It is based on keyword density and formatting parsing. A high score does not guarantee an interview. An ATS gets you 'seen,' but your achievements and interview performance get you the job. This tool is designed to help you bypass the 'automated rejection' phase."
      },
      "keywordGapAnalysis": {
        "criticalMatches": [
          {
            "keyword": "React",
            "context": "Found in 'Experience' section; high density.",
            "status": "met",
            "evidenceQuotes": ["..."]
          }
        ],
        "missingHighPriority": [
          {
            "keyword": "AWS Lambda",
            "importance": "High",
            "recommendation": "Add this to your project descriptions if you have experience with serverless functions.",
            "whereToAdd": "Skills section + Experience bullets",
            "impactIfAdded": "Would increase score by ~8 points"
          }
        ]
      },
      "contentOptimization": [
        {
          "originalBullet": "Responsible for developing the frontend of the e-commerce site.",
          "suggestedBullet": "Engineered a high-performance e-commerce frontend using React and Redux, resulting in a 25% increase in page load speed and improving the SEO ranking of core product pages.",
          "logic": "Adds quantification (25%) and targets the 'SEO' keyword mentioned in the JD.",
          "impactFactor": "HIGH",
          "atsStrategy": "Uses strong action verbs (Engineered) instead of passive ones (Responsible for).",
          "section": "EXPERIENCE",
          "target": "Most recent role"
        }
      ],
      "atsHygieneReport": {
        "parsingReadiness": "Good",
        "warnings": ["Detected a complex table in the 'Education' section. Some legacy ATS may scramble this text."],
        "lengthCheck": {
          "status": "Optimal",
          "detail": "1.5 pages is ideal for a candidate with 5 years of experience."
        },
        "fileTypeRecommendation": "PDF",
        "formattingRisks": ["Two-column layout in Education section"]
      },
      "strategicAdvice": {
        "top3Strengths": [
          "Deep expertise in modern JavaScript frameworks",
          "Clear progression of responsibility over 4 years",
          "Strong educational background from a target university"
        ],
        "top3Gaps": [
          "Lack of cloud infrastructure keywords (AWS/Azure)",
          "No mention of testing frameworks (Jest/Cypress)",
          "Minimal focus on 'Scale' or 'High-traffic' environments"
        ],
        "quickWins": [
          "Add 'AWS Lambda' and 'CI/CD' to your 'Technical Skills' section",
          "Insert the suggested bullet points into your 'Experience' section"
        ]
      },
      
      IMPORTANT: In strategicAdvice.top3Gaps, ONLY list SPECIFIC technical skills/tools/frameworks that are missing. 
      DO NOT list:
      - Soft skills: "AI-assisted", "open minded", "communication", "problem solving", "teamwork", "leadership", etc. (IGNORE completely)
      - Vague terms: "Modern web applications", "Best practices", "Collaboration", "Working with UX/designers", "Software development" (too vague)
      - CSS frameworks: "TailwindCSS", "Bootstrap" (should have minimal impact, prefer not listing)
      - Generic terms: Any term that's not a specific technology/tool/framework
      
      FOCUS ON: Languages (JavaScript, TypeScript, Python, Java) and Core Frameworks (React, Node.js, Express, Django)
      
      Only list concrete, actionable gaps like: "Missing React", "No Docker experience", "Lack of AWS knowledge"
      
      CRITICAL: If candidate has core skills for the role (e.g., React + TypeScript for frontend, or Node.js + Python for backend, or BOTH for full stack), 
      the score should be 65-80%+ and gaps should focus on advanced concepts, NOT CSS frameworks or soft skills.
      "nextSteps": [
        "Insert the suggested bullet points into your 'Experience' section.",
        "Add 'AWS Lambda' and 'CI/CD' to your 'Technical Skills' cloud.",
        "Would you like me to rewrite your Professional Summary to better reflect these missing cloud keywords?"
      ],
      "requirementsMatrix": [
        {
          "requirement": "React",
          "type": "MUST_HAVE",
          "status": "MET",
          "evidenceQuotes": ["..."],
          "notes": "..."
        }
      ]
    }
  }
}

Respond ONLY with valid JSON, no markdown, no code blocks.`,
      },
      {
        role: "user",
        content: `Analyze the match between this candidate and job posting. Provide a PRECISE, DIFFERENTIATED score (avoid clustering around 35%).

CANDIDATE PROFILE:
- Current Position: ${userProfile.currentPosition || "Not specified"}
- Skills: ${userProfile.skills.join(", ") || "None listed"}
- Experience: ${userProfile.experienceYears ? `${userProfile.experienceYears} years` : "Not specified"}
- Education: ${userProfile.educationLevel || "Not specified"}
- Languages: ${userProfile.languages.join(", ") || "Not specified"}

JOB POSTING:
- Title: ${jobRequirements.title}
- Company: ${jobRequirements.company || "Not specified"}
- Location: ${jobRequirements.location || "Not specified"}

JOB REQUIREMENTS:
- Must-Have Skills: ${jobRequirements.mustHaveSkills.join(", ") || "None specified"}
- Nice-to-Have Skills: ${jobRequirements.niceToHaveSkills.join(", ") || "None specified"}
- Experience Required: ${jobRequirements.experienceYears ? `${jobRequirements.experienceYears} years` : "Not specified"}
- Education Required: ${jobRequirements.educationLevel || "Not specified"}
- Language Requirements: ${jobRequirements.languageRequirements.join(", ") || "None specified"}

SEMANTIC SIMILARITY: ${(vectorSimilarity * 100).toFixed(1)}% (CV/job description similarity)

JOB DESCRIPTION (excerpt):
${jobRequirements.description}

RESUME EXCERPT (for reasoning only; DO NOT quote from here unless the quote exists in EVIDENCE_SNIPPETS):
${cvTextForReasoning.trim().length ? cvTextForReasoning : "[missing]"}

PRE-CALCULATED LENGTH CHECK (use this exact value in your response):
${pageCount !== undefined ? `The resume has ${pageCount} page${pageCount !== 1 ? 's' : ''}.` : 'Page count not available.'}
Length Check Status: ${preCalculatedLengthCheck.status}
Length Check Detail: ${preCalculatedLengthCheck.detail}
IMPORTANT: Use this EXACT lengthCheck object in your atsHygieneReport response. Do NOT recalculate or infer a different value.

EVIDENCE_SNIPPETS (the ONLY allowed source for evidenceQuotes):
${JSON.stringify(evidenceSnippets)}

CRITICAL INSTRUCTIONS FOR EVIDENCE_SNIPPETS:
1. Check EVIDENCE_SNIPPETS FIRST before marking any skill as missing
2. If a skill name appears as a key in EVIDENCE_SNIPPETS and has non-empty array values, that skill IS PRESENT in the resume
3. For example:
   - If EVIDENCE_SNIPPETS["React"] exists and has entries → React is MET
   - If EVIDENCE_SNIPPETS["TypeScript"] exists and has entries → TypeScript is MET
   - If EVIDENCE_SNIPPETS["Git"] exists and has entries → Git is MET (even though it's a common tool)
   - If EVIDENCE_SNIPPETS["Python"] is empty or missing → Python is NOT_MET
4. DO NOT mark skills as missing if they appear in EVIDENCE_SNIPPETS - this is a critical error
5. Use the evidence quotes from EVIDENCE_SNIPPETS when marking skills as MET in requirementsMatrix and criticalMatches
6. IMPORTANT: Even if a skill is "common" (like Git), if it appears in EVIDENCE_SNIPPETS, it IS present - mark it as MET

CRITICAL SKILL EQUIVALENCIES (These are THE SAME technology - treat as equivalent):

GENERAL RULE: Many technologies have version numbers or naming variations that are THE SAME technology. If a candidate has the base technology, they have ALL versions of it. Do NOT penalize for version numbers or naming variations.

Also, many job requirements use generic category names (like "payment integration" or "version control") when they actually mean specific tools. If a candidate has the specific tool, they HAVE that category knowledge.

Examples of equivalent skills (treat as THE SAME):
- HTML = HTML5 (if job requires "HTML5" and candidate has "HTML" → MARK AS MET)
- CSS = CSS3 (if job requires "CSS3" and candidate has "CSS" → MARK AS MET)
- JavaScript = JS = ES6 = ES6+ = ECMAScript 6 (if job requires "JS ES6+" or "ES6+" and candidate has "JavaScript" or "JS" → MARK AS MET)
- Python = Python 3 = Python3 (if job requires "Python 3" and candidate has "Python" → MARK AS MET)
- Java = Java 8 = Java 11 = Java 17 (if job requires "Java 8" and candidate has "Java" → MARK AS MET)
- React = React.js = ReactJS = React 18 = React 17 (if job requires "React 18" and candidate has "React" → MARK AS MET)
- Node.js = NodeJS = Node = Node.js 18 (if job requires "Node.js 18" and candidate has "Node.js" → MARK AS MET)
- TypeScript = TS = TypeScript 5 (if job requires "TypeScript 5" and candidate has "TypeScript" → MARK AS MET)
- Git = GitHub = GitLab = Version Control = Version Control Systems (if job requires "version control systems" and candidate has "Git" → MARK AS MET)
- Stripe = PayPal = Payment Gateway = Payment Integration (if job requires "payment integration" and candidate has "Stripe" → MARK AS MET)
- Docker = Containerization (if job requires "containerization" and candidate has "Docker" → MARK AS MET)
- REST API = REST = API Development = API Integration (if job requires "API development" and candidate has "REST" → MARK AS MET)

CRITICAL RULES:
1. Base technology name = ALL versions of that technology (React = React 18 = React 17 = React 16)
2. Do NOT treat version numbers as different skills (HTML5 vs HTML, CSS3 vs CSS, ES6+ vs JavaScript, Python 3 vs Python)
3. Generic category names = specific tools in that category (version control = Git, payment integration = Stripe)
4. If candidate has the base technology, they can work with any version - mark as MET
5. If candidate has a specific tool in a category, they have that category knowledge - mark as MET
6. Apply this logic to ALL technologies and categories, not just the examples above

ANALYSIS STEPS (ADDITIVE SCORING):
1. Check role compatibility: Is "${userProfile.currentPosition || "candidate's role"}" compatible with "${jobRequirements.title}"?
2. Categorize ALL skills from job requirements:
   - CORE/FOUNDATION: Fundamental technologies (React, TypeScript, Python, etc.) → +12 to +15 points each if found
   - FRAMEWORK/LIBRARY: Supporting technologies (Redux, Next.js, etc.) → +5 points each if found
   - STYLING/TOOLING: Nice to have (TailwindCSS, CSS-in-JS, Git, etc.) → +1 to +2 points each if found
   - ADVANCED/CONCEPTUAL: Advanced concepts (Microfrontend, Serverless, etc.) → +2 to +5 points each if found
   - NICE-TO-HAVE: Should barely impact → +0 to +1 points each if found
3. Calculate experience alignment: ${userProfile.experienceYears || 0} years vs ${jobRequirements.experienceYears || "unspecified"} required
   - If meets/exceeds: +30 points
   - If 1 year under: +25 points
   - If 2 years under: +20 points
   - If 3 years under: +12 points
   - If 4+ years under: +5 points
4. Calculate skill match using ADDITIVE model:
   - Start at 0 points
   - For each skill in EVIDENCE_SNIPPETS, ADD points based on category:
     * CORE skills found: +12 to +15 points each
     * SECONDARY skills found: +5 points each
     * TOOLING skills found: +1 to +2 points each
     * ADVANCED skills found: +2 to +5 points each
   - DO NOT subtract points for missing skills - simply don't add them
5. Calculate seniority/title match:
   - Title match: +20 points
   - Related level: +15 points
   - Mismatch: +5 points
6. FINAL SCORE = Sum of all points (Hard Skills + Experience + Seniority)
   - Cap at 0-100 range
   - Be precise, use full 0-100 range

CRITICAL SCORING PRINCIPLES (ADDITIVE MODEL):
- Start at 0 points - never start with a base score
- Only ADD points for presence in EVIDENCE_SNIPPETS
- DO NOT subtract points for missing items - simply don't add them
- Score = "Will this resume pass the ATS filter?" NOT "Will this person get hired?"
- ATS systems are keyword-based - if core skills match, resume should PASS (60-75%+)
- A candidate with CORE skills (e.g., React + TypeScript for frontend) should score 65-75% even if missing styling frameworks
- Missing TailwindCSS (styling) = +0 points (don't add, but don't subtract either)
- Missing microfrontend (advanced) = +0 points (don't add, but don't subtract either)
- Missing React/TypeScript (core) = +0 points (don't add, but don't subtract either)
- Each job should get a UNIQUE score based on what's actually present
- Use the full scoring range: unlikely to pass (0-40), may pass (41-65), will pass (66-85), excellent (86-100)
- Remember: ATS passing ≠ perfect candidate - it's about keyword visibility`,
      },
    ],
  }) as any;

  const response = completion.choices[0]?.message?.content;
  if (!response) {
    throw new Error("No response from LLM");
  }

  try {
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const analysis = JSON.parse(cleaned);

    if (!analysis.matchExplanation?.ats) {
      console.error("[Job Matching] ⚠️ CRITICAL: LLM response missing 'ats' field!");
      console.error("[Job Matching] matchExplanation keys:", Object.keys(analysis.matchExplanation || {}));
      console.error("[Job Matching] Full LLM response (first 1000 chars):", JSON.stringify(analysis, null, 2).substring(0, 1000));
      throw new Error("LLM response missing required 'ats' field in matchExplanation");
    }

    const softSkillsPattern = /problem solving|communication|interpersonal|organizational|attention to detail|teamwork|leadership|time management|adaptability|critical thinking|collaboration|work ethic|self-motivation|initiative|creativity|analytical thinking|decision making|conflict resolution|negotiation|presentation skills|written communication|verbal communication/i;
    
    const filterSoftSkills = (skills: string[]): string[] => {
      return skills.filter(skill => !softSkillsPattern.test(skill));
    };

    const missingMustHave = Array.isArray(analysis.skillMatch?.missingMustHave) 
      ? filterSoftSkills(analysis.skillMatch.missingMustHave)
      : [];
    const missingNiceToHave = Array.isArray(analysis.skillMatch?.missingNiceToHave) 
      ? filterSoftSkills(analysis.skillMatch.missingNiceToHave)
      : [];

    return {
      matchScore: Math.min(100, Math.max(0, Math.round(analysis.matchScore ?? 50))),
      skillMatch: {
        score: Math.min(100, Math.max(0, Math.round(analysis.skillMatch?.score ?? 50))),
        matchingMustHave: Array.isArray(analysis.skillMatch?.matchingMustHave) 
          ? analysis.skillMatch.matchingMustHave 
          : [],
        missingMustHave,
        matchingNiceToHave: Array.isArray(analysis.skillMatch?.matchingNiceToHave) 
          ? analysis.skillMatch.matchingNiceToHave 
          : [],
        missingNiceToHave,
      },
      experienceMatch: Boolean(analysis.experienceMatch),
      educationMatch: Boolean(analysis.educationMatch),
      languageMatch: Boolean(analysis.languageMatch),
      matchExplanation: {
        summary: analysis.matchExplanation?.summary || "Match analysis available.",
        strengths: Array.isArray(analysis.matchExplanation?.strengths) 
          ? analysis.matchExplanation.strengths.slice(0, 5) 
          : [],
        gaps: Array.isArray(analysis.matchExplanation?.gaps) 
          ? analysis.matchExplanation.gaps
              .filter((gap: string) => !softSkillsPattern.test(gap))
              .slice(0, 5)
          : [],
        recommendations: Array.isArray(analysis.matchExplanation?.recommendations) 
          ? analysis.matchExplanation.recommendations.slice(0, 5) 
          : [],
        experienceAnalysis: analysis.matchExplanation?.experienceAnalysis,
        skillAnalysis: analysis.matchExplanation?.skillAnalysis 
          ? analysis.matchExplanation.skillAnalysis
              .replace(/problem solving|communication|interpersonal|organizational|attention to detail|teamwork|leadership|time management|adaptability|critical thinking/gi, '')
              .replace(/\b(engineering|software development|development|programming|technical skills|engineering expertise|software engineering|development experience|engineering experience)\b/gi, '')
              .replace(/\s+/g, ' ')
              .trim()
          : undefined,
        titleMatch: analysis.matchExplanation?.titleMatch,
        ats: (() => {
          const rawAts = analysis.matchExplanation?.ats;
          if (!rawAts) {
            console.error("[Job Matching] ⚠️ CRITICAL: LLM response missing 'ats' field!");
            return undefined;
          }
          const validated = validateAtsMatchDetails(rawAts);
          if (!validated) {
            console.error("[Job Matching] ⚠️ CRITICAL: ATS validation failed!");
            return undefined;
          }
          if (cachedAtsHygieneReport) {
            validated.atsHygieneReport = cachedAtsHygieneReport;
            console.log(`[Job Matching] Using cached ATS Hygiene Report for resume`);
          } else if (validated.atsHygieneReport && pageCount !== undefined) {
            validated.atsHygieneReport.lengthCheck = preCalculatedLengthCheck;
            console.log(`[Job Matching] Using pre-calculated lengthCheck: ${preCalculatedLengthCheck.status} (${pageCount} pages, ${userExperienceYears || 0} years experience)`);
          }
          return validated;
        })(),
      },
    };
  } catch (error) {
    console.error("[Job Matching] Failed to parse LLM response:", error);
    console.error("[Job Matching] Raw response:", response);
    throw new Error("Failed to parse LLM match analysis");
  }
}


export async function matchJobsToUser(
  params: MatchJobsParams,
): Promise<JobMatchResult[]> {
  const {
    userId,
    cvEmbedding,
    cvText,
    userSkills,
    userExperienceYears,
    userEducationLevel,
    userLanguages = [],
    userCurrentPosition,
    location,
    role,
    limit = 20,
    minMatchScore = 20, // Lower default for more matches
  } = params;

  // Build WHERE clause for filtering
  const whereClause: any = {
    isProcessed: true,
    analysis: {
      isNot: null,
    },
  };

  if (location) {
    whereClause.location = {
      contains: location,
      mode: "insensitive",
    };
  }

  if (role) {
    whereClause.role = {
      contains: role,
      mode: "insensitive",
    };
  }

 
  const jobs = await (prisma as any).job.findMany({
    where: whereClause,
    include: {
      analysis: true,
    },
    take: 100, 
  });

  if (jobs.length === 0) {
    return [];
  }

  const cacheCutoff = new Date();
  cacheCutoff.setDate(cacheCutoff.getDate() - 7);
  
  const jobIds = jobs.map((j: any) => j.id);
  
  const cachedMatches = await (prisma as any).userJobMatch.findMany({
    where: {
      userId: userId,
      calculatedAt: {
        gte: cacheCutoff,
      },
      jobAnalysis: {
        job: {
          id: {
            in: jobIds,
          },
        },
      },
    },
    include: {
      jobAnalysis: {
        include: {
          job: {
            include: {
              analysis: true,
            },
          },
        },
      },
    },
    orderBy: {
      matchScore: "desc",
    },
  });

  const cachedJobIds = new Set(cachedMatches.map((m: any) => m.jobAnalysis.job.id));
  const allJobsCached = jobIds.slice(0, limit).every((id: string) => cachedJobIds.has(id));
  
  if (cachedMatches.length > 0 && (allJobsCached || cachedMatches.length >= limit)) {
    return cachedMatches.map((match: any) => ({
      job: {
        id: match.jobAnalysis.job.id,
        title: match.jobAnalysis.job.title,
        company: match.jobAnalysis.job.company,
        location: match.jobAnalysis.job.location,
        url: match.jobAnalysis.job.url,
        postedDate: match.jobAnalysis.job.postedDate,
        salaryMin: match.jobAnalysis.job.salaryMin,
        salaryMax: match.jobAnalysis.job.salaryMax,
        salaryCurrency: match.jobAnalysis.job.salaryCurrency,
      },
      analysis: {
        mustHaveSkills: match.jobAnalysis.mustHaveSkills || [],
        niceToHaveSkills: match.jobAnalysis.niceToHaveSkills || [],
        experienceYears: match.jobAnalysis.experienceYears,
        educationLevel: match.jobAnalysis.educationLevel,
        languageRequirements: match.jobAnalysis.languageRequirements || [],
      },
      matchScore: match.matchScore,
      skillMatch: {
        score: match.skillMatchScore,
        matchingMustHave: [],
        missingMustHave: [],
        matchingNiceToHave: [],
        missingNiceToHave: [],
      },
      experienceMatch: match.experienceMatch,
      educationMatch: match.educationMatch,
      languageMatch: match.languageMatch,
      matchExplanation: match.matchExplanation as any,
    }));
  }

  const missingJobIds = jobIds.filter((id: string) => !cachedJobIds.has(id));
  console.log(`[Job Matching] Cache incomplete: ${cachedMatches.length} cached, ${missingJobIds.length} missing - calculating fresh matches with LLM for user ${userId}`);
  
  const commonSkills = new Set([
    "git", "github", "vite", "npm", "yarn",  "agile", "scrum",
    "jira", "confluence", "slack", "docker", "kubernetes", "linux", "unix",
    "rest", "api", "http", "https", "json", "xml", "sql", "nosql"
  ]);
  
  const filterCommonSkills = (skills: string[]): string[] => {
    return skills.filter(skill => {
      const skillLower = skill.toLowerCase();
      return !commonSkills.has(skillLower) && 
             !skillLower.includes("git") && 
             !skillLower.includes("vite") &&
             !skillLower.includes("npm");
    });
  };

  const isRoleCompatible = (userPosition: string | undefined, jobTitle: string): boolean => {
    if (!userPosition) return true; // If no position, allow all
    
    const userLower = userPosition.toLowerCase();
    const jobLower = jobTitle.toLowerCase();
    
    const engineeringRoles = ["engineer", "developer", "programmer", "coder", "architect"];
    const productRoles = ["product owner", "product manager", "po", "pm", "business analyst", "ba"];
    const dataRoles = ["data engineer", "data scientist", "ml engineer", "ai engineer", "analyst"];
    const designRoles = ["designer", "ui/ux", "ux designer", "ui designer"];
    const managementRoles = ["manager", "lead", "director", "head of", "cto", "vp"];
    
    const userIsEngineer = engineeringRoles.some(role => userLower.includes(role));
    const jobIsEngineer = engineeringRoles.some(role => jobLower.includes(role));
    
    const userIsProduct = productRoles.some(role => userLower.includes(role));
    const jobIsProduct = productRoles.some(role => jobLower.includes(role));
    
    const userIsData = dataRoles.some(role => userLower.includes(role));
    const jobIsData = dataRoles.some(role => jobLower.includes(role));
    
    const userIsDesign = designRoles.some(role => userLower.includes(role));
    const jobIsDesign = designRoles.some(role => jobLower.includes(role));
    
    const userIsManagement = managementRoles.some(role => userLower.includes(role));
    const jobIsManagement = managementRoles.some(role => jobLower.includes(role));
    
    if (userIsEngineer && !jobIsEngineer && !jobIsManagement) return false;
    if (userIsProduct && !jobIsProduct && !jobIsManagement) return false;
    if (userIsData && !jobIsData) return false;
    if (userIsDesign && !jobIsDesign) return false;
    
    return true;
  };

  const jobsToProcess = jobs.filter((j: any) => {
    if (!j.analysis) return false;
    if (!missingJobIds.includes(j.id)) return false; // Skip if already cached
    return isRoleCompatible(userCurrentPosition, j.title);
  });

  console.log(`[Job Matching] Pre-filtered ${jobs.length} jobs to ${jobsToProcess.length} compatible roles (${missingJobIds.length - jobsToProcess.length} filtered out due to role mismatch)`);

  const matches: JobMatchResult[] = cachedMatches.map((match: any) => ({
    job: {
      id: match.jobAnalysis.job.id,
      title: match.jobAnalysis.job.title,
      company: match.jobAnalysis.job.company,
      location: match.jobAnalysis.job.location,
      url: match.jobAnalysis.job.url,
      postedDate: match.jobAnalysis.job.postedDate,
      salaryMin: match.jobAnalysis.job.salaryMin,
      salaryMax: match.jobAnalysis.job.salaryMax,
      salaryCurrency: match.jobAnalysis.job.salaryCurrency,
    },
    analysis: {
      mustHaveSkills: match.jobAnalysis.mustHaveSkills || [],
      niceToHaveSkills: match.jobAnalysis.niceToHaveSkills || [],
      experienceYears: match.jobAnalysis.experienceYears,
      educationLevel: match.jobAnalysis.educationLevel,
      languageRequirements: match.jobAnalysis.languageRequirements || [],
    },
    matchScore: match.matchScore,
    skillMatch: {
      score: match.skillMatchScore,
      matchingMustHave: [],
      missingMustHave: [],
      matchingNiceToHave: [],
      missingNiceToHave: [],
    },
    experienceMatch: match.experienceMatch,
    educationMatch: match.educationMatch,
    languageMatch: match.languageMatch,
    matchExplanation: match.matchExplanation as any,
  }));

  let similarityMap = new Map<string, number>();
  
  if (jobsToProcess.length > 0) {
    const embeddingString = `[${cvEmbedding.join(",")}]`;
    const jobsToProcessIds = jobsToProcess.map((j: any) => `'${j.id.replace(/'/g, "''")}'`).join(",");
    
    const similarJobs = await prisma.$queryRawUnsafe<Array<{
      jobId: string;
      similarity: number;
    }>>(
      `SELECT 
        ja."jobId",
        1 - (ja."analysisEmbedding" <=> '${embeddingString}'::vector) as similarity
      FROM "JobAnalysis" ja
      WHERE ja."jobId" = ANY(ARRAY[${jobsToProcessIds}]::text[])
      ORDER BY similarity DESC
      LIMIT ${limit * 2}`
    );

    similarityMap = new Map(
      similarJobs.map((item) => [item.jobId, item.similarity]),
    );
  }

  const batchSize = 5; 

  for (let i = 0; i < jobsToProcess.length; i += batchSize) {
    const batch = jobsToProcess.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (job: any) => {
      try {
        const similarity = similarityMap.get(job.id) || 0;
        
        const filteredMustHave = filterCommonSkills(job.analysis.mustHaveSkills || []);
        const filteredNiceToHave = filterCommonSkills(job.analysis.niceToHaveSkills || []);
        const filteredUserSkills = filterCommonSkills(userSkills);
        
        const analysis = await analyzeJobMatchWithLLM({
          job: {
            ...job,
            analysis: {
              ...job.analysis,
              mustHaveSkills: filteredMustHave,
              niceToHaveSkills: filteredNiceToHave,
            },
          },
          cvText: cvText ? cvText.substring(0, 5000) : undefined, 
          userSkills: filteredUserSkills,
          userExperienceYears,
          userEducationLevel,
          userLanguages,
          userCurrentPosition,
          vectorSimilarity: similarity,
        });

        if (analysis.matchScore >= minMatchScore) {
          return {
            job: {
              id: job.id,
              title: job.title,
              company: job.company,
              location: job.location,
              url: job.url,
              postedDate: job.postedDate,
              salaryMin: job.salaryMin,
              salaryMax: job.salaryMax,
              salaryCurrency: job.salaryCurrency,
            },
            analysis: {
              mustHaveSkills: job.analysis.mustHaveSkills,
              niceToHaveSkills: job.analysis.niceToHaveSkills,
              experienceYears: job.analysis.experienceYears,
              educationLevel: job.analysis.educationLevel,
              languageRequirements: job.analysis.languageRequirements,
            },
            matchScore: analysis.matchScore,
            skillMatch: analysis.skillMatch,
            experienceMatch: analysis.experienceMatch,
            educationMatch: analysis.educationMatch,
            languageMatch: analysis.languageMatch,
            matchExplanation: analysis.matchExplanation,
            _jobAnalysisId: job.id, 
            _similarity: similarity,
          };
        }
        return null;
      } catch (error) {
        console.error(`[Job Matching] Failed to analyze match for job ${job.id}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    
    for (const result of batchResults) {
      if (result) {
        matches.push(result);
        
        (async () => {
          try {
            await (prisma as any).userJobMatch.upsert({
              where: {
                userId_jobId: {
                  userId: userId,
                  jobId: result._jobAnalysisId,
                },
              },
              create: {
                userId: userId,
                jobId: result._jobAnalysisId,
                matchScore: result.matchScore,
                skillMatchScore: result.skillMatch.score,
                titleMatchScore: 50, 
                vectorSimilarity: result._similarity,
                experienceMatch: result.experienceMatch,
                educationMatch: result.educationMatch,
                languageMatch: result.languageMatch,
                matchExplanation: result.matchExplanation as any,
                calculatedAt: new Date(), 
              },
              update: {
                matchScore: result.matchScore,
                skillMatchScore: result.skillMatch.score,
                titleMatchScore: 50,
                vectorSimilarity: result._similarity,
                experienceMatch: result.experienceMatch,
                educationMatch: result.educationMatch,
                languageMatch: result.languageMatch,
                matchExplanation: result.matchExplanation as any,
                calculatedAt: new Date(), 
                updatedAt: new Date(),
              },
            });
          } catch (error) {
            console.error(`[Job Matching] Failed to cache match for job ${result.job.id}:`, error);
          }
        })();
      }
    }
    
    if (i + batchSize < jobsToProcess.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  matches.sort((a, b) => b.matchScore - a.matchScore);

  return matches.slice(0, limit);
}


export async function getUserCVEmbedding(userId: string): Promise<number[] | null> {
  const result = await prisma.$queryRaw<any[]>`
    SELECT "cvEmbedding"::text
    FROM "Resume"
    WHERE "userId" = ${userId}::text
      AND "status" = 'READY'
      AND "cvEmbedding" IS NOT NULL
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;

  if (!result || result.length === 0 || !result[0].cvEmbedding) {
    return null;
  }

  const vectorText = result[0].cvEmbedding;
  try {
    const vectorArray = vectorText
      .replace(/[\[\]]/g, '')
      .split(',')
      .map((v: string) => parseFloat(v.trim()));
    return vectorArray;
  } catch (error) {
    console.error("[Job Matching] Failed to parse CV embedding:", error);
    return null;
  }
}


export async function generateCVEmbeddingIfNeeded(
  userId: string,
  resumeText: string,
): Promise<number[]> {
  const existing = await getUserCVEmbedding(userId);
  if (existing) {
    return existing;
  }

  const embedding = await generateEmbedding(resumeText.substring(0, 8000));

  const resume = await prisma.resume.findFirst({
    where: {
      userId,
      status: "READY",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (resume) {
    await prisma.$executeRaw`
      UPDATE "Resume"
      SET "cvEmbedding" = ${JSON.stringify(embedding)}::vector
      WHERE id = ${resume.id}
    `;
  }

  return embedding;
}

