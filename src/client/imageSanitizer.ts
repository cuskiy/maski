export interface SanitizedImage {
  readonly file: File;
  readonly width: number;
  readonly height: number;
}

const MAX_DIMENSION = 4096;
const OUTPUT_TYPE = "image/webp";
const OUTPUT_QUALITY = 0.9;

function safeStem(name: string): string {
  const stem = Array.from(name.replace(/\.[^.]+$/u, ""))
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && !'\\/:*?"<>|'.includes(character);
    })
    .join("")
    .trim();
  return (stem === "" ? "image" : stem).slice(0, 80);
}

/**
 * Decodes the image and re-encodes its pixels, which drops EXIF, GPS, camera
 * metadata, and embedded thumbnails without trusting a metadata parser.
 */
export async function stripImageMetadata(file: File): Promise<SanitizedImage> {
  if (file.type === "image/svg+xml" || /\.svg$/iu.test(file.name)) {
    throw new Error("SVG images are not accepted");
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("The image canvas is unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: OUTPUT_TYPE, quality: OUTPUT_QUALITY });
    if (blob.size === 0) throw new Error("The image encoder returned no data");
    return {
      file: new File([blob], `${safeStem(file.name)}.webp`, {
        type: OUTPUT_TYPE,
        lastModified: file.lastModified,
      }),
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}
