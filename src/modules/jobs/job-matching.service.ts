import prisma from "../../utils/prisma";
import { generateEmbedding } from "../../utils/embeddings";
import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";

const openai = observeOpenAI(
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
);

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
    description: job.descriptionRaw?.substring(0, 2000) || "", // First 2000 chars for context
  };

  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.4, 
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert career match analyst. Analyze how well a candidate's profile matches a job posting and provide a nuanced, differentiated match assessment.

CRITICAL: Your goal is to provide PRECISE, DIFFERENTIATED scores that help candidates understand which jobs are better matches. Avoid clustering scores around the same value.

SCORING PHILOSOPHY:
- Use the FULL range 0-100, not just 30-50
- Differentiate clearly between poor (0-30), weak (30-50), moderate (50-70), good (70-85), and excellent (85-100) matches
- Each job should have a UNIQUE score based on its specific requirements vs candidate's profile
- Be nuanced: small differences in fit should result in different scores
- Don't give the same score to multiple jobs.

STEP 1: ROLE COMPATIBILITY CHECK

Role Type Matching (Primary Filter):
- Software/Full Stack/Frontend/Backend Engineer/Developer → Match with similar engineering/dev roles
- Product Owner/Manager, Business Analyst → Match with product/business roles  
- Data Engineer/Scientist, ML/AI Engineer → Match with data/ML/AI roles
- DevOps/Cloud/Security Engineer → Match with infrastructure/security roles
- Designer (UX/UI) → Match with design roles

Role Mismatch Penalties:
- Completely different career path (Engineer → Product Owner): 0-25 points
- Different specialization (Frontend → Data Engineer): 15-35 points
- Related but different (Backend → DevOps): 40-60 points

Seniority Level Matching:
- Job title contains "Senior/Lead/Principal/Staff/Manager/Director/Head" = Leadership role
- Check if candidate's title also indicates this level
- Leadership role without leadership experience: -30 to -50 points penalty
- Overqualified (Senior applying to Junior): Can still score 60-80 if interested in role

STEP 2: EXPERIENCE LEVEL ANALYSIS (High Impact)

Calculate experience gap = |Required YOE - Candidate YOE|

Experience Scoring (use as BASE score):
- Perfect match (0 gap): Start at 85-95
- Slightly under (1 year gap): Start at 70-85
- Moderately under (2 years gap): Start at 55-70
- Significantly under (3 years gap): Start at 40-55
- Very under (4+ years gap): Start at 25-40
- Overqualified (1-2 years over): Start at 75-90 (they can do the job easily)
- Very overqualified (3+ years over): Start at 60-75 (may be bored/overqualified)

STEP 3: SKILL MATCHING (Moderate Impact)

Calculate skill match percentage:
- Must-have skills matched / Total must-have skills = Must-have %
- Nice-to-have skills matched / Total nice-to-have skills = Nice-to-have %

Skill Score Adjustments (add/subtract from base):
- 90-100% must-haves + 70%+ nice-to-haves: +10 to +15 points
- 80-89% must-haves + 50%+ nice-to-haves: +5 to +10 points
- 70-79% must-haves: +0 to +5 points
- 50-69% must-haves: -5 to -10 points
- <50% must-haves: -15 to -25 points

IGNORE these when matching:
- Common tools: Git, GitHub, npm, yarn, Vite, Jira, Slack
- Soft skills: Communication, Problem Solving, Teamwork, Leadership (assumed present)
- Vague terms: "Engineering", "Development", "Programming" (too generic)
- Minor libraries: MUI, Zustand, Jotai (nice but not critical)

STEP 4: ADDITIONAL FACTORS (Minor Impact)

- Education match: +/-5 points
- Language match: +/-5 points  
- Vector similarity bonus: +0 to +10 points (if >0.7 similarity)

STEP 5: FINAL SCORE CALCULATION

1. Start with Experience Base Score (40-95 range)
2. Add/subtract Skill Adjustments (-25 to +15)
3. Add/subtract Role Compatibility (-50 to 0)
4. Add/subtract Additional Factors (-10 to +20)
5. Cap final score at 0-100

IMPORTANT: Each job should have a DIFFERENT score. Don't default to 35 or any single value. Be precise and nuanced.

SKILL FILTERING RULES:
- Only list SPECIFIC, ACTIONABLE technical skills as missing
- Valid: "React", "Python", "Docker", "Kubernetes", "PostgreSQL", "AWS", "TypeScript"
- Invalid: "Engineering", "Development", "Problem Solving", "Communication", "Git"
- Never list soft skills or vague terms

Return JSON with this EXACT structure:
{
  "matchScore": 75, // 0-100 (final calculated score, be precise and varied)
  "skillMatch": {
    "score": 80, // 0-100 (skill match percentage)
    "matchingMustHave": ["React", "TypeScript"],
    "missingMustHave": ["Docker"],
    "matchingNiceToHave": ["AWS"],
    "missingNiceToHave": ["Kubernetes"]
  },
  "experienceMatch": true, // true if within 1-2 years
  "educationMatch": true, // true if meets requirement
  "languageMatch": true, // true if speaks required languages
  "matchExplanation": {
    "summary": "Good match (75%). Strong technical skills with slightly less experience than preferred.",
    "strengths": ["Specific strength 1", "Specific strength 2", "Specific strength 3"],
    "gaps": ["Specific gap 1", "Specific gap 2"],
    "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2"],
    "experienceAnalysis": "You have X years vs Y years required. [Specific analysis]",
    "skillAnalysis": "You match X% of must-have skills. Strong in [areas]. Could improve [areas].",
    "titleMatch": "Your [current role] aligns [well/moderately/poorly] with [job title]. [Specific reasoning]"
  }
}

Respond ONLY with valid JSON, no markdown, no code blocks.`,
      },
      {
        role: "user",
        content: `Analyze the match between this candidate and job posting. Provide a PRECISE, DIFFERENTIATED score (avoid clustering around 35%).

${cvText && cvText.trim().length > 0 ? `CANDIDATE CV (excerpt):\n${cvText.substring(0, 5000)}\n\n` : ""}CANDIDATE PROFILE:
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

ANALYSIS STEPS:
1. Check role compatibility: Is "${userProfile.currentPosition || "candidate's role"}" compatible with "${jobRequirements.title}"?
2. Calculate experience gap: ${userProfile.experienceYears || 0} years vs ${jobRequirements.experienceYears || "unspecified"} required
3. Calculate skill match: What % of must-have and nice-to-have skills does candidate have?
4. Determine final score using the scoring formula (be precise, use full 0-100 range)

REMEMBER:
- Each job should get a UNIQUE score based on its specific fit
- Don't default to 35% or cluster scores
- Use the full scoring range: poor (0-30), weak (30-50), moderate (50-70), good (70-85), excellent (85-100)
- Be nuanced and precise in your assessment`,
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

