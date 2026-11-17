import { compressImage } from './imageCompress';

// The OCR engine (tesseract.js) is fetched from a CDN only when a customer attaches a payment screenshot,
// so it adds nothing to the normal site download. It runs on the customer's phone; nothing is sent to a server.
// It is loaded with a pinned version. If it cannot load or times out, the customer simply types the UTR.
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';

interface TesseractWorker {
  recognize: (image: File | Blob) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
}
interface TesseractModule {
  createWorker: (lang: string, oem?: number, options?: { logger?: (message: { status: string; progress: number }) => void }) => Promise<TesseractWorker>;
}

export async function readScreenshotText(
  file: File,
  onProgress?: (fraction: number) => void,
  timeoutMs = 40000,
): Promise<string> {
  let worker: TesseractWorker | null = null;
  const work = (async () => {
    const small = await compressImage(file, 1400, 0.85);
    const mod = await import(/* @vite-ignore */ TESSERACT_URL) as unknown as TesseractModule;
    worker = await mod.createWorker('eng', 1, {
      logger: message => {
        if (message.status === 'recognizing text' && onProgress) onProgress(message.progress);
      },
    });
    const { data } = await worker.recognize(small);
    return data.text || '';
  })();
  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error('Reading the screenshot took too long.')), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    const active = worker as TesseractWorker | null;
    if (active) void active.terminate().catch(() => undefined);
  }
}
