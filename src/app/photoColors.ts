import { suggestColors, type PaletteColor } from '../domain/itemCode';

/** Looks at a small copy of a product photo and suggests its main colours. Returns nothing if the photo cannot be read. */
export async function colorsFromPhoto(file: File): Promise<PaletteColor[]> {
  try {
    if (!file.type.startsWith('image/')) return [];
    const bitmap = await createImageBitmap(file);
    const size = 56;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return [];
    // Use the middle of the photo, where the saree usually is, and ignore the edges.
    const crop = Math.min(bitmap.width, bitmap.height) * 0.8;
    context.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, size, size);
    bitmap.close?.();
    return suggestColors(context.getImageData(0, 0, size, size).data);
  } catch {
    return [];
  }
}
