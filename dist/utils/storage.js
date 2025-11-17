"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFileToStorage = uploadFileToStorage;
exports.downloadFileFromStorage = downloadFileFromStorage;
exports.deleteFileFromStorage = deleteFileFromStorage;
exports.getFileUrl = getFileUrl;
exports.getSignedUrl = getSignedUrl;
const supabase_js_1 = require("@supabase/supabase-js");
const promises_1 = __importDefault(require("fs/promises"));
const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:55321";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || "documents";
async function uploadFileToStorage(filePath, fileName, userId) {
    try {
        const fileBuffer = await promises_1.default.readFile(filePath);
        const storagePath = `${userId}/${Date.now()}-${fileName}`;
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(storagePath, fileBuffer, {
            contentType: "application/octet-stream",
            upsert: false,
        });
        if (error) {
            throw new Error(`Failed to upload to Supabase Storage: ${error.message}`);
        }
        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(storagePath);
        return storagePath;
    }
    catch (error) {
        throw new Error(`Storage upload failed: ${error.message}`);
    }
}
async function downloadFileFromStorage(storagePath, localPath) {
    try {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download(storagePath);
        if (error) {
            throw new Error(`Failed to download from storage: ${error.message}`);
        }
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await promises_1.default.writeFile(localPath, buffer);
    }
    catch (error) {
        throw new Error(`Storage download failed: ${error.message}`);
    }
}
async function deleteFileFromStorage(storagePath) {
    try {
        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([storagePath]);
        if (error) {
            throw new Error(`Failed to delete from storage: ${error.message}`);
        }
    }
    catch (error) {
        throw new Error(`Storage delete failed: ${error.message}`);
    }
}
function getFileUrl(storagePath) {
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
    return data.publicUrl;
}
async function getSignedUrl(storagePath, expiresIn = 3600) {
    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(storagePath, expiresIn);
    if (error) {
        throw new Error(`Failed to create signed URL: ${error.message}`);
    }
    return data.signedUrl;
}
//# sourceMappingURL=storage.js.map