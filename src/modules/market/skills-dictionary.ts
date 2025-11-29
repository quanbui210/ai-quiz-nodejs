// Shared skills dictionary for job analysis
// Used for extracting and categorizing skills from job descriptions

export interface SkillDictionaryEntry {
  label: string; // Normalized skill name
  category: "technical" | "soft" | "domain" | "process";
  patterns: RegExp[]; // Regex patterns to match this skill in text
}

export const SKILL_DICTIONARY: SkillDictionaryEntry[] = [
  // Frontend Technologies
  {
    label: "React",
    category: "technical",
    patterns: [
      /react(?:\.js)?/i,
      /reactjs/i,
      /react native/i,
    ],
  },
  {
    label: "Vue.js",
    category: "technical",
    patterns: [/vue\.?js/i, /vue/i],
  },
  {
    label: "Angular",
    category: "technical",
    patterns: [/angular(?:\.js)?/i, /angularjs/i],
  },
  {
    label: "TypeScript",
    category: "technical",
    patterns: [/typescript/i, /\bts\b/i],
  },
  {
    label: "JavaScript",
    category: "technical",
    patterns: [/javascript/i, /\bjs\b/i, /ecmascript/i],
  },
  {
    label: "HTML",
    category: "technical",
    patterns: [/html5?/i, /hypertext markup language/i],
  },
  {
    label: "CSS",
    category: "technical",
    patterns: [/css3?/i, /cascading style sheets/i, /sass/i, /scss/i, /less/i],
  },
  {
    label: "Next.js",
    category: "technical",
    patterns: [/next\.?js/i, /nextjs/i],
  },
  {
    label: "Node.js",
    category: "technical",
    patterns: [/node\.?js/i, /nodejs/i, /\bnode\b/i],
  },
  {
    label: "Express.js",
    category: "technical",
    patterns: [/express\.?js/i, /expressjs/i, /\bexpress\b/i],
  },
  
  // Backend Technologies
  {
    label: "Python",
    category: "technical",
    patterns: [/python/i, /\bpy\b/i],
  },
  {
    label: "Java",
    category: "technical",
    patterns: [/\bjava\b/i],
  },
  {
    label: "C#",
    category: "technical",
    patterns: [/c#/i, /csharp/i],
  },
  {
    label: "Go",
    category: "technical",
    patterns: [/\bgo\b/i, /golang/i],
  },
  {
    label: "Rust",
    category: "technical",
    patterns: [/\brust\b/i],
  },
  
  // Databases
  {
    label: "PostgreSQL",
    category: "technical",
    patterns: [/postgresql/i, /postgres/i],
  },
  {
    label: "MySQL",
    category: "technical",
    patterns: [/mysql/i],
  },
  {
    label: "MongoDB",
    category: "technical",
    patterns: [/mongodb/i, /\bmongo\b/i],
  },
  {
    label: "Redis",
    category: "technical",
    patterns: [/\bredis\b/i],
  },
  
  // DevOps & Cloud
  {
    label: "Docker",
    category: "technical",
    patterns: [/\bdocker\b/i, /containerization/i],
  },
  {
    label: "Kubernetes",
    category: "technical",
    patterns: [/kubernetes/i, /\bk8s\b/i],
  },
  {
    label: "AWS",
    category: "technical",
    patterns: [/aws/i, /amazon web services/i, /\bec2\b/i, /\bs3\b/i],
  },
  {
    label: "Azure",
    category: "technical",
    patterns: [/microsoft azure/i, /\bazure\b/i],
  },
  {
    label: "GCP",
    category: "technical",
    patterns: [/google cloud/i, /\bgcp\b/i, /google cloud platform/i],
  },
  {
    label: "CI/CD",
    category: "process",
    patterns: [/ci\/cd/i, /continuous integration/i, /continuous deployment/i, /jenkins/i, /github actions/i, /gitlab ci/i],
  },
  {
    label: "Linux",
    category: "technical",
    patterns: [/\blinux\b/i, /ubuntu/i, /debian/i],
  },
  
  // Testing
  {
    label: "Testing",
    category: "process",
    patterns: [/testing/i, /\bjest\b/i, /\bmocha\b/i, /\bcypress\b/i, /\bvitest\b/i, /test driven development/i, /\btdd\b/i],
  },
  
  // State Management
  {
    label: "State Management",
    category: "technical",
    patterns: [/state management/i, /\bredux\b/i, /\bmobx\b/i, /\bzustand\b/i, /\brecoil\b/i, /\bxstate\b/i],
  },
  
  // API & GraphQL
  {
    label: "GraphQL",
    category: "technical",
    patterns: [/graphql/i, /\bapollo\b/i, /\brelay\b/i],
  },
  {
    label: "RESTful API",
    category: "technical",
    patterns: [/rest(?:ful)?\s+api/i, /\brest\b/i],
  },
  
  // Soft Skills
  {
    label: "Communication",
    category: "soft",
    patterns: [/communication/i, /communicating/i],
  },
  {
    label: "Teamwork",
    category: "soft",
    patterns: [/teamwork/i, /team player/i, /collaboration/i],
  },
  {
    label: "Leadership",
    category: "soft",
    patterns: [/leadership/i, /leading/i, /team lead/i],
  },
  {
    label: "Problem Solving",
    category: "soft",
    patterns: [/problem solving/i, /problem-solving/i, /analytical/i],
  },
  
  // Data & ML
  {
    label: "Machine Learning",
    category: "domain",
    patterns: [/machine learning/i, /\bml\b/i, /deep learning/i],
  },
  {
    label: "Data Engineering",
    category: "domain",
    patterns: [/data engineering/i, /etl/i, /data pipeline/i],
  },
  {
    label: "SQL",
    category: "technical",
    patterns: [/\bsql\b/i, /structured query language/i],
  },
];

