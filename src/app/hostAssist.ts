import { auth, firebaseConfigured } from '../firebase';
import { compressImage } from './imageCompress';

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const user = auth?.currentUser;
  if (!firebaseConfigured || !user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const response = await fetch('/api/host-assist', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  const body = await response.json() as T & { ok: boolean; error?: string };
  if (!response.ok || !body.ok) throw new Error(body.error || 'The assistant is not available right now.');
  return body;
}

const toDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Could not read the photo.'));
  reader.readAsDataURL(file);
});

export interface DescribeResult { description: string; tags: string[]; colors: string[]; source: 'ai' | 'fallback' }

/** A draft product description (and tags and colours) from the first photo and the details already typed. */
export async function suggestDescription(photo: File | null, hints: { name: string; category: string; color: string; size: string }): Promise<DescribeResult> {
  const image = photo ? await toDataUrl(await compressImage(photo, 1000, 0.8)) : '';
  return call<DescribeResult>({ task: 'describe', image, hints });
}

/** A draft WhatsApp reply to a customer message. The host edits and sends it. */
export async function draftReply(input: { message: string; kind?: string; issueType?: string; orderId?: string; status?: string }): Promise<{ reply: string; source: 'ai' | 'fallback' }> {
  return call<{ reply: string; source: 'ai' | 'fallback' }>({ task: 'reply', ...input });
}
