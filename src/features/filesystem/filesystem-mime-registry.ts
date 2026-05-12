/**
 * @file src/features/filesystem/filesystem-mime-registry.ts
 * @description MIME type registry.
 * @author JUNGHO
 * @since 2026-05-02
 */

// Simple MIME type detection based on file extension

// 1. Get MIME type ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getMimeType(filePath: string): string {
  const extension = filePath.toLowerCase().split(".").pop() || "";

  // Image types - only the formats we can display
  const imageTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  };

  // Check if the file is an image
  if (extension in imageTypes) {
    return imageTypes[extension];
  }
  // Default to text/plain for all other files
  return "text/plain";
}

// 2. Is image file ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}
