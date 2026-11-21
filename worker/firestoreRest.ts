// Reads and writes Firestore from the Worker using the signed-in person's own token, so the Firestore security rules
// decide what they may touch. No admin key is stored anywhere.
type FireValue = {
  stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean; nullValue?: null;
  timestampValue?: string; mapValue?: { fields?: Record<string, FireValue> }; arrayValue?: { values?: FireValue[] };
};

export function decodeValue(value: FireValue): unknown {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('mapValue' in value) return decodeFields(value.mapValue?.fields || {});
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeValue);
  return null;
}

export function decodeFields(fields: Record<string, FireValue>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) result[key] = decodeValue(value);
  return result;
}

const base = (projectId: string) => `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

export async function getDocument(projectId: string, path: string, token: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${base(projectId)}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw new Error(`Could not read ${path} (${response.status}).`);
  const body = await response.json() as { fields?: Record<string, FireValue> };
  return decodeFields(body.fields || {});
}

/** Creates a document and returns false if it already exists (this is how duplicates are stopped). */
export async function createDocument(projectId: string, collection: string, documentId: string, data: Record<string, string>, token: string): Promise<boolean> {
  const fields: Record<string, FireValue> = {};
  for (const [key, value] of Object.entries(data)) fields[key] = { stringValue: value };
  const response = await fetch(`${base(projectId)}/${collection}?documentId=${encodeURIComponent(documentId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (response.status === 409) return false;
  if (!response.ok) throw new Error(`Could not record the notification (${response.status}).`);
  return true;
}

/** Lists the documents of a collection that the security rules make public (no sign-in needed). */
export async function listPublicDocuments(projectId: string, collection: string, apiKey?: string): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const result: Array<{ id: string; data: Record<string, unknown> }> = [];
  let pageToken = '';
  for (let page = 0; page < 5; page += 1) {
    const url = `${base(projectId)}/${collection}?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}${apiKey ? `&key=${apiKey}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not list ${collection} (${response.status}).`);
    const body = await response.json() as { documents?: Array<{ name: string; fields?: Record<string, FireValue> }>; nextPageToken?: string };
    for (const doc of body.documents || []) result.push({ id: doc.name.split('/').pop() as string, data: decodeFields(doc.fields || {}) });
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return result;
}

export async function getPublicDocument(projectId: string, path: string, apiKey?: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${base(projectId)}/${path}${apiKey ? `?key=${apiKey}` : ''}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read ${path} (${response.status}).`);
  const body = await response.json() as { fields?: Record<string, FireValue> };
  return decodeFields(body.fields || {});
}

/** Turns plain values into Firestore's REST format (strings, whole numbers, decimals, booleans, lists and maps). */
export function encodeValue(value: unknown): FireValue {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (value && typeof value === 'object') {
    const fields: Record<string, FireValue> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) if (inner !== undefined) fields[key] = encodeValue(inner);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

/** Adds a document with an automatic id using the given sign-in token. */
export async function addDocument(projectId: string, collection: string, data: Record<string, unknown>, token: string): Promise<void> {
  const fields: Record<string, FireValue> = {};
  for (const [key, value] of Object.entries(data)) fields[key] = encodeValue(value);
  const response = await fetch(`${base(projectId)}/${collection}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error(`Could not save to ${collection} (${response.status}).`);
}
