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
