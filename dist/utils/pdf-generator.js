"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRoadmapPDF = generateRoadmapPDF;
const pdfkit_1 = __importDefault(require("pdfkit"));
function generateRoadmapPDF(data) {
    const doc = new pdfkit_1.default({ margin: 50, size: "A4" });
    const { goal } = data;
    doc
        .fontSize(24)
        .font("Helvetica-Bold")
        .text("Career Roadmap", { align: "center" })
        .moveDown(0.5);
    doc
        .fontSize(16)
        .font("Helvetica")
        .text(`${goal.currentRole} → ${goal.targetRole}`, { align: "center" })
        .moveDown(1);
    doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .text("Goal Overview", { underline: true })
        .moveDown(0.3);
    doc.fontSize(11).font("Helvetica");
    const goalInfo = [
        `Current Role: ${goal.currentRole}`,
        `Target Role: ${goal.targetRole}`,
        `Timeframe: ${goal.timeframe.replace("_", " ")}`,
        goal.targetDate
            ? `Target Date: ${new Date(goal.targetDate).toLocaleDateString()}`
            : null,
        `Progress: ${goal.progress.toFixed(1)}%`,
    ]
        .filter(Boolean)
        .join("\n");
    doc.text(goalInfo).moveDown(1);
    if (goal.requiredSkills && goal.requiredSkills.length > 0) {
        doc.fontSize(14).font("Helvetica-Bold").text("Required Skills", { underline: true }).moveDown(0.3);
        doc.fontSize(11).font("Helvetica");
        goal.requiredSkills.forEach((skill, index) => {
            doc.text(`${index + 1}. ${skill}`);
        });
        doc.moveDown(1);
    }
    const tasksByPhase = goal.tasks.reduce((acc, task) => {
        if (!acc[task.phase]) {
            acc[task.phase] = [];
        }
        acc[task.phase ?? 0].push(task);
        return acc;
    }, {});
    const phases = Object.keys(tasksByPhase)
        .map(Number)
        .sort((a, b) => a - b);
    phases.forEach((phase) => {
        const phaseTasks = tasksByPhase[phase];
        if (phaseTasks?.length === 0)
            return;
        if (doc.y > 700) {
            doc.addPage();
        }
        doc
            .fontSize(14)
            .font("Helvetica-Bold")
            .text(`Phase ${phase}`, { underline: true })
            .moveDown(0.3);
        phaseTasks?.forEach((task, index) => {
            doc.fontSize(11).font("Helvetica-Bold").text(`${index + 1}. ${task.title}`);
            if (task.description) {
                doc.fontSize(10).font("Helvetica").text(task.description, { indent: 20 });
            }
            const taskDetails = [
                `Type: ${task.taskType.replace("_", " ")}`,
                `Status: ${task.status}`,
                task.estimatedHours ? `Estimated Hours: ${task.estimatedHours}` : null,
                task.dueDate
                    ? `Due: ${new Date(task.dueDate).toLocaleDateString()}`
                    : null,
            ]
                .filter(Boolean)
                .join(" • ");
            doc.fontSize(9).font("Helvetica-Oblique").text(taskDetails, { indent: 20 });
            const taskResources = goal.resources.filter((r) => r.taskId === task.id);
            if (taskResources.length > 0) {
                doc.fontSize(9).font("Helvetica").text("Resources:", { indent: 30 });
                taskResources.forEach((resource) => {
                    doc.text(`  • ${resource.title}`, { indent: 30 });
                    if (resource.url) {
                        doc.fontSize(8).text(`    ${resource.url}`, { indent: 30 });
                    }
                });
            }
            doc.moveDown(0.5);
            if (doc.y > 700) {
                doc.addPage();
            }
        });
        doc.moveDown(0.5);
    });
    if (goal.milestones && goal.milestones.length > 0) {
        if (doc.y > 700) {
            doc.addPage();
        }
        doc
            .fontSize(14)
            .font("Helvetica-Bold")
            .text("Milestones", { underline: true })
            .moveDown(0.3);
        goal.milestones.forEach((milestone) => {
            doc.fontSize(11).font("Helvetica-Bold").text(milestone.title);
            if (milestone.description) {
                doc.fontSize(10).font("Helvetica").text(milestone.description, { indent: 20 });
            }
            doc
                .fontSize(9)
                .font("Helvetica-Oblique")
                .text(`Target: ${new Date(milestone.targetDate).toLocaleDateString()} • ${milestone.isAchieved ? "✓ Achieved" : "Pending"}`, { indent: 20 });
            doc.moveDown(0.5);
        });
    }
    let pageNumber = 0;
    doc.on("pageAdded", () => {
        pageNumber++;
        doc
            .fontSize(8)
            .font("Helvetica")
            .text(`Page ${pageNumber}`, doc.page.width - 50, doc.page.height - 30, { align: "right" });
    });
    doc
        .fontSize(8)
        .font("Helvetica")
        .text("Page 1", doc.page.width - 50, doc.page.height - 30, { align: "right" });
    return doc;
}
//# sourceMappingURL=pdf-generator.js.map