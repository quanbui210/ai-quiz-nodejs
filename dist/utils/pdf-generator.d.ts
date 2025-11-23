import { CareerGoal, CareerTask, CareerResource, CareerMilestone } from "@prisma/client";
interface RoadmapData {
    goal: CareerGoal & {
        tasks: CareerTask[];
        resources: CareerResource[];
        milestones: CareerMilestone[];
    };
}
export declare function generateRoadmapPDF(data: RoadmapData): PDFKit.PDFDocument;
export {};
//# sourceMappingURL=pdf-generator.d.ts.map