import { env } from '@/config/env';
import { err, type AppError } from '@/types/common';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** MIME + size validation before anything touches storage or a vision API. */
export function validateImage(file: File): AppError | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return err(
      'receipt/invalid-type',
      'Ese archivo no parece una foto. Subí una imagen JPG, PNG o WEBP del ticket.',
    );
  }
  const maxBytes = env.maxReceiptSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return err(
      'receipt/too-large',
      `La imagen pesa más de ${env.maxReceiptSizeMb} MB. Sacá la foto con menos resolución o recortala.`,
    );
  }
  if (file.size < 1024) {
    return err('receipt/too-small', 'La imagen está vacía o se cortó la carga. Probá de nuevo.');
  }
  return null;
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No pude leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

export async function fileToBase64(file: Blob): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  return dataUrl.split(',')[1] ?? '';
}

/** Downscales a photo before upload — receipts stay readable at 1600px and cost far less. */
export async function downscaleImage(file: File, maxSize = 1600, quality = 0.85): Promise<Blob> {
  if (typeof document === 'undefined' || !('createElement' in document)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function makeThumbnail(file: File, size = 320): Promise<Blob | null> {
  try {
    const blob = await downscaleImage(file, size, 0.7);
    return blob;
  } catch {
    return null;
  }
}

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
