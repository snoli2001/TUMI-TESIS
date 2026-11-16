import type { ClaimImage } from "@tumi/contracts";

export const IMAGE_LIMIT_BYTES = 4 * 1024 * 1024;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function imageBytes(image: ClaimImage): Buffer | null {
  const cleaned = image.data.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) return null;
  const bytes = Buffer.from(cleaned, "base64");
  if (bytes.length === 0 || bytes.length > IMAGE_LIMIT_BYTES) return null;
  if (image.mediaType === "image/png" && bytes.subarray(0, PNG.length).equals(PNG)) return bytes;
  if (image.mediaType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return bytes;
  if (
    image.mediaType === "image/webp" &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return bytes;
  }
  return null;
}
