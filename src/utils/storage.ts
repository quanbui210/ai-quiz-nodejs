import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";

const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:55321";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || "documents";


export async function uploadFileToStorage(
  filePath: string,
  fileName: string,
  userId: string,
): Promise<string> {
  try {
    const fileBuffer = await fs.readFile(filePath);

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
  } catch (error: any) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}


export async function downloadFileFromStorage(
  storagePath: string,
  localPath: string,
): Promise<void> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(storagePath);

    if (error) {
      throw new Error(`Failed to download from storage: ${error.message}`);
    }

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(localPath, buffer);
  } catch (error: any) {
    throw new Error(`Storage download failed: ${error.message}`);
  }
}


export async function deleteFileFromStorage(storagePath: string): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (error) {
      throw new Error(`Failed to delete from storage: ${error.message}`);
    }
  } catch (error: any) {
    throw new Error(`Storage delete failed: ${error.message}`);
  }
}

export function getFileUrl(storagePath: string): string {
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
  return data.publicUrl;
}


export async function getSignedUrl(
  storagePath: string,
  expiresIn: number = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

