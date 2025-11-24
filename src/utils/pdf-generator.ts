import PDFDocument from "pdfkit";
import { CareerGoal, CareerTask, CareerResource, CareerMilestone } from "@prisma/client";

interface RoadmapData {
  goal: CareerGoal & {
    tasks: CareerTask[];
    resources: CareerResource[];
    milestones: CareerMilestone[];
  };
}

// Helper to convert hex to RGB (0-1)
function hexToRgb(hex: string | undefined): [number, number, number] {
  if (!hex) return [0, 0, 0];
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  return [
    parseInt(result[1] || '0', 16) / 255,
    parseInt(result[2] || '0', 16) / 255,
    parseInt(result[3] || '0', 16) / 255,
  ];
}

// Color constants (hex, converted to RGB when used)
const COLOR_HEX = {
  primary: "#2563eb", // Blue
  secondary: "#7c3aed", // Purple
  success: "#10b981", // Green
  warning: "#f59e0b", // Orange
  danger: "#ef4444", // Red
  gray: "#6b7280",
  lightGray: "#e5e7eb",
  dark: "#1f2937",
};

const COLORS = {
  primary: hexToRgb(COLOR_HEX.primary),
  secondary: hexToRgb(COLOR_HEX.secondary),
  success: hexToRgb(COLOR_HEX.success),
  warning: hexToRgb(COLOR_HEX.warning),
  danger: hexToRgb(COLOR_HEX.danger),
  gray: hexToRgb(COLOR_HEX.gray),
  lightGray: hexToRgb(COLOR_HEX.lightGray),
  dark: hexToRgb(COLOR_HEX.dark),
};

// Helper to parse JSON fields
function parseJsonField<T>(field: any): T | null {
  if (!field) return null;
  if (typeof field === "string") {
    try {
      return JSON.parse(field) as T;
    } catch {
      return null;
    }
  }
  return field as T;
}

// Helper to get status color
function getStatusColor(status: string): [number, number, number] {
  switch (status) {
    case "COMPLETED":
      return COLORS.success;
    case "IN_PROGRESS":
      return COLORS.warning;
    case "PENDING":
      return COLORS.gray;
    default:
      return COLORS.gray;
  }
}

// Helper to draw a colored box/header
function drawSectionHeader(
  doc: PDFKit.PDFDocument,
  text: string,
  color: [number, number, number] = COLORS.primary,
  y: number = doc.y,
): number {
  const startX = 50;
  const width = doc.page.width - 100;
  const height = 30;

  // Colored background
  doc
    .rect(startX, y, width, height)
    .fillColor(color)
    .fill();

  // White text
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .fillColor([1, 1, 1]) // White
    .text(text, startX + 15, y + 8, {
      width: width - 30,
      align: "left",
    });

  doc.fillColor([0, 0, 0]); // Black
  return y + height + 10;
}

// Helper to draw a card/box
function drawCard(
  doc: PDFKit.PDFDocument,
  content: () => void,
  y: number,
  padding: number = 15,
): number {
  const startX = 50;
  const width = doc.page.width - 100;
  const currentY = y;

  // Draw top border
  doc
    .moveTo(startX, currentY)
    .lineTo(startX + width, currentY)
    .strokeColor(COLORS.lightGray)
    .lineWidth(1)
    .stroke();

  // Save position and draw content
  const savedY = doc.y;
  doc.y = currentY + padding;
  content();
  const endY = doc.y + padding;

  // Draw bottom border
  doc
    .moveTo(startX, endY)
    .lineTo(startX + width, endY)
    .strokeColor(COLORS.lightGray)
    .lineWidth(1)
    .stroke();

  return endY + 10;
}

export function generateRoadmapPDF(data: RoadmapData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const { goal } = data;

  // ===== HEADER SECTION =====
  doc.fillColor(COLORS.primary);
  doc
    .fontSize(28)
    .font("Helvetica-Bold")
    .text("Career Roadmap", { align: "center" })
    .moveDown(0.3);

  doc.fillColor(COLORS.dark);
  doc
    .fontSize(18)
    .font("Helvetica")
    .text(`${goal.currentRole} → ${goal.targetRole}`, { align: "center" })
    .moveDown(1.5);

  // ===== GOAL OVERVIEW CARD =====
  let currentY = doc.y;
  currentY = drawCard(doc, () => {
    doc.fontSize(16).font("Helvetica-Bold").fillColor(COLORS.primary).text("Goal Overview");
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica").fillColor(COLORS.dark);

    const infoItems = [
      { label: "Current Role", value: goal.currentRole },
      { label: "Target Role", value: goal.targetRole },
      { label: "Timeframe", value: goal.timeframe.replace(/_/g, " ") },
      goal.targetDate
        ? { label: "Target Date", value: new Date(goal.targetDate).toLocaleDateString() }
        : null,
      { label: "Progress", value: `${goal.progress.toFixed(1)}%` },
    ].filter(Boolean) as Array<{ label: string; value: string }>;

    infoItems.forEach((item, index) => {
      if (index > 0) doc.moveDown(0.3);
      doc.text(`${item.label}: `, { continued: true }).font("Helvetica-Bold").text(item.value);
      doc.font("Helvetica");
    });
  }, currentY);

  doc.y = currentY;
  doc.moveDown(1);

  // ===== REQUIRED SKILLS SECTION =====
  if (goal.requiredSkills && goal.requiredSkills.length > 0) {
    currentY = drawSectionHeader(doc, "Required Skills", COLORS.secondary, doc.y);
    doc.y = currentY;

    // Skills in a grid-like layout
    const skillsPerRow = 2;
    let skillIndex = 0;
    let skillY = doc.y;

    goal.requiredSkills.forEach((skill, index) => {
      if (index % skillsPerRow === 0 && index > 0) {
        skillY += 25;
        doc.y = skillY;
      }

      const xPos = 50 + (index % skillsPerRow) * ((doc.page.width - 100) / skillsPerRow);
      const width = (doc.page.width - 100) / skillsPerRow - 20;

      // Skill badge
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(COLORS.primary)
        .text(`• ${skill}`, xPos, skillY, { width, align: "left" });
    });

    doc.y = skillY + 30;
    doc.moveDown(1);
    doc.fillColor(COLORS.dark);
  }

  // ===== TASKS BY PHASE =====
  const tasksByPhase = goal.tasks.reduce((acc, task) => {
    if (!acc[task.phase]) {
      acc[task.phase] = [];
    }
    acc[task.phase ?? 0]!.push(task);
    return acc;
  }, {} as Record<number, CareerTask[]>);

  const phases = Object.keys(tasksByPhase)
    .map(Number)
    .sort((a, b) => a - b);

  phases.forEach((phase) => {
    const phaseTasks = tasksByPhase[phase];
    if (phaseTasks?.length === 0) return;

    // Check if we need a new page
    if (doc.y > 650) {
      doc.addPage();
    }

    // Phase Header
    const phaseColorHex = [COLOR_HEX.primary, COLOR_HEX.secondary, "#059669", "#dc2626", "#ea580c"];
    const phaseColor = hexToRgb(phaseColorHex[(phase - 1) % phaseColorHex.length] || COLOR_HEX.primary);
    currentY = drawSectionHeader(doc, `Phase ${phase}`, phaseColor, doc.y);
    doc.y = currentY;

    phaseTasks?.forEach((task, taskIndex) => {
      // Check if we need a new page
      if (doc.y > 700) {
        doc.addPage();
        currentY = doc.y;
      }

      // Task Card
      currentY = drawCard(doc, () => {
        // Task Title and Status
        doc.fontSize(13).font("Helvetica-Bold").fillColor(COLORS.dark).text(`${taskIndex + 1}. ${task.title}`);
        doc.moveDown(0.3);

        // Status Badge
        const statusColor = getStatusColor(task.status);
        doc
          .fontSize(9)
          .font("Helvetica-Bold")
          .fillColor(statusColor)
          .text(`[${task.status.replace("_", " ")}]`, { continued: false });
        doc.fillColor(COLORS.dark);
        doc.moveDown(0.4);

        // Description
        if (task.description) {
          doc.fontSize(10).font("Helvetica").fillColor(COLORS.gray).text(task.description);
          doc.moveDown(0.4);
        }

        // Task Details
        const taskDetails = [
          `Type: ${task.taskType.replace("_", " ")}`,
          task.estimatedHours ? `Hours: ${task.estimatedHours}h` : null,
          task.dueDate ? `Due: ${new Date(task.dueDate).toLocaleDateString()}` : null,
        ]
          .filter(Boolean)
          .join(" • ");

        doc.fontSize(9).font("Helvetica-Oblique").fillColor(COLORS.gray).text(taskDetails);
        doc.fillColor(COLORS.dark);
        doc.moveDown(0.5);

        // Subtopics
        const subtopics = parseJsonField<string[]>((task as any).subtopics);
        if (subtopics && subtopics.length > 0) {
          doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.primary).text("What to Learn:");
          doc.moveDown(0.3);
          doc.fontSize(9).font("Helvetica").fillColor(COLORS.dark);
          subtopics.forEach((subtopic) => {
            doc.text(`  • ${subtopic}`, { indent: 10 });
          });
          doc.moveDown(0.5);
        }

        // Suggested Projects
        const suggestedProjects = parseJsonField<
          Array<{ title: string; description: string; difficulty?: string }>
        >((task as any).suggestedProjects);
        if (suggestedProjects && suggestedProjects.length > 0) {
          doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.secondary).text("Suggested Projects:");
          doc.moveDown(0.3);
          suggestedProjects.forEach((project) => {
            doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.dark).text(`  [PROJECT] ${project.title}`, { indent: 10 });
            doc.fontSize(8).font("Helvetica").fillColor(COLORS.gray).text(`    ${project.description}`, { indent: 20 });
            if (project.difficulty) {
              doc.fontSize(8).font("Helvetica-Oblique").fillColor(COLORS.gray).text(`    Difficulty: ${project.difficulty}`, { indent: 20 });
            }
            doc.moveDown(0.3);
          });
          doc.moveDown(0.3);
        }

        // Resources for this task
        const taskResources = goal.resources.filter((r) => r.taskId === task.id);
        if (taskResources.length > 0) {
          doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.primary).text("Resources:");
          doc.moveDown(0.3);
          doc.fontSize(9).font("Helvetica").fillColor(COLORS.dark);
          taskResources.forEach((resource) => {
            doc.text(`  [RESOURCE] ${resource.title}`, { indent: 10 });
            if (resource.url) {
              doc.fontSize(8).font("Helvetica-Oblique").fillColor(COLORS.primary).text(`    ${resource.url}`, { indent: 20 });
              doc.fillColor(COLORS.dark);
            }
            if (resource.description) {
              doc.fontSize(8).fillColor(COLORS.gray).text(`    ${resource.description}`, { indent: 20 });
            }
          });
        }
      }, doc.y);

      doc.y = currentY;
    });

    doc.moveDown(0.5);
  });

  // ===== MILESTONES SECTION =====
  if (goal.milestones && goal.milestones.length > 0) {
    if (doc.y > 650) {
      doc.addPage();
    }

    currentY = drawSectionHeader(doc, "Milestones", COLORS.success, doc.y);
    doc.y = currentY;

    goal.milestones.forEach((milestone) => {
      if (doc.y > 700) {
        doc.addPage();
        doc.y = 50;
      }

      currentY = drawCard(doc, () => {
        doc.fontSize(12).font("Helvetica-Bold").fillColor(COLORS.dark).text(`[MILESTONE] ${milestone.title}`);
        doc.moveDown(0.3);

        if (milestone.description) {
          doc.fontSize(10).font("Helvetica").fillColor(COLORS.gray).text(milestone.description);
          doc.moveDown(0.3);
        }

        const statusText = milestone.isAchieved ? "[ACHIEVED]" : "[PENDING]";
        const statusColor = milestone.isAchieved ? COLORS.success : COLORS.warning;
        doc
          .fontSize(9)
          .font("Helvetica-Bold")
          .fillColor(statusColor)
          .text(
            `Target: ${new Date(milestone.targetDate).toLocaleDateString()} • ${statusText}`,
          );
      }, doc.y);

      doc.y = currentY;
    });
  }

  // ===== FOOTER =====
  let pageNumber = 0;
  doc.on("pageAdded", () => {
    pageNumber++;
    addFooter(doc, pageNumber);
  });

  // Add footer to first page
  addFooter(doc, 1);

  return doc;
}

function addFooter(doc: PDFKit.PDFDocument, pageNumber: number) {
  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor(COLORS.gray)
    .text(
      `Page ${pageNumber} • Generated by QuizzAI`,
      doc.page.width - 50,
      doc.page.height - 30,
      { align: "right" },
    );
}
