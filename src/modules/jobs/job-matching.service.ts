import prisma from "../../utils/prisma";
import { generateEmbedding } from "../../utils/embeddings";

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
  };
}

interface MatchJobsParams {
  userId: string;
  cvEmbedding: number[];
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
 * Calculate skill match score
 */
function calculateSkillMatchScore(
  userSkills: string[],
  mustHaveSkills: string[],
  niceToHaveSkills: string[],
): {
  score: number;
  matchingMustHave: string[];
  missingMustHave: string[];
  matchingNiceToHave: string[];
  missingNiceToHave: string[];
} {
  const userSkillsLower = new Set(userSkills.map((s) => s.toLowerCase().trim()));
  
  // Normalize skill names for comparison
  const normalizeSkill = (skill: string) => skill.toLowerCase().trim();
  
  const matchingMustHave = mustHaveSkills.filter((skill) =>
    userSkillsLower.has(normalizeSkill(skill)),
  );
  const missingMustHave = mustHaveSkills.filter(
    (skill) => !userSkillsLower.has(normalizeSkill(skill)),
  );
  
  const matchingNiceToHave = niceToHaveSkills.filter((skill) =>
    userSkillsLower.has(normalizeSkill(skill)),
  );
  const missingNiceToHave = niceToHaveSkills.filter(
    (skill) => !userSkillsLower.has(normalizeSkill(skill)),
  );
  
  // Calculate score (less strict):
  // - Must-have skills: 60% weight
  // - Nice-to-have skills: 40% weight
  // - Less penalty for missing skills (encourage more matches)
  const mustHaveWeight = 0.6;
  const niceToHaveWeight = 0.4;
  
  const mustHaveScore = mustHaveSkills.length > 0
    ? (matchingMustHave.length / mustHaveSkills.length) * 100
    : 70; // If no must-have skills, give higher neutral score
  
  const niceToHaveScore = niceToHaveSkills.length > 0
    ? (matchingNiceToHave.length / niceToHaveSkills.length) * 100
    : 70;
  
  const baseScore = mustHaveScore * mustHaveWeight + niceToHaveScore * niceToHaveWeight;
  
  // Reduced penalty for missing skills (max 20% instead of 30%)
  // Only penalize if missing more than 50% of must-have skills
  const missingRatio = mustHaveSkills.length > 0 
    ? missingMustHave.length / mustHaveSkills.length 
    : 0;
  const penalty = missingRatio > 0.5 ? Math.min(missingMustHave.length * 3, 20) : 0;
  
  const finalScore = Math.max(0, Math.min(100, baseScore - penalty));
  
  return {
    score: Math.round(finalScore),
    matchingMustHave,
    missingMustHave,
    matchingNiceToHave,
    missingNiceToHave,
  };
}

/**
 * Generate detailed match explanation
 */
function generateMatchExplanation(params: {
  job: any;
  userSkills: string[];
  userExperienceYears: number | undefined;
  userEducationLevel: string | undefined;
  userLanguages: string[];
  userCurrentPosition?: string;
  skillMatch: ReturnType<typeof calculateSkillMatchScore>;
  experienceMatch: boolean;
  experienceScore: number;
  educationMatch: boolean;
  languageMatch: boolean;
  finalScore: number;
}): {
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
  experienceAnalysis?: string;
  skillAnalysis?: string;
  titleMatch?: string;
} {
  const {
    job,
    userSkills,
    userExperienceYears,
    userEducationLevel,
    userLanguages,
    userCurrentPosition,
    skillMatch,
    experienceMatch,
    experienceScore,
    educationMatch,
    languageMatch,
    finalScore,
  } = params;

  const strengths: string[] = [];
  const gaps: string[] = [];
  const recommendations: string[] = [];

  // Job title/role matching analysis
  let titleMatch: string | undefined;
  if (userCurrentPosition && job.title) {
    const userTitleLower = userCurrentPosition.toLowerCase();
    const jobTitleLower = job.title.toLowerCase();
    
    // Check for exact or similar matches
    const isExactMatch = userTitleLower === jobTitleLower;
    const isSimilarMatch = 
      userTitleLower.includes(jobTitleLower) || 
      jobTitleLower.includes(userTitleLower) ||
      // Check for role category matches (e.g., both are "Engineer", "Manager", "Developer")
      (userTitleLower.includes("engineer") && jobTitleLower.includes("engineer")) ||
      (userTitleLower.includes("developer") && jobTitleLower.includes("developer")) ||
      (userTitleLower.includes("manager") && jobTitleLower.includes("manager")) ||
      (userTitleLower.includes("architect") && jobTitleLower.includes("architect"));
    
    // Check for role level mismatches (e.g., "Manager" vs "Engineer")
    const isRoleMismatch = 
      (userTitleLower.includes("manager") && !jobTitleLower.includes("manager") && !jobTitleLower.includes("lead")) ||
      (jobTitleLower.includes("manager") && !userTitleLower.includes("manager") && !userTitleLower.includes("lead")) ||
      (userTitleLower.includes("senior") && jobTitleLower.includes("junior")) ||
      (jobTitleLower.includes("senior") && userTitleLower.includes("junior"));
    
    if (isRoleMismatch) {
      titleMatch = `Role mismatch: This is a ${job.title} position, while your current role is ${userCurrentPosition}. These are different career paths.`;
      gaps.push(`Role mismatch: ${job.title} vs your current ${userCurrentPosition}`);
      recommendations.push(`Consider if you're interested in transitioning to this type of role, or look for positions matching your current role`);
    } else if (isExactMatch || isSimilarMatch) {
      titleMatch = `Good role alignment: This ${job.title} position aligns with your current role as ${userCurrentPosition}.`;
      strengths.push(`Role alignment: ${job.title} matches your current position`);
    } else {
      titleMatch = `Role comparison: This is a ${job.title} position, while your current role is ${userCurrentPosition}.`;
    }
  } else if (job.title) {
    titleMatch = `This is a ${job.title} position.`;
  }

  // Experience analysis (more lenient - 1-2 years is minor, not significant)
  let experienceAnalysis: string | undefined;
  if (job.analysis.experienceYears && userExperienceYears !== undefined) {
    const experienceGap = job.analysis.experienceYears - userExperienceYears;
    
    if (userExperienceYears >= job.analysis.experienceYears) {
      experienceAnalysis = `You have ${userExperienceYears} years of experience, which meets the requirement of ${job.analysis.experienceYears}+ years.`;
      strengths.push(`Meets experience requirement (${userExperienceYears} years)`);
    } else if (experienceGap <= 1) {
      // 1 year or less gap = very minor
      experienceAnalysis = `You have ${userExperienceYears} years of experience, while this role typically requires ${job.analysis.experienceYears} years. This is a very minor gap and should not be a concern.`;
      strengths.push(`Close to experience requirement (${userExperienceYears} vs ${job.analysis.experienceYears} years)`);
    } else if (experienceGap <= 2) {
      // 2 years gap = minor
      experienceAnalysis = `You have ${userExperienceYears} years of experience, while this role typically requires ${job.analysis.experienceYears} years. This is a minor gap.`;
      // Don't add to gaps for minor differences
    } else if (experienceGap <= 3) {
      // 3 years gap = moderate
      experienceAnalysis = `You have ${userExperienceYears} years of experience, while this role typically requires ${job.analysis.experienceYears} years. You're close to the requirement.`;
      // Don't add to gaps, just note it
    } else {
      // 4+ years gap = significant
      experienceAnalysis = `You have ${userExperienceYears} years of experience, while this role typically requires ${job.analysis.experienceYears} years. This is a notable gap.`;
      gaps.push(`Experience gap: ${experienceGap} more years typically expected`);
      recommendations.push(`Consider highlighting transferable experience, relevant projects, or certifications to compensate for the experience gap`);
    }
  } else if (job.analysis.experienceYears) {
    experienceAnalysis = `This role typically requires ${job.analysis.experienceYears} years of experience. Your experience level is not specified.`;
  } else {
    experienceAnalysis = `No specific experience requirement listed for this role.`;
  }

  // Skill analysis
  let skillAnalysis: string | undefined;
  const skillMatchRatio = job.analysis.mustHaveSkills.length > 0
    ? skillMatch.matchingMustHave.length / job.analysis.mustHaveSkills.length
    : 0;
  
  if (skillMatch.matchingMustHave.length > 0) {
    strengths.push(`You have ${skillMatch.matchingMustHave.length} of ${job.analysis.mustHaveSkills.length} required skills: ${skillMatch.matchingMustHave.slice(0, 3).join(", ")}${skillMatch.matchingMustHave.length > 3 ? "..." : ""}`);
    skillAnalysis = `You match ${Math.round(skillMatchRatio * 100)}% of must-have skills (${skillMatch.matchingMustHave.length} out of ${job.analysis.mustHaveSkills.length}).`;
  }
  
  if (skillMatch.missingMustHave.length > 0) {
    gaps.push(`Missing ${skillMatch.missingMustHave.length} must-have skills: ${skillMatch.missingMustHave.slice(0, 3).join(", ")}${skillMatch.missingMustHave.length > 3 ? "..." : ""}`);
    skillAnalysis = (skillAnalysis || "") + ` Missing: ${skillMatch.missingMustHave.slice(0, 3).join(", ")}${skillMatch.missingMustHave.length > 3 ? "..." : ""}.`;
    recommendations.push(`Learn or gain experience with: ${skillMatch.missingMustHave.slice(0, 3).join(", ")}`);
  }
  
  if (skillMatch.matchingNiceToHave.length > 0) {
    strengths.push(`You have ${skillMatch.matchingNiceToHave.length} nice-to-have skills: ${skillMatch.matchingNiceToHave.slice(0, 2).join(", ")}${skillMatch.matchingNiceToHave.length > 2 ? "..." : ""}`);
  }

  // Education analysis
  if (job.analysis.educationLevel) {
    if (educationMatch) {
      strengths.push(`Education requirement met: ${job.analysis.educationLevel}`);
    } else {
      gaps.push(`Education requirement: ${job.analysis.educationLevel} (your level: ${userEducationLevel || "not specified"})`);
      if (!userEducationLevel) {
        recommendations.push(`Consider highlighting relevant coursework, certifications, or self-study equivalent to ${job.analysis.educationLevel}`);
      }
    }
  }

  // Language analysis
  if (job.analysis.languageRequirements.length > 0) {
    if (languageMatch) {
      strengths.push(`Language requirements met: ${job.analysis.languageRequirements.join(", ")}`);
    } else {
      const missingLangs = job.analysis.languageRequirements.filter((l: string) => 
        !userLanguages.some((ul: string) => ul.toLowerCase().includes(l.toLowerCase()))
      );
      if (missingLangs.length > 0) {
        gaps.push(`Missing language requirement: ${missingLangs.join(", ")}`);
        recommendations.push(`Consider improving proficiency in: ${missingLangs.join(", ")}`);
      }
    }
  }

  // Generate summary
  let summary = "";
  if (finalScore >= 70) {
    summary = `Strong match (${finalScore}%). ${strengths.length > 0 ? strengths[0] : "Good overall alignment with job requirements."}`;
  } else if (finalScore >= 50) {
    summary = `Moderate match (${finalScore}%). You have some relevant skills and experience, but there are gaps to address.`;
  } else {
    summary = `Partial match (${finalScore}%). This role has some alignment with your profile, but significant skill or experience gaps exist.`;
  }

  return {
    summary,
    strengths: strengths.slice(0, 5),
    gaps: gaps.slice(0, 5),
    recommendations: recommendations.slice(0, 5),
    experienceAnalysis,
    skillAnalysis,
  };
}

/**
 * Match user CV to jobs using vector search
 */
export async function matchJobsToUser(
  params: MatchJobsParams,
): Promise<JobMatchResult[]> {
  const {
    cvEmbedding,
    userSkills,
    userExperienceYears,
    userEducationLevel,
    userLanguages = [],
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

  // Get jobs with analysis
  // @ts-ignore - Prisma client will be regenerated after schema migration
  const jobs = await (prisma as any).job.findMany({
    where: whereClause,
    include: {
      analysis: true,
    },
    take: 100, // Get more jobs for vector search, then filter
  });

  if (jobs.length === 0) {
    return [];
  }

  // Perform vector similarity search using raw SQL (pgvector)
  // Use $queryRawUnsafe for vector queries (Prisma doesn't support vector types directly)
  const embeddingString = `[${cvEmbedding.join(",")}]`;
  const jobIds = jobs.map((j: any) => `'${j.id.replace(/'/g, "''")}'`).join(",");
  
  const similarJobs = await prisma.$queryRawUnsafe<Array<{
    jobId: string;
    similarity: number;
  }>>(
    `SELECT 
      ja."jobId",
      1 - (ja."analysisEmbedding" <=> '${embeddingString}'::vector) as similarity
    FROM "JobAnalysis" ja
    WHERE ja."jobId" = ANY(ARRAY[${jobIds}]::text[])
    ORDER BY similarity DESC
    LIMIT ${limit * 2}`
  );

  // Create map of jobId -> similarity
  const similarityMap = new Map(
    similarJobs.map((item) => [item.jobId, item.similarity]),
  );

  // Calculate match scores for each job
  const matches: JobMatchResult[] = [];

  for (const job of jobs) {
    if (!job.analysis) continue;

    const similarity = similarityMap.get(job.id) || 0;
    
    // Calculate skill match
    const skillMatch = calculateSkillMatchScore(
      userSkills,
      job.analysis.mustHaveSkills,
      job.analysis.niceToHaveSkills,
    );

    // Check experience match
    const experienceMatch =
      !job.analysis.experienceYears ||
      !userExperienceYears ||
      userExperienceYears >= job.analysis.experienceYears;

    // Check education match (basic check)
    const educationMatch =
      !job.analysis.educationLevel ||
      !userEducationLevel ||
      userEducationLevel.toLowerCase().includes(
        job.analysis.educationLevel.toLowerCase(),
      ) ||
      (job.analysis.educationLevel.toLowerCase().includes("bachelor") &&
        userEducationLevel.toLowerCase().includes("master"));

    // Check language match
    const languageMatch =
      job.analysis.languageRequirements.length === 0 ||
      job.analysis.languageRequirements.some((lang: string) =>
        userLanguages.some(
          (userLang: string) =>
            userLang.toLowerCase().includes(lang.toLowerCase()) ||
            lang.toLowerCase().includes(userLang.toLowerCase()),
        ),
      );

    // Combine scores (less strict, more matches):
    // - Vector similarity: 30% weight (semantic match)
    // - Skill match: 50% weight
    // - Other factors: 20% weight (experience, education, language)
    const vectorScore = similarity * 100; // Convert to 0-100
    const skillScore = skillMatch.score;
    
    // More lenient scoring for experience/education/language
    const experienceScore = !job.analysis.experienceYears || !userExperienceYears
      ? 50 // Neutral if not specified
      : userExperienceYears >= job.analysis.experienceYears
      ? 100
      : userExperienceYears >= job.analysis.experienceYears * 0.7 // 70% of required = still good
      ? 70
      : 30; // Some penalty but not zero
    
    const educationScore = !job.analysis.educationLevel || !userEducationLevel
      ? 50
      : educationMatch ? 100 : 40; // Less penalty for education mismatch
    
    const languageScore = job.analysis.languageRequirements.length === 0
      ? 50
      : languageMatch ? 100 : 20;
    
    const otherScore = (experienceScore + educationScore + languageScore) / 3;

    const finalScore = Math.round(
      vectorScore * 0.3 + skillScore * 0.5 + otherScore * 0.2,
    );

    // Generate detailed match explanation
    const explanation = generateMatchExplanation({
      job,
      userSkills,
      userExperienceYears,
      userEducationLevel,
      userLanguages,
      skillMatch,
      experienceMatch,
      experienceScore,
      educationMatch,
      languageMatch,
      finalScore,
    });

    if (finalScore >= minMatchScore) {
      matches.push({
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
        matchScore: finalScore,
        skillMatch,
        experienceMatch,
        educationMatch,
        languageMatch,
        matchExplanation: explanation,
      });
    }
  }

  // Sort by match score (descending)
  matches.sort((a, b) => b.matchScore - a.matchScore);

  // Return top N matches
  return matches.slice(0, limit);
}

/**
 * Get user CV embedding from resume
 */
export async function getUserCVEmbedding(userId: string): Promise<number[] | null> {
  // Use raw SQL since cvEmbedding is Unsupported type and Prisma client needs regeneration
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

  // Parse vector from text format (PostgreSQL returns vector as text like "[0.1,0.2,...]")
  const vectorText = result[0].cvEmbedding;
  try {
    // Remove brackets and split by comma
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

/**
 * Generate CV embedding from resume text if not exists
 */
export async function generateCVEmbeddingIfNeeded(
  userId: string,
  resumeText: string,
): Promise<number[]> {
  // Check if embedding already exists
  const existing = await getUserCVEmbedding(userId);
  if (existing) {
    return existing;
  }

  // Generate embedding
  const embedding = await generateEmbedding(resumeText.substring(0, 8000));

  // Update resume with embedding
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

