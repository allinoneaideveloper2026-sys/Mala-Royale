import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import { CONFIG } from '../config';
import { loadWithCache, writeCache } from './cache';
import { validateRefundDetails } from './refund';
import { isValidUpiId } from './upi';
import { designKeyFor } from './itemCode';
import { mergePages, type SitePages } from './sitePages';
import { activeQuantityByProduct, rejectLine } from './orderItems';
import { DEFAULT_SHIPPING, type CourierDecision, type ShippingConfig } from './shipping';
import { isValidUtr, validateProofFile } from './paymentProof';
import { compressImage } from '../app/imageCompress';
import { firestore } from '../firebase';
import { CourierBill, CustomerAddress, Enquiry, Feedback, FeedbackSentiment, Order, ParcelDetails, PaymentRecord, Consent, KuchuDesign, PincodeCheck, Product, ProductMedia, ProofCheckResult, ProductStatus, SavedDeliveryAddress } from './types';

export function requireFirestore(): Firestore {
  if (!firestore) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* settings first.');
  return firestore;
}

function createId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
}

interface CloudinaryUploadResponse {
  secure_url?: unknown;
  error?: { message?: unknown };
}

async function uploadToCloudinary(file: File, resourceType: 'image' | 'video', presetOverride = ''): Promise<string> {
  const { cloudName } = CONFIG.cloudinary;
  const uploadPreset = presetOverride || CONFIG.cloudinary.uploadPreset;
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`, {
    method: 'POST',
    body: formData,
  });
  let result: CloudinaryUploadResponse;
  try {
    result = await response.json() as CloudinaryUploadResponse;
  } catch {
    throw new Error(`Cloudinary returned an unreadable response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = typeof result.error?.message === 'string' ? result.error.message : `Cloudinary upload failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (typeof result.secure_url !== 'string' || !result.secure_url.startsWith('https://')) {
    throw new Error('Cloudinary did not return a valid secure media URL.');
  }
  return result.secure_url;
}

async function hashPaymentReference(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Customers read the catalog through a short-lived browser cache so a visit costs (at most) one read per
// product, and repeat visits within the TTL cost none. Staff use a live listener so edits appear at once.
const PUBLIC_CACHE_TTL_MS = 10 * 60 * 1000;

export function subscribeProducts(
  onChange: (products: Product[]) => void,
  onError: (error: Error) => void,
  options: { live?: boolean } = {},
) {
  const db = requireFirestore();
  const mapProducts = (docs: Array<{ id: string; data: () => unknown }>) => docs.map(product => ({ ...(product.data() as object), id: product.id } as Product));
  if (!options.live) {
    return loadWithCache<Product[]>({
      key: 'products',
      ttlMs: PUBLIC_CACHE_TTL_MS,
      load: async () => mapProducts((await getDocs(collection(db, 'products'))).docs),
      onChange,
      onError,
    });
  }
  return onSnapshot(collection(db, 'products'), snapshot => {
    const products = mapProducts(snapshot.docs);
    writeCache('products', products);
    onChange(products);
  }, onError);
}

// ---------------------------------------------------------------------------------------------
// Kuchu designs: a common list that sarees can be tagged with. Customers read it (cached); staff see changes live.
// ---------------------------------------------------------------------------------------------
export function subscribeKuchu(onChange: (list: KuchuDesign[]) => void, onError: (error: Error) => void, options: { live?: boolean } = {}) {
  const db = requireFirestore();
  const read = (docs: Array<{ id: string; data: () => unknown }>) => docs.map(item => ({ ...(item.data() as object), id: item.id } as KuchuDesign))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!options.live) {
    return loadWithCache<KuchuDesign[]>({
      key: 'kuchu',
      ttlMs: PUBLIC_CACHE_TTL_MS,
      load: async () => read((await getDocs(collection(db, 'kuchu'))).docs),
      onChange,
      onError,
    });
  }
  return onSnapshot(collection(db, 'kuchu'), snapshot => {
    const list = read(snapshot.docs);
    writeCache('kuchu', list);
    onChange(list);
  }, onError);
}

/** Reads the Kuchu list straight from Firestore (after a price or availability conflict at checkout). */
export async function refreshKuchuFresh(): Promise<KuchuDesign[]> {
  const db = requireFirestore();
  const snapshot = await getDocs(collection(db, 'kuchu'));
  const list = snapshot.docs.map(item => ({ ...(item.data() as object), id: item.id } as KuchuDesign)).sort((left, right) => left.id.localeCompare(right.id));
  writeCache('kuchu', list);
  return list;
}

export async function publishKuchu(kuchu: KuchuDesign): Promise<void> {
  const db = requireFirestore();
  const ref = doc(db, 'kuchu', kuchu.id);
  await runTransaction(db, async transaction => {
    if ((await transaction.get(ref)).exists()) throw new Error(`Kuchu ID ${kuchu.id} is already used.`);
    transaction.set(ref, kuchu);
  });
}

export async function updateKuchu(id: string, changes: { name: string; price: number; active: boolean }): Promise<void> {
  const db = requireFirestore();
  await updateDoc(doc(db, 'kuchu', id), { name: changes.name, price: changes.price, active: changes.active });
}

export async function deleteKuchu(id: string): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, 'kuchu', id));
}

export async function seedInitialProducts(products: Product[]): Promise<void> {
  const db = requireFirestore();
  const existing = await getDocs(collection(db, 'products'));
  if (!existing.empty) return;

  const batch = writeBatch(db);
  products.forEach(product => batch.set(doc(db, 'products', product.id), product));
  await batch.commit();
}

export async function publishProduct(product: Product): Promise<void> {
  const db = requireFirestore();
  // Firestore rejects `undefined` values (for example a blank offer price), so drop them first.
  const data = JSON.parse(JSON.stringify(product)) as Product;
  await setDoc(doc(db, 'products', product.id), data);
}

export async function updateProduct(
  productId: string,
  changes: { name: string; category: string; price: number; offerPrice?: number; quantity: number; status: ProductStatus; itemCode?: string; color?: string; colorCode?: string; size?: string; categoryCode?: string; patternCode?: string; compatibleKuchuIds?: string[] },
): Promise<void> {
  const db = requireFirestore();
  const designKey = designKeyFor(changes.categoryCode || '', changes.patternCode || '');
  await updateDoc(doc(db, 'products', productId), {
    ...(changes.categoryCode !== undefined || changes.patternCode !== undefined ? {
      categoryCode: changes.categoryCode ? changes.categoryCode : deleteField(),
      patternCode: changes.patternCode ? changes.patternCode : deleteField(),
      designKey: designKey ? designKey : deleteField(),
    } : {}),
    ...(changes.compatibleKuchuIds !== undefined ? { compatibleKuchuIds: changes.compatibleKuchuIds } : {}),
    ...(changes.itemCode ? { itemCode: changes.itemCode } : {}),
    ...(changes.color !== undefined ? { color: changes.color, colorCode: changes.colorCode || '' } : {}),
    ...(changes.size !== undefined ? { size: changes.size } : {}),
    name: changes.name,
    category: changes.category,
    price: changes.price,
    offerPrice: changes.offerPrice === undefined ? deleteField() : changes.offerPrice,
    quantity: changes.quantity,
    status: changes.status,
  });
}

export async function deleteProduct(productId: string): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, 'products', productId));
}

export async function uploadProductMedia(files: File[]): Promise<ProductMedia[]> {
  const videos = files.filter(file => file.type.startsWith('video/'));
  const images = files.filter(file => file.type.startsWith('image/'));
  if (files.length !== images.length + videos.length || images.length > 6 || videos.length > 1) {
    throw new Error('Choose up to 6 photos and one product video.');
  }
  return Promise.all(files.map(async file => {
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    if (type === 'image' && (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024)) {
      throw new Error('Each product photo must be an image smaller than 10 MB.');
    }
    if (type === 'video' && (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type) || file.size > 50 * 1024 * 1024)) {
      throw new Error('Use an MP4, WebM, or QuickTime video smaller than 50 MB.');
    }
    return { url: await uploadToCloudinary(file, type), type, name: file.name };
  }));
}

export interface UpiSettings {
  upiId: string;
  payeeName: string;
}

interface CheckoutSettings extends UpiSettings {
  url: string;
  updatedAt?: string;
}

const readCheckoutSettings = (data: Record<string, unknown> | undefined): CheckoutSettings => ({
  url: data ? String(data.paymentQrUrl || '') : '',
  updatedAt: data && typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  upiId: data ? String(data.upiId || '') : '',
  payeeName: data ? String(data.payeeName || '') : '',
});

export function subscribeCheckoutQr(
  onChange: (url: string, updatedAt: string | undefined, upi: UpiSettings) => void,
  onError: (error: Error) => void,
  options: { live?: boolean } = {},
) {
  const db = requireFirestore();
  const read = readCheckoutSettings;
  if (!options.live) {
    return loadWithCache({
      key: 'settings-checkout',
      ttlMs: PUBLIC_CACHE_TTL_MS,
      load: async () => {
        const snapshot = await getDoc(doc(db, 'settings', 'checkout'));
        return read(snapshot.exists() ? snapshot.data() : undefined);
      },
      onChange: value => onChange(value.url, value.updatedAt, { upiId: value.upiId || '', payeeName: value.payeeName || '' }),
      onError,
    });
  }
  return onSnapshot(doc(db, 'settings', 'checkout'), snapshot => {
    const value = read(snapshot.exists() ? snapshot.data() : undefined);
    writeCache('settings-checkout', value);
    onChange(value.url, value.updatedAt, { upiId: value.upiId, payeeName: value.payeeName });
  }, onError);
}

/**
 * Reads the payment QR straight from Firestore (1 read), bypassing the browser cache.
 * Called when a customer is about to pay so they never see an outdated QR.
 */
export async function fetchCheckoutQrFresh(): Promise<CheckoutSettings> {
  const db = requireFirestore();
  const snapshot = await getDoc(doc(db, 'settings', 'checkout'));
  const value = readCheckoutSettings(snapshot.exists() ? snapshot.data() : undefined);
  writeCache('settings-checkout', value);
  return value;
}

// The shop's UPI ID lets checkout make a QR for the exact amount of each order.
// Courier charge rules (A single saree, B Bangalore, C standard). Customers read them at checkout; staff change them.
const readShipping = (data: Record<string, unknown> | undefined): ShippingConfig => ({
  ruleAEnabled: data ? data.ruleAEnabled !== false : DEFAULT_SHIPPING.ruleAEnabled,
  ruleBEnabled: data ? data.ruleBEnabled !== false : DEFAULT_SHIPPING.ruleBEnabled,
  bangalorePrefixes: data && Array.isArray(data.bangalorePrefixes) ? data.bangalorePrefixes.filter((item): item is string => typeof item === 'string') : DEFAULT_SHIPPING.bangalorePrefixes,
});

export function subscribeShippingConfig(onChange: (config: ShippingConfig) => void, onError: (error: Error) => void, options: { live?: boolean } = {}) {
  const db = requireFirestore();
  if (!options.live) {
    return loadWithCache<ShippingConfig>({
      key: 'settings-shipping',
      ttlMs: PUBLIC_CACHE_TTL_MS,
      load: async () => {
        const snapshot = await getDoc(doc(db, 'settings', 'shipping'));
        return readShipping(snapshot.exists() ? snapshot.data() : undefined);
      },
      onChange,
      onError,
    });
  }
  return onSnapshot(doc(db, 'settings', 'shipping'), snapshot => {
    const config = readShipping(snapshot.exists() ? snapshot.data() : undefined);
    writeCache('settings-shipping', config);
    onChange(config);
  }, onError);
}

export async function saveShippingConfig(config: ShippingConfig): Promise<void> {
  const db = requireFirestore();
  await setDoc(doc(db, 'settings', 'shipping'), { ...config, updatedAt: new Date().toISOString() });
}

// Editable site pages (About us, Contact, Terms). Customers read them (cached); only the developer can change them.
export function subscribeSitePages(onChange: (pages: SitePages) => void, onError: (error: Error) => void, options: { live?: boolean } = {}) {
  const db = requireFirestore();
  const read = (data: Record<string, unknown> | undefined) => mergePages(data as Parameters<typeof mergePages>[0]);
  if (!options.live) {
    return loadWithCache<SitePages>({
      key: 'site-pages',
      ttlMs: PUBLIC_CACHE_TTL_MS,
      load: async () => {
        const snapshot = await getDoc(doc(db, 'settings', 'pages'));
        return read(snapshot.exists() ? snapshot.data() : undefined);
      },
      onChange,
      onError,
    });
  }
  return onSnapshot(doc(db, 'settings', 'pages'), snapshot => {
    const pages = read(snapshot.exists() ? snapshot.data() : undefined);
    writeCache('site-pages', pages);
    onChange(pages);
  }, onError);
}

export async function saveSitePages(pages: SitePages): Promise<void> {
  const db = requireFirestore();
  const clean = (value: string, max: number) => value.slice(0, max);
  await setDoc(doc(db, 'settings', 'pages'), {
    about: { title: clean(pages.about.title, 80), body: clean(pages.about.body, 12000) },
    contact: { title: clean(pages.contact.title, 80), body: clean(pages.contact.body, 12000) },
    terms: { title: clean(pages.terms.title, 80), body: clean(pages.terms.body, 20000) },
    updatedAt: new Date().toISOString(),
  });
}

// "Popular right now": a short list of product ids the host publishes from real shopper activity and sales.
export function subscribePopular(onChange: (ids: string[]) => void, onError: (error: Error) => void, options: { live?: boolean } = {}) {
  const db = requireFirestore();
  const read = (data: Record<string, unknown> | undefined) => (data && Array.isArray(data.ids) ? data.ids.filter((id): id is string => typeof id === 'string').slice(0, 12) : []);
  if (!options.live) {
    return loadWithCache<string[]>({
      key: 'popular',
      ttlMs: PUBLIC_CACHE_TTL_MS,
      load: async () => {
        const snapshot = await getDoc(doc(db, 'settings', 'popular'));
        return read(snapshot.exists() ? snapshot.data() : undefined);
      },
      onChange,
      onError,
    });
  }
  return onSnapshot(doc(db, 'settings', 'popular'), snapshot => {
    const ids = read(snapshot.exists() ? snapshot.data() : undefined);
    writeCache('popular', ids);
    onChange(ids);
  }, onError);
}

export async function savePopular(ids: string[]): Promise<void> {
  const db = requireFirestore();
  await setDoc(doc(db, 'settings', 'popular'), { ids: ids.slice(0, 12), updatedAt: new Date().toISOString() });
}

export async function saveUpiSettings(upiId: string, payeeName: string): Promise<void> {
  const db = requireFirestore();
  const cleanId = upiId.trim();
  const cleanName = payeeName.trim();
  if (cleanId && !isValidUpiId(cleanId)) throw new Error('Enter a valid UPI ID, for example yourname@bank.');
  if (cleanId && (!cleanName || cleanName.length > 60)) throw new Error('Enter the name shown on your UPI account (up to 60 characters).');
  await setDoc(doc(db, 'settings', 'checkout'), { upiId: cleanId, payeeName: cleanName, updatedAt: new Date().toISOString() }, { merge: true });
}

// Customer payment screenshot (PhonePe, GPay, ...). Shrunk first, then uploaded; the link is kept on the order.
export async function uploadPaymentProof(file: File): Promise<string> {
  const problem = validateProofFile(file);
  if (problem) throw new Error(problem);
  const smaller = await compressImage(file);
  return uploadToCloudinary(smaller, 'image', CONFIG.cloudinary.proofPreset);
}

export async function uploadCheckoutQr(file: File): Promise<string> {
  const db = requireFirestore();
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file for the payment QR.');
  if (file.size > 5 * 1024 * 1024) throw new Error('The payment QR image must be smaller than 5 MB.');

  const url = await uploadToCloudinary(file, 'image');
  await setDoc(doc(db, 'settings', 'checkout'), { paymentQrUrl: url, updatedAt: new Date().toISOString() }, { merge: true });
  return url;
}

export function subscribeOrders(
  userId: string,
  canManageOrders: boolean,
  onChange: (orders: Order[]) => void,
  onError: (error: Error) => void,
) {
  const db = requireFirestore();
  const orders = collection(db, 'orders');
  const ordersQuery = canManageOrders ? orders : query(orders, where('userId', '==', userId));

  return onSnapshot(ordersQuery, snapshot => {
    const records = snapshot.docs.map(order => ({ ...order.data(), orderId: order.id } as Order));
    records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    onChange(records);
  }, onError);
}

export async function isAuthorizedHost(email: string): Promise<boolean> {
  const db = requireFirestore();
  const host = await getDoc(doc(db, 'hostAccess', email.toLowerCase()));
  // A host switched off by the developer keeps the record but loses access.
  return host.exists() && host.data().active !== false;
}

export function subscribeAuthorizedHosts(onChange: (emails: string[]) => void, onError: (error: Error) => void) {
  const db = requireFirestore();
  return onSnapshot(collection(db, 'hostAccess'), snapshot => {
    const hosts = snapshot.docs.filter(host => host.data().active !== false).map(host => host.id.toLowerCase());
    onChange(Array.from(new Set([...CONFIG.ownerEmails.map((email: string) => email.trim().toLowerCase()), ...hosts])).sort());
  }, onError);
}

export async function authorizeHost(email: string): Promise<void> {
  const db = requireFirestore();
  const normalizedEmail = email.trim().toLowerCase();
  await setDoc(doc(db, 'hostAccess', normalizedEmail), { email: normalizedEmail, active: true }, { merge: true });
}

export async function revokeHost(email: string): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, 'hostAccess', email.trim().toLowerCase()));
}

export async function createCloudOrder(
  userId: string,
  items: Order['items'],
  itemTotal: number,
  address: CustomerAddress,
  courierNoticeAccepted: boolean,
  utr: string,
  screenshotUrl = '',
  proofFingerprint = '',
  proofCheck?: ProofCheckResult,
  courierDecision?: CourierDecision,
  finalSaleAcceptedAt?: string,
  consent?: Consent,
): Promise<Order> {
  const db = requireFirestore();
  if (!courierNoticeAccepted) throw new Error('Courier charge notice must be accepted prior to order placement.');
  if (!isValidUtr(utr)) throw new Error('Enter the 12-digit UTR shown in your payment app.');

  const orderId = `MR-${createId()}`;
  const orderRef = doc(db, 'orders', orderId);
  const referenceId = await hashPaymentReference(utr);
  const paymentRef = doc(db, 'paymentReferences', referenceId);
  const proofRef = proofFingerprint ? doc(db, 'paymentReferences', await hashPaymentReference(`proof:${proofFingerprint}`)) : null;
  const now = new Date().toISOString();
  const itemPayment: PaymentRecord = {
    paymentId: `PAY-${createId()}`,
    kind: 'ITEM',
    amount: itemTotal,
    utr: utr.trim(),
    screenshotUrl,
    verified: false,
    ...(proofCheck ? { proofCheck } : {}),
  };
  const courierFields = {
    ...(courierDecision ? { courierRule: courierDecision.rule, courierWaived: courierDecision.waived, courierRuleReason: courierDecision.reason } : {}),
    ...(finalSaleAcceptedAt ? { finalSaleAcceptedAt } : {}),
    ...(consent ? { consent } : {}),
  };
  const order: Order = {
    orderId,
    userId,
    items,
    itemTotal,
    stage: 'ORDER_RECEIVED',
    isWithheld: false,
    courierNoticeAccepted,
    address,
    itemPayment,
    createdAt: now,
    updatedAt: now,
  };

  // Stock is blocked the moment the order is placed, so two customers can never buy the last piece.
  const stockEntries = totalsByProduct(items);
  await runTransaction(db, async transaction => {
    const existingReference = await transaction.get(paymentRef);
    if (existingReference.exists()) throw new Error('UTR has already been submitted for another order.');
    const existingProof = proofRef ? await transaction.get(proofRef) : null;
    if (existingProof?.exists()) throw new Error('This payment screenshot was already used for another order. Please attach your own payment screenshot.');

    const productSnapshots = await Promise.all(stockEntries.map(([productId]) => transaction.get(doc(db, 'products', productId))));
    const kuchuIds = Array.from(new Set(items.map(item => item.kuchuId).filter((id): id is string => Boolean(id))));
    const kuchuSnapshots = await Promise.all(kuchuIds.map(id => transaction.get(doc(db, 'kuchu', id))));
    const kuchuById = new Map<string, KuchuDesign>();
    kuchuSnapshots.forEach(snapshot => { if (snapshot.exists()) kuchuById.set(snapshot.id, snapshot.data() as KuchuDesign); });
    const productById = new Map<string, Product>();
    productSnapshots.forEach(snapshot => { if (snapshot.exists()) productById.set(snapshot.id, snapshot.data() as Product); });

    // The price on every line must match the live catalog (saree price after offer, plus the chosen Kuchu).
    let checkedTotal = 0;
    for (const line of items) {
      const product = productById.get(line.productId);
      if (!product) continue; // missing products are reported below
      let expected = product.offerPrice || product.price;
      if (line.kuchuId) {
        const kuchu = kuchuById.get(line.kuchuId);
        if (!kuchu || kuchu.active === false || !(product.compatibleKuchuIds || []).includes(line.kuchuId)) {
          throw new Error(`The Kuchu design for "${product.name}" is no longer available. Please choose again.`);
        }
        expected += kuchu.price;
      }
      if (Math.abs(line.price - expected) > 0.005) throw new Error(`The price of "${product.name}" has changed. Please check your cart and try again.`);
      checkedTotal += line.price * line.quantity;
    }
    if (Math.abs(checkedTotal - itemTotal) > 0.005) throw new Error('Your cart total does not match the current prices. Please check your cart and try again.');
    const reservations: Array<{ ref: DocumentReference; quantity: number }> = [];
    productSnapshots.forEach((productSnapshot, index) => {
      if (!productSnapshot.exists()) {
        throw new Error('An item in your cart is no longer available. Please refresh the page and try again.');
      }
      const product = productSnapshot.data() as Product;
      if (product.status === 'COMING_SOON' || product.status === 'OUT_OF_STOCK') {
        throw new Error(`"${product.name}" is not available right now. Please remove it from your cart.`);
      }
      if (typeof product.quantity !== 'number') return;
      const requested = stockEntries[index][1];
      if (product.quantity < requested) {
        throw new Error(product.quantity > 0
          ? `Only ${product.quantity} left of "${product.name}". Please lower the quantity in your cart.`
          : `"${product.name}" has just sold out. Please remove it from your cart.`);
      }
      reservations.push({ ref: productSnapshot.ref, quantity: product.quantity - requested });
    });

    transaction.set(orderRef, { ...order, ...courierFields, stockReserved: true });
    transaction.set(paymentRef, { userId, orderId, createdAt: now });
    if (proofRef) transaction.set(proofRef, { userId, orderId, createdAt: now });
    // lastReservationOrderId lets the security rules confirm this stock change belongs to a brand-new order.
    reservations.forEach(update => transaction.update(update.ref, { quantity: update.quantity, lastReservationOrderId: orderId }));
  });

  return { ...order, ...courierFields, stockReserved: true };
}

function totalsByProduct(items: Order['items']): Array<[string, number]> {
  const totals = new Map<string, number>();
  items.forEach(item => totals.set(item.productId, (totals.get(item.productId) || 0) + item.quantity));
  return Array.from(totals.entries());
}

export async function verifyCloudPayment(orderId: string, kind: 'ITEM' | 'COURIER'): Promise<void> {
  const db = requireFirestore();
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Order not found.');
    const order = snapshot.data() as Order;
    if (order.isWithheld) throw new Error(HOLD_MESSAGE);
    if (kind === 'ITEM' && !order.deliveryConfirmed) {
      throw new Error('Host must confirm the delivery address before confirming payment.');
    }
    const paymentField = kind === 'ITEM' ? 'itemPayment' : 'courierPayment';
    if (!order[paymentField]) return;
    if (order[paymentField]?.verified) return;

    // New orders already blocked their stock when they were placed. Older orders are reduced here, as before.
    const stockUpdates: Array<{ ref: DocumentReference; quantity: number }> = [];
    if (kind === 'ITEM' && !order.stockReserved) {
      const entries = activeQuantityByProduct(order);
      const productSnapshots = await Promise.all(entries.map(([productId]) => transaction.get(doc(db, 'products', productId))));
      productSnapshots.forEach((productSnapshot, index) => {
        if (!productSnapshot.exists()) return;
        const product = productSnapshot.data() as Product;
        if (typeof product.quantity !== 'number') return;
        const requested = entries[index][1];
        if (product.quantity < requested) {
          throw new Error(`Not enough stock for "${product.name}" (${product.quantity} left, ${requested} ordered). Restock it, or mark the order as not accepted.`);
        }
        stockUpdates.push({ ref: productSnapshot.ref, quantity: product.quantity - requested });
      });
    }

    transaction.update(orderRef, {
      [`${paymentField}.verified`]: true,
      stage: kind === 'ITEM' ? 'ITEM_PAYMENT_VERIFIED' : 'COURIER_CHARGE_VERIFIED',
      updatedAt: new Date().toISOString(),
    });
    stockUpdates.forEach(update => transaction.update(update.ref, { quantity: update.quantity }));
  });
}

export async function attachCloudCourierBill(orderId: string, bill: Omit<CourierBill, 'billId'>): Promise<void> {
  const db = requireFirestore();
  if (!Number.isFinite(bill.amount) || bill.amount <= 0) throw new Error('Courier amount must be greater than zero.');
  await updateDoc(doc(db, 'orders', orderId), {
    courierBill: { ...bill, billId: `CB-${createId()}` },
    courierPayment: deleteField(),
    stage: 'COURIER_RECEIPT_UPLOADED',
    updatedAt: new Date().toISOString(),
  });
}

export async function submitCloudCourierPayment(orderId: string, userId: string, utr: string, screenshotUrl = '', proofFingerprint = ''): Promise<void> {
  const db = requireFirestore();
  const normalizedUtr = utr.trim();
  if (!/^\d{12}$/.test(normalizedUtr)) throw new Error('Enter the 12-digit courier payment UTR.');
  const orderRef = doc(db, 'orders', orderId);
  const referenceId = await hashPaymentReference(normalizedUtr);
  const paymentRef = doc(db, 'paymentReferences', referenceId);
  const proofRef = proofFingerprint ? doc(db, 'paymentReferences', await hashPaymentReference(`proof:${proofFingerprint}`)) : null;
  const now = new Date().toISOString();

  await runTransaction(db, async transaction => {
    const [orderSnapshot, referenceSnapshot] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(paymentRef),
    ]);
    if (!orderSnapshot.exists()) throw new Error('Order not found.');
    if (referenceSnapshot.exists()) throw new Error('UTR has already been submitted for another payment.');
    const proofSnapshot = proofRef ? await transaction.get(proofRef) : null;
    if (proofSnapshot?.exists()) throw new Error('This payment screenshot was already used for another payment. Please attach your own payment screenshot.');
    const order = orderSnapshot.data() as Order;
    if (order.userId !== userId) throw new Error('This order does not belong to your account.');
    if (!order.courierBill) throw new Error('The host has not added a courier charge yet.');
    if (order.courierPayment) throw new Error('Courier payment has already been submitted.');

    const payment: PaymentRecord = {
      paymentId: `PAY-${createId()}`,
      kind: 'COURIER',
      amount: order.courierBill.amount,
      utr: normalizedUtr,
      screenshotUrl,
      verified: false,
      submittedAt: now,
    };
    transaction.update(orderRef, { courierPayment: payment, updatedAt: now });
    transaction.set(paymentRef, { userId, orderId, createdAt: now });
    if (proofRef) transaction.set(proofRef, { userId, orderId, createdAt: now });
  });
}

const HOLD_MESSAGE = 'This order is on hold. Release the hold first.';

export async function holdCloudOrder(orderId: string, email: string, reason: string, note: string): Promise<void> {
  const db = requireFirestore();
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Order not found.');
    const order = snapshot.data() as Order;
    if (['NOT_ACCEPTED', 'CANCELLED', 'DELIVERED', 'SUBMITTED_FOR_DISPATCH'].includes(order.stage)) throw new Error('This order can no longer be put on hold.');
    const now = new Date().toISOString();
    transaction.update(orderRef, { isWithheld: true, holdReason: reason.slice(0, 120), holdNote: note.slice(0, 400), heldAt: now, heldBy: email, updatedAt: now });
  });
}

export async function releaseCloudOrderHold(orderId: string): Promise<void> {
  const db = requireFirestore();
  await updateDoc(doc(db, 'orders', orderId), { isWithheld: false, holdReason: '', holdNote: '', updatedAt: new Date().toISOString() });
}

// Rejects one item of an order (for example a damaged piece) without cancelling the rest.
// The item's stock is put back and the amount to refund is worked out; the customer is asked for refund details.
export async function rejectCloudOrderItem(orderId: string, index: number, byNickname: string, reason: string, note: string): Promise<void> {
  const db = requireFirestore();
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Order not found.');
    const order = snapshot.data() as Order;
    const now = new Date().toISOString();
    const result = rejectLine(order, index, reason, note, byNickname, now);
    if ('error' in result) throw new Error(result.error);
    const line = result.rejectedLine;

    // Put this item's stock back (stock was blocked when the order was placed, or when payment was confirmed on older orders).
    let restock: { ref: DocumentReference; quantity: number } | null = null;
    if (order.stockReserved || order.itemPayment?.verified) {
      const productRef = doc(db, 'products', line.productId);
      const productSnapshot = await transaction.get(productRef);
      if (productSnapshot.exists()) {
        const quantity = (productSnapshot.data() as Product).quantity;
        if (typeof quantity === 'number') restock = { ref: productRef, quantity: quantity + line.quantity };
      }
    }
    transaction.update(orderRef, {
      items: result.items,
      rejectedTotal: result.rejectedTotal,
      refundDue: order.itemPayment ? result.rejectedTotal : 0,
      updatedAt: now,
    });
    if (restock) transaction.update(restock.ref, { quantity: restock.quantity });
  });
}

export async function submitCloudOrderForDispatch(orderId: string): Promise<void> {
  const db = requireFirestore();
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Order not found.');
    const order = snapshot.data() as Order;
    if (order.isWithheld) throw new Error(HOLD_MESSAGE);
    if (order.courierBill && !order.courierPayment?.verified) {
      throw new Error('Courier payment must be confirmed before dispatch.');
    }
    transaction.update(orderRef, { stage: 'SUBMITTED_FOR_DISPATCH', updatedAt: new Date().toISOString() });
  });
}

export async function markCloudOrderNotAccepted(orderId: string, reason = '', note = ''): Promise<void> {
  const db = requireFirestore();
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Order not found.');
    const order = snapshot.data() as Order;
    if (order.stage === 'NOT_ACCEPTED') return;

    // Put the blocked stock back (stock is blocked when the order is placed; older orders when payment was confirmed).
    const restocks: Array<{ ref: DocumentReference; quantity: number }> = [];
    if (order.stockReserved || order.itemPayment?.verified) {
      const entries = activeQuantityByProduct(order);
      const productSnapshots = await Promise.all(entries.map(([productId]) => transaction.get(doc(db, 'products', productId))));
      productSnapshots.forEach((productSnapshot, index) => {
        if (!productSnapshot.exists()) return;
        const product = productSnapshot.data() as Product;
        if (typeof product.quantity !== 'number') return;
        restocks.push({ ref: productSnapshot.ref, quantity: product.quantity + entries[index][1] });
      });
    }

    transaction.update(orderRef, {
      stage: 'NOT_ACCEPTED',
      rejectionReason: reason,
      rejectionNote: note,
      updatedAt: new Date().toISOString(),
    });
    restocks.forEach(update => transaction.update(update.ref, { quantity: update.quantity }));
  });
}

export async function markCloudOrderDelivered(orderId: string): Promise<void> {
  const db = requireFirestore();
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Order not found.');
    if ((snapshot.data() as Order).isWithheld) throw new Error(HOLD_MESSAGE);
    if ((snapshot.data() as Order).stage !== 'SUBMITTED_FOR_DISPATCH') {
      throw new Error('Only dispatched orders can be marked delivered.');
    }
    transaction.update(orderRef, { stage: 'DELIVERED', updatedAt: new Date().toISOString() });
  });
}

export async function saveCloudParcelDetails(orderId: string, parcelDetails: ParcelDetails): Promise<void> {
  const db = requireFirestore();
  await updateDoc(doc(db, 'orders', orderId), {
    parcelDetails,
    updatedAt: parcelDetails.savedAt,
  });
}

export function subscribeSavedAddresses(
  userId: string,
  onChange: (addresses: SavedDeliveryAddress[]) => void,
  onError: (error: Error) => void,
) {
  const db = requireFirestore();
  return onSnapshot(collection(db, 'users', userId, 'addresses'), snapshot => {
    onChange(snapshot.docs.map(address => ({ ...address.data(), id: address.id } as SavedDeliveryAddress)));
  }, onError);
}

export async function saveCloudDeliveryAddress(userId: string, address: SavedDeliveryAddress): Promise<void> {
  const db = requireFirestore();
  const { id, ...deliveryAddress } = address;
  await setDoc(doc(db, 'users', userId, 'addresses', id), deliveryAddress);
}

export async function deleteCloudDeliveryAddress(userId: string, addressId: string): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, 'users', userId, 'addresses', addressId));
}

export async function checkDeliveryPincode(pincode: string): Promise<PincodeCheck> {
  const normalizedPincode = pincode.trim();
  const checkedAt = new Date().toISOString();
  if (!/^\d{6}$/.test(normalizedPincode)) {
    return { status: 'NOT_FOUND', provider: 'Local validation', message: 'Enter a valid 6-digit Indian pincode.', checkedAt };
  }

  if (CONFIG.pincodeProxyUrl) {
    try {
      const response = await fetch(CONFIG.pincodeProxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pincode: normalizedPincode }),
      });
      if (!response.ok) throw new Error(`Courier lookup failed (${response.status}).`);
      const result = await response.json() as { serviceable?: boolean; provider?: string; message?: string; district?: string; state?: string; taluk?: string };
      if (typeof result.serviceable !== 'boolean') throw new Error('Courier lookup response must include a serviceable boolean.');
      return {
        status: result.serviceable ? 'SERVICEABLE' : 'NOT_SERVICEABLE',
        provider: result.provider || 'Courier serviceability provider',
        message: result.message || (result.serviceable ? 'Courier service reports this pincode as serviceable.' : 'Courier service reports this pincode as not serviceable.'),
        checkedAt,
        district: result.district,
        state: result.state,
        taluk: result.taluk,
      };
    } catch (error) {
      return { status: 'UNAVAILABLE', provider: 'Courier serviceability proxy', message: error instanceof Error ? error.message : 'Courier pincode lookup failed.', checkedAt };
    }
  }

  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${normalizedPincode}`);
    if (!response.ok) throw new Error('Postal lookup is temporarily unavailable.');
    const result = await response.json() as Array<{ Status?: string; Message?: string; PostOffice?: Array<{ District?: string; State?: string; Block?: string }> | null }>;
    const postalData = result[0];
    const office = postalData?.PostOffice?.[0];
    if (postalData?.Status !== 'Success' || !office) {
      return { status: 'NOT_FOUND', provider: 'India Post postal lookup', message: 'No postal area was found for this pincode.', checkedAt };
    }
    return {
      status: 'POSTAL_CODE_FOUND',
      provider: 'India Post postal lookup',
      message: 'Postal area found. The host must still confirm courier delivery availability.',
      checkedAt,
      district: office.District,
      state: office.State,
      taluk: office.Block,
    };
  } catch (error) {
    return { status: 'UNAVAILABLE', provider: 'India Post postal lookup', message: error instanceof Error ? error.message : 'Postal lookup failed.', checkedAt };
  }
}

export async function confirmCloudOrderDelivery(orderId: string, email: string): Promise<void> {
  const db = requireFirestore();
  const orderRef = doc(db, 'orders', orderId);
  const snapshot = await getDoc(orderRef);
  if (!snapshot.exists()) throw new Error('Order not found.');
  const order = snapshot.data() as Order;
  if (order.isWithheld) throw new Error(HOLD_MESSAGE);
  if (!order.address.pincodeCheck) throw new Error('Run an online pincode check before confirming delivery.');
  if (['NOT_FOUND', 'NOT_SERVICEABLE'].includes(order.address.pincodeCheck.status)) {
    throw new Error('This pincode is not confirmed as deliverable.');
  }
  await updateDoc(orderRef, {
    deliveryConfirmed: true,
    deliveryConfirmedAt: new Date().toISOString(),
    deliveryConfirmedBy: email,
    updatedAt: new Date().toISOString(),
  });
}

export function isConfiguredDeveloper(email: string): boolean {
  return CONFIG.developerEmails.some((developer: string) => developer.trim().toLowerCase() === email.toLowerCase());
}

export function isConfiguredOwner(email: string): boolean {
  return CONFIG.ownerEmails.some((owner: string) => owner.trim().toLowerCase() === email.toLowerCase());
}

export interface EnquiryInput {
  name: string;
  phone: string;
  message: string;
  productId?: string;
  productName?: string;
  kind?: 'PAYMENT_ISSUE';
  orderId?: string;
  issueType?: string;
}

export async function submitEnquiry(userId: string, input: EnquiryInput): Promise<void> {
  const db = requireFirestore();
  const name = input.name.trim();
  const phone = input.phone.replace(/\D/g, '');
  const message = input.message.trim();
  if (!name || name.length > 80) throw new Error('Enter your name (up to 80 characters).');
  if (!/^\d{10,15}$/.test(phone)) throw new Error('Enter a valid WhatsApp number.');
  if (!message || message.length > 1000) throw new Error('Enter your message (up to 1000 characters).');

  const data: Omit<Enquiry, 'id'> = {
    userId,
    name,
    phone,
    message,
    status: 'NEW',
    createdAt: new Date().toISOString(),
    ...(input.productId ? { productId: input.productId } : {}),
    ...(input.productName ? { productName: input.productName.slice(0, 120) } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.orderId ? { orderId: input.orderId.slice(0, 40) } : {}),
    ...(input.issueType ? { issueType: input.issueType.slice(0, 80) } : {}),
  };
  await setDoc(doc(db, 'enquiries', `ENQ-${createId()}`), data);
}

export function subscribeEnquiries(onChange: (enquiries: Enquiry[]) => void, onError: (error: Error) => void) {
  const db = requireFirestore();
  return onSnapshot(collection(db, 'enquiries'), snapshot => {
    onChange(snapshot.docs.map(enquiry => ({ ...enquiry.data(), id: enquiry.id } as Enquiry)));
  }, onError);
}

export async function setEnquiryStatus(enquiryId: string, status: 'NEW' | 'REPLIED'): Promise<void> {
  const db = requireFirestore();
  await updateDoc(doc(db, 'enquiries', enquiryId), { status });
}

export async function deleteEnquiry(enquiryId: string): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, 'enquiries', enquiryId));
}

export function subscribeCategories(
  onChange: (categories: string[]) => void,
  onError: (error: Error) => void,
  options: { live?: boolean } = {},
) {
  const db = requireFirestore();
  const read = (list: unknown) => (Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : []);
  if (!options.live) {
    return loadWithCache<string[]>({
      key: 'settings-categories',
      ttlMs: PUBLIC_CACHE_TTL_MS,
      load: async () => {
        const snapshot = await getDoc(doc(db, 'settings', 'categories'));
        return read(snapshot.exists() ? snapshot.data().list : []);
      },
      onChange,
      onError,
    });
  }
  return onSnapshot(doc(db, 'settings', 'categories'), snapshot => {
    const categories = read(snapshot.exists() ? snapshot.data().list : []);
    writeCache('settings-categories', categories);
    onChange(categories);
  }, onError);
}

export async function saveCategories(categories: string[]): Promise<void> {
  const db = requireFirestore();
  await setDoc(doc(db, 'settings', 'categories'), { list: categories, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function updateOrderDelivery(orderId: string, deliveryPartner: string, deliveryComments: string): Promise<void> {
  const db = requireFirestore();
  await updateDoc(doc(db, 'orders', orderId), {
    deliveryPartner,
    deliveryComments,
    updatedAt: new Date().toISOString(),
  });
}

// The assistant's learned insight weights are private to the host and developer.
export function subscribeAiMemory(onChange: (weights: Record<string, number>) => void, onError: (error: Error) => void) {
  const db = requireFirestore();
  return onSnapshot(doc(db, 'hostPrivate', 'aiMemory'), snapshot => {
    const raw = snapshot.exists() ? snapshot.data().weights : {};
    const weights: Record<string, number> = {};
    if (raw && typeof raw === 'object') {
      Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
        if (typeof value === 'number' && Number.isFinite(value)) weights[key] = value;
      });
    }
    onChange(weights);
  }, onError);
}

// The customer tells us where to send the refund after the host cancels (does not accept) the order.
export async function submitRefundDetails(orderId: string, method: 'UPI_ID' | 'UPI_PHONE', value: string): Promise<void> {
  const problem = validateRefundDetails(method, value);
  if (problem) throw new Error(problem);
  const db = requireFirestore();
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'orders', orderId), {
    refundDetails: { method, value: value.trim(), submittedAt: now },
    updatedAt: now,
  });
}

/** Reads the whole catalog straight from Firestore and refreshes the browser copy (used after a stock conflict). */
export async function refreshProductsFresh(): Promise<Product[]> {
  const db = requireFirestore();
  const snapshot = await getDocs(collection(db, 'products'));
  const products = snapshot.docs.map(item => ({ ...(item.data() as object), id: item.id } as Product));
  writeCache('products', products);
  return products;
}

/** Keeps the customer's browser copy of the catalog in step after their own order changed stock. */
export function cacheProducts(products: Product[]): void {
  writeCache('products', products);
}

// Developer-only: forgets everything the assistant learned from thumbs up / down.
export async function resetAiMemory(): Promise<void> {
  const db = requireFirestore();
  await setDoc(doc(db, 'hostPrivate', 'aiMemory'), { weights: {}, updatedAt: new Date().toISOString(), resetAt: new Date().toISOString() });
}

export async function saveAiMemory(weights: Record<string, number>): Promise<void> {
  const db = requireFirestore();
  await setDoc(doc(db, 'hostPrivate', 'aiMemory'), { weights, updatedAt: new Date().toISOString() }, { merge: true });
}

// A short note from the host that the customer sees on their order.
export async function saveOrderMessage(orderId: string, message: string): Promise<void> {
  const db = requireFirestore();
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'orders', orderId), { hostMessage: message, hostMessageAt: now, updatedAt: now });
}

// Optional WhatsApp number used only as a fallback when a customer cannot send an enquiry through the site.
export function subscribeContactSettings(
  onChange: (whatsappNumber: string) => void,
  onError: (error: Error) => void,
  options: { live?: boolean } = {},
) {
  const db = requireFirestore();
  if (!options.live) {
    return loadWithCache<string>({
      key: 'settings-contact',
      ttlMs: PUBLIC_CACHE_TTL_MS,
      load: async () => {
        const snapshot = await getDoc(doc(db, 'settings', 'contact'));
        return snapshot.exists() ? String(snapshot.data().whatsappNumber || '') : '';
      },
      onChange,
      onError,
    });
  }
  return onSnapshot(doc(db, 'settings', 'contact'), snapshot => {
    const number = snapshot.exists() ? String(snapshot.data().whatsappNumber || '') : '';
    writeCache('settings-contact', number);
    onChange(number);
  }, onError);
}

export async function saveContactSettings(whatsappNumber: string): Promise<void> {
  const db = requireFirestore();
  await setDoc(doc(db, 'settings', 'contact'), { whatsappNumber, updatedAt: new Date().toISOString() }, { merge: true });
}

export interface FeedbackInput {
  name?: string;
  text: string;
  sentiment: FeedbackSentiment;
  category: string;
  confidence: number;
  language: string;
}

export async function submitFeedback(userId: string, input: FeedbackInput): Promise<void> {
  const db = requireFirestore();
  const text = input.text.trim();
  if (!text || text.length > 200) throw new Error('Enter your feedback (up to 200 characters).');
  const name = (input.name || '').trim().slice(0, 80);
  const data: Omit<Feedback, 'id'> = {
    userId,
    text,
    sentiment: input.sentiment,
    category: input.category.slice(0, 40),
    confidence: Math.max(0, Math.min(1, input.confidence)),
    language: input.language.slice(0, 8),
    status: 'NEW',
    createdAt: new Date().toISOString(),
    ...(name ? { name } : {}),
  };
  await setDoc(doc(db, 'feedback', `FB-${createId()}`), data);
}

export function subscribeFeedback(onChange: (items: Feedback[]) => void, onError: (error: Error) => void) {
  const db = requireFirestore();
  return onSnapshot(collection(db, 'feedback'), snapshot => {
    onChange(snapshot.docs.map(item => ({ ...item.data(), id: item.id } as Feedback)));
  }, onError);
}

export async function setFeedbackStatus(feedbackId: string, status: 'NEW' | 'REVIEWED'): Promise<void> {
  const db = requireFirestore();
  await updateDoc(doc(db, 'feedback', feedbackId), { status });
}

export async function deleteFeedback(feedbackId: string): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, 'feedback', feedbackId));
}
