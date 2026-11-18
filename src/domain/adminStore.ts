// Host management, the audit trail, and deleting order records. Developer and host actions only.
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { CONFIG } from '../config';
import { requireFirestore } from './firestoreStore';
import type { AuditEntry, HostRecord } from './types';

const HOST_ID_PATTERN = /^[A-Za-z0-9_-]{2,24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateHostRecord(input: { email: string; hostId: string; nickname: string }): string {
  if (!EMAIL_PATTERN.test(input.email.trim())) return 'Enter the host Gmail address.';
  if (!HOST_ID_PATTERN.test(input.hostId.trim())) return 'Host ID must be 2 to 24 letters, numbers, - or _ (for example H01).';
  const nickname = input.nickname.trim();
  if (nickname.length < 2 || nickname.length > 30) return 'Nickname must be 2 to 30 characters.';
  return '';
}

const fixedOwners = (): HostRecord[] => CONFIG.ownerEmails.map((email: string) => ({
  email: email.trim().toLowerCase(),
  hostId: 'OWNER',
  nickname: 'Owner',
  active: true,
  fixed: true,
}));

const toRecord = (id: string, data: Record<string, unknown>): HostRecord => ({
  email: id.toLowerCase(),
  hostId: typeof data.hostId === 'string' ? data.hostId : '',
  nickname: typeof data.nickname === 'string' && data.nickname ? data.nickname : id.split('@')[0],
  active: data.active !== false,
  createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
});

export function subscribeHostRecords(onChange: (records: HostRecord[]) => void, onError: (error: Error) => void) {
  const db = requireFirestore();
  return onSnapshot(collection(db, 'hostAccess'), snapshot => {
    const stored = snapshot.docs.map(item => toRecord(item.id, item.data()));
    const fixed = fixedOwners().filter(owner => !stored.some(record => record.email === owner.email));
    onChange([...fixed, ...stored].sort((left, right) => left.email.localeCompare(right.email)));
  }, onError);
}

export async function getMyHostRecord(email: string): Promise<HostRecord | null> {
  const db = requireFirestore();
  const snapshot = await getDoc(doc(db, 'hostAccess', email.toLowerCase()));
  return snapshot.exists() ? toRecord(snapshot.id, snapshot.data()) : null;
}

export async function saveHostRecord(input: { email: string; hostId: string; nickname: string }, createdBy: string): Promise<void> {
  const problem = validateHostRecord(input);
  if (problem) throw new Error(problem);
  const db = requireFirestore();
  const email = input.email.trim().toLowerCase();
  await setDoc(doc(db, 'hostAccess', email), {
    email,
    hostId: input.hostId.trim(),
    nickname: input.nickname.trim(),
    active: true,
    createdAt: new Date().toISOString(),
    createdBy,
  }, { merge: true });
}

export async function setHostActive(email: string, active: boolean): Promise<void> {
  const db = requireFirestore();
  await updateDoc(doc(db, 'hostAccess', email.toLowerCase()), { active });
}

export async function deleteHostRecord(email: string): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, 'hostAccess', email.toLowerCase()));
}

// ---------------------------------------------------------------------------------------------
// Audit trail: every important action records who did it and when. The server time is checked by the
// security rules, so the time cannot be made up by the browser. Entries cannot be edited or deleted.
// ---------------------------------------------------------------------------------------------
export interface AuditActor {
  email: string;
  hostId: string;
  nickname: string;
}

export async function logAudit(actor: AuditActor, action: string, targetType: string, targetId: string, summary: string): Promise<void> {
  const db = requireFirestore();
  await addDoc(collection(db, 'auditLog'), {
    at: new Date().toISOString(),
    serverAt: serverTimestamp(),
    actorEmail: actor.email,
    actorHostId: actor.hostId.slice(0, 24),
    actorNickname: actor.nickname.slice(0, 30),
    action: action.slice(0, 60),
    targetType: targetType.slice(0, 30),
    targetId: targetId.slice(0, 80),
    summary: summary.slice(0, 200),
  });
}

export function subscribeAuditLog(onChange: (entries: AuditEntry[]) => void, onError: (error: Error) => void) {
  const db = requireFirestore();
  return onSnapshot(query(collection(db, 'auditLog'), orderBy('serverAt', 'desc'), limit(100)), snapshot => {
    onChange(snapshot.docs.map(item => ({ ...(item.data() as Omit<AuditEntry, 'id'>), id: item.id })));
  }, onError);
}

// ---------------------------------------------------------------------------------------------
// Deleting order records. A normal delete hides the record from host screens and keeps it (with who and why),
// so it can be restored. Only the developer can remove a record for good.
// ---------------------------------------------------------------------------------------------
export async function softDeleteOrder(orderId: string, byNickname: string, reason: string): Promise<void> {
  const db = requireFirestore();
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'orders', orderId), { deletedAt: now, deletedBy: byNickname, deleteReason: reason.slice(0, 200), updatedAt: now });
}

export async function restoreOrder(orderId: string): Promise<void> {
  const db = requireFirestore();
  await updateDoc(doc(db, 'orders', orderId), { deletedAt: deleteField(), deletedBy: deleteField(), deleteReason: deleteField(), updatedAt: new Date().toISOString() });
}

export async function deleteOrderForever(orderId: string): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, 'orders', orderId));
}
