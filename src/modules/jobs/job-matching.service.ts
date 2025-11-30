import prisma from "../../utils/prisma";
import { generateEmbedding } from "../../utils/embeddings";
import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";

const openai = observeOpenAI(
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
);

// Use gpt-3.5-turbo for job matching to avoid rate limits (higher TPM limits)
const DEFAULT_MODEL = process.env.OPENAI_JOB_MATCHING_MODEL || "gpt-3.5-turbo";

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

/**
 * Analyze job match using LLM
 * This replaces manual scoring with AI-powered analysis
 */
async function analyzeJobMatchWithLLM(params: {
  job: any;
  cvText?: string; // CV text content for detailed analysis
  userSkills: string[];
  userExperienceYears?: number;
  userEducationLevel?: string;
  userLanguages: string[];
  userCurrentPosition?: string;
  vectorSimilarity: number;
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
  } = params;

  if (!cvText || cvText.trim().length === 0) {
    console.log(`[Job Matching] CV text is missing or empty for job ${job.id}`);
  } else {
    console.log(`[Job Matching] CV text provided (${cvText.length} chars) for job ${job.id}`);
  }

  // Prepare user profile data
  const userProfile = {
    skills: userSkills,
    experienceYears: userExperienceYears,
    educationLevel: userEducationLevel,
    languages: userLanguages,
    currentPosition: userCurrentPosition,
  };

  // Prepare job requirements
  const jobRequirements = {
    title: job.title,
    company: job.company,
    location: job.location,
    mustHaveSkills: job.analysis.mustHaveSkills || [],
    niceToHaveSkills: job.analysis.niceToHaveSkills || [],
    experienceYears: job.analysis.experienceYears,
    educationLevel: job.analysis.educationLevel,
    languageRequirements: job.analysis.languageRequirements || [],
    description: job.descriptionRaw?.substring(0, 2000) || "", // First 2000 chars for context
  };

  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.3,
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert career match analyst. Analyze how well a candidate's profile matches a job posting and provide a comprehensive match assessment.

CRITICAL: TITLE/ROLE MATCHING IS THE MOST IMPORTANT FACTOR!

STEP 1: FIRST check if the job title matches the candidate's current position/role type, also check for experience level in title.
- If candidate is "Software Engineer", "Frontend Engineer", "Backend Engineer", "Full Stack Developer", "Software Developer" → ONLY match with similar engineering/development roles
- If candidate is "Product Owner", "Product Manager", "Business Analyst" → ONLY match with product/business roles
- If candidate is "Data Engineer", "Data Scientist", "ML Engineer" → ONLY match with data/ML roles
- DO NOT match Software Engineer with Product Owner, Manager, Designer, etc. (different career paths)
- If roles are incompatible (e.g., Engineer vs Product Owner), return matchScore: 0-30 and explain this is a different career path

STEP 2: Only if roles are compatible, then analyze:
1. Calculate a match score (0-100) based on skills, experience, education, language
2. Identify matching and missing skills (must-have and nice-to-have)
3. Assess experience, education, and language matches
4. Generate a detailed explanation with strengths, gaps, and recommendations

RULES: Remember not to assume user's soft skills like "Lack of key required skills like Problem Solving, Communication, Interpersonal skills, Organizational skills, Attention to detail" just because they don't list them in their resume. Note that they could have that. Focus on technical skills, educational level and language skills, experience level and job title.
FOR EXAMPLE, my current position is "Full Stack Developer" and in my resume I listed that I have 2 years of experience in Full Stack Development. But the job title is "Senior Full Stack Developer". In this case, the match score should be 0-45 because the experience level is not matching the job title. If the job title is Product Owner, Mobile Developer, Data Engineer or similar, then the match score should be 0-20 because the role is different.
CRITICAL RULES - SCORING PRIORITY:
1. TITLE/ROLE MATCHING: This is the PRIMARY factor. Incompatible roles = very low score (0-30)
2. EXPERIENCE MATCHING: This is the SECOND MOST IMPORTANT factor after role matching!
   - Experience gap MUST significantly impact the score:
     * 0-1 years gap (meets or slightly below): Can score 70-100
     * 2 years gap: Can score 50-70 (significant penalty)
     * 3 years gap: Can score 30-50 (major penalty)
     * 4+ years gap: Can score 20-40 (very major penalty)
   - A candidate with 2 years experience should ALWAYS score HIGHER for a 3-year role than a 5-year role
   - Example: 2 YOE candidate → 3 YOE role = 55-65%, 5 YOE role = 35-45% (NOT the reverse!)
3. SKILL MATCHING: Important but secondary to experience
4. EDUCATION & LANGUAGE: Supporting factors

SCORING FORMULA (approximate):
- Base score starts from experience match (see above ranges)
- Then adjust based on skill match percentage:
  * 80%+ skills match: +10-15 points
  * 60-79% skills match: +5-10 points
  * 40-59% skills match: 0 points
  * <40% skills match: -5-10 points
- Apply 1.15x motivation boost (cap at 100)
- Final score should reflect: Experience gap is MORE important than skill gaps
- SKILL FILTERING: Ignore common/universal skills like "Git", "Vite", "npm", "yarn", "CI/CD" (every developer has these)
- IGNORE LESS IMPORTANT SKILLS IN GAPS: SOFT SKILLS LIKE "Problem Solving, Communication, Interpersonal skills, Organizational skills, Attention to detail" are not core requirements. Do NOT mention skills like "MUI" (Material-UI), "Jotai", "Zustand", "Redux Toolkit" in gaps - these are minor UI libraries or state management tools, not core requirements. Focus on major gaps only.
- IMPORTANT SKILLS TO CONSIDER: Testing frameworks (Jest, Vitest, Cypress, Playwright, etc.) ARE important and should be mentioned if missing. Core frameworks (React, Vue, Angular), languages (TypeScript, Python, Java), platforms (AWS, Azure, GCP), databases (PostgreSQL, MongoDB) are also important.
- Focus on MAIN/IMPORTANT skills: frameworks, languages, platforms, databases, testing frameworks - NOT minor UI libraries or state management tools
- Vector similarity (0-1) indicates semantic match - factor this into the score
- Provide constructive, positive feedback even for lower matches
- Be specific about which skills match/missing (only important ones)
- Give actionable recommendations

Return JSON with this EXACT structure:
{
  "matchScore": 75, // 0-100 (boosted for motivation)
  "skillMatch": {
    "score": 80, // 0-100
    "matchingMustHave": ["React", "TypeScript"],
    "missingMustHave": ["Docker"],
    "matchingNiceToHave": ["AWS"],
    "missingNiceToHave": ["Kubernetes"]
  },
  "experienceMatch": true, // or false
  "educationMatch": true, // or false
  "languageMatch": true, // or false
  "matchExplanation": {
    "summary": "Strong match (75%). You have most required skills and meet experience requirements.",
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "gaps": ["gap 1", "gap 2"],
    "recommendations": ["recommendation 1", "recommendation 2"],
    "experienceAnalysis": "You have X years of experience, which meets/close to/exceeds the requirement of Y years.",
    "skillAnalysis": "You match X% of must-have skills. Missing: [list]. Matching: [list].",
    "titleMatch": "Role alignment analysis comparing user's current position to job title."
  }
}

Respond ONLY with valid JSON, no markdown, no code blocks.`,
      },
      {
        role: "user",
        content: `Analyze the match between this candidate profile and job posting. START BY CHECKING IF ROLES ARE COMPATIBLE:

CANDIDATE PROFILE:
- Current Position: ${userProfile.currentPosition || "Not specified"}
- Skills: ${userProfile.skills.join(", ") || "None listed"}
- Experience: ${userProfile.experienceYears ? `${userProfile.experienceYears} years` : "Not specified"}
- Education: ${userProfile.educationLevel || "Not specified"}
- Languages: ${userProfile.languages.join(", ") || "Not specified"}
${cvText && cvText.trim().length > 0 ? `\nCANDIDATE CV (excerpt):\n${cvText.substring(0, 5000)}\n` : ""}

JOB POSTING:
- Title: ${jobRequirements.title}
- Company: ${jobRequirements.company || "Not specified"}
- Location: ${jobRequirements.location || "Not specified"}

JOB REQUIREMENTS:
- Must-Have Skills: ${jobRequirements.mustHaveSkills.join(", ") || "None specified"}
- Nice-to-Have Skills: ${jobRequirements.niceToHaveSkills.join(", ") || "None specified"}
- Experience Required: ${jobRequirements.experienceYears ? `${jobRequirements.experienceYears} years` : "Not specified"}

 CRITICAL: Calculate experience gap = (Required Experience) - (Candidate Experience)
- If gap is 3 years (e.g., 2 YOE candidate for 5 YOE role), score MUST be 30-45% (major penalty)
- If gap is 1 year (e.g., 2 YOE candidate for 3 YOE role), score can be 55-70% (moderate penalty)
- Experience gap is MORE important than skill match percentage!
- Education Required: ${jobRequirements.educationLevel || "Not specified"}
- Language Requirements: ${jobRequirements.languageRequirements.join(", ") || "None specified"}

SEMANTIC SIMILARITY: ${(vectorSimilarity * 100).toFixed(1)}% (based on CV/job description similarity)

JOB DESCRIPTION (excerpt):
${jobRequirements.description}

ANALYSIS INSTRUCTIONS:
1. FIRST: Check if "${userProfile.currentPosition || "candidate's role"}" is compatible with "${jobRequirements.title}"
   - If NOT compatible (e.g., Software Engineer vs Product Owner), return matchScore: 0-30 and explain it's a different career path
   - If compatible, proceed to step 2
2. Filter out common skills (Git, Vite, npm, yarn, CI/CD) - focus on MAIN skills only
3. Compare MAIN skills: frameworks, languages, platforms, databases
4. Provide comprehensive match analysis with score, detailed breakdown, and actionable insights.`,
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

    // Validate and ensure all required fields
    return {
      matchScore: Math.min(100, Math.max(0, Math.round(analysis.matchScore || 50))),
      skillMatch: {
        score: Math.min(100, Math.max(0, Math.round(analysis.skillMatch?.score || 50))),
        matchingMustHave: Array.isArray(analysis.skillMatch?.matchingMustHave) 
          ? analysis.skillMatch.matchingMustHave 
          : [],
        missingMustHave: Array.isArray(analysis.skillMatch?.missingMustHave) 
          ? analysis.skillMatch.missingMustHave 
          : [],
        matchingNiceToHave: Array.isArray(analysis.skillMatch?.matchingNiceToHave) 
          ? analysis.skillMatch.matchingNiceToHave 
          : [],
        missingNiceToHave: Array.isArray(analysis.skillMatch?.missingNiceToHave) 
          ? analysis.skillMatch.missingNiceToHave 
          : [],
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
          ? analysis.matchExplanation.gaps.slice(0, 5) 
          : [],
        recommendations: Array.isArray(analysis.matchExplanation?.recommendations) 
          ? analysis.matchExplanation.recommendations.slice(0, 5) 
          : [],
        experienceAnalysis: analysis.matchExplanation?.experienceAnalysis,
        skillAnalysis: analysis.matchExplanation?.skillAnalysis,
        titleMatch: analysis.matchExplanation?.titleMatch,
      },
    };
  } catch (error) {
    console.error("[Job Matching] Failed to parse LLM response:", error);
    console.error("[Job Matching] Raw response:", response);
    throw new Error("Failed to parse LLM match analysis");
  }
}

/**
 * Match user CV to jobs using vector search
 */
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

