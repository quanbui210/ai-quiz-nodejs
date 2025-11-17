export declare function uploadFileToStorage(
  filePath: string,
  fileName: string,
  userId: string,
): Promise<string>;
export declare function downloadFileFromStorage(
  storagePath: string,
  localPath: string,
): Promise<void>;
export declare function deleteFileFromStorage(
  storagePath: string,
): Promise<void>;
export declare function getFileUrl(storagePath: string): string;
export declare function getSignedUrl(
  storagePath: string,
  expiresIn?: number,
): Promise<string>;
//# sourceMappingURL=storage.d.ts.map
