import { api } from "./api.ts";
import type { FileRecord } from "../shared/types.ts";

/** Upload a recipe file. Photos are re-encoded as JPEG no larger than 2000px so uploads stay small. */
export async function uploadFile(file: File): Promise<FileRecord> {
  const form = new FormData();
  form.append("file", file.type.startsWith("image/") ? await downscaleImage(file) : file);
  return api.post<FileRecord>("/api/files", form);
}

async function downscaleImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
