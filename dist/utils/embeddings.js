"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmbedding = generateEmbedding;
exports.generateEmbeddingsBatch = generateEmbeddingsBatch;
exports.getEmbeddingDimensions = getEmbeddingDimensions;
const openai_1 = __importDefault(require("openai"));
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const EMBEDDING_MODEL = "text-embedding-3-small";
async function generateEmbedding(text) {
    try {
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: text,
        });
        return response.data[0]?.embedding || [];
    }
    catch (error) {
        throw new Error(`Failed to generate embedding: ${error.message}`);
    }
}
async function generateEmbeddingsBatch(texts, batchSize = 100) {
    const embeddings = [];
    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        try {
            const response = await openai.embeddings.create({
                model: EMBEDDING_MODEL,
                input: batch,
            });
            const batchEmbeddings = response.data
                .sort((a, b) => a.index - b.index)
                .map((item) => item.embedding);
            embeddings.push(...batchEmbeddings);
        }
        catch (error) {
            throw new Error(`Failed to generate embeddings for batch ${i / batchSize + 1}: ${error.message}`);
        }
    }
    return embeddings;
}
function getEmbeddingDimensions() {
    return EMBEDDING_MODEL === "text-embedding-3-small" ? 1536 : 3072;
}
//# sourceMappingURL=embeddings.js.map