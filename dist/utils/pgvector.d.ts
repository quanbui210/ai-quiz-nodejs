export declare function storeEmbeddings(
  documentId: string,
  chunks: Array<{
    index: number;
    text: string;
    embedding: number[];
    metadata?: any;
  }>,
): Promise<void>;
export declare function findSimilarChunks(
  documentId: string,
  queryEmbedding: number[],
  limit?: number,
  similarityThreshold?: number,
): Promise<
  Array<{
    id: string;
    chunkIndex: number;
    chunkText: string;
    similarity: number;
    metadata: any;
  }>
>;
export declare function findSimilarChunksAcrossDocuments(
  documentIds: string[],
  queryEmbedding: number[],
  limit?: number,
  similarityThreshold?: number,
): Promise<
  Array<{
    id: string;
    documentId: string;
    chunkIndex: number;
    chunkText: string;
    similarity: number;
    metadata: any;
  }>
>;
export declare function deleteDocumentEmbeddings(
  documentId: string,
): Promise<void>;
//# sourceMappingURL=pgvector.d.ts.map
