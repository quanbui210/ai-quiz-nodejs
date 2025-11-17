export interface DocumentChunk {
    text: string;
    index: number;
    metadata?: {
        page?: number;
        section?: string;
        startIndex?: number;
        endIndex?: number;
    };
}
export interface ProcessedDocument {
    text: string;
    chunks: DocumentChunk[];
}
export declare function extractTextFromFile(filePath: string, mimeType: string): Promise<string>;
export declare function chunkText(text: string, chunkSize?: number, chunkOverlap?: number): DocumentChunk[];
export declare function processDocument(filePath: string, mimeType: string, options?: {
    chunkSize?: number;
    chunkOverlap?: number;
}): Promise<ProcessedDocument>;
//# sourceMappingURL=document-processor.d.ts.map