/**
 * Photos travel as data URLs (the core's convention for artwork images), so
 * they are downscaled in the browser first: a phone photo of 4–8 MB becomes a
 * crisp JPEG of a few hundred KB that fits the server's limits.
 */
export async function imageToDataUrl(file: File, opts: { maxSide?: number; maxKB?: number } = {}): Promise<string> {
  const maxSide = opts.maxSide ?? 1600;
  const maxBytes = (opts.maxKB ?? 380) * 1024;
  if (!file.type.startsWith("image/")) throw new Error("not-image");

  const bitmap = await loadBitmap(file);
  let side = maxSide;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // JPEG has no alpha — flatten onto white
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    for (const q of [0.86, 0.78, 0.7, 0.6]) {
      const url = canvas.toDataURL("image/jpeg", q);
      if (url.length <= maxBytes) return url;
    }
    side = Math.round(side * 0.75);
  }
  throw new Error("too-large");
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* fall back to <img> (older Safari, HEIC) */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => reject(new Error("unreadable"));
    img.src = url;
  });
}
