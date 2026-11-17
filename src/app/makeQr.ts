// QR images are drawn by a small library fetched from a CDN only when the payment box opens (pinned version).
// If it cannot load, the payment box falls back to the uploaded QR image and the "open UPI app" button.
const QR_URL = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm';

interface QrModule {
  toDataURL: (text: string, options?: { width?: number; margin?: number; errorCorrectionLevel?: string }) => Promise<string>;
}

let loaded: Promise<QrModule> | null = null;

export async function makeQrDataUrl(text: string, width = 240): Promise<string> {
  if (!loaded) {
    loaded = import(/* @vite-ignore */ QR_URL).then(mod => (mod.default || mod) as QrModule);
    loaded.catch(() => { loaded = null; });
  }
  const qr = await loaded;
  return qr.toDataURL(text, { width, margin: 1, errorCorrectionLevel: 'M' });
}
