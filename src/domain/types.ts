import type { AppliedDiscount } from './discounts';
export type OrderStage = 
  | 'ORDER_RECEIVED'
  | 'ITEM_PAYMENT_VERIFIED'
  | 'PACKING'
  | 'COURIER_RECEIPT_UPLOADED'
  | 'COURIER_CHARGE_VERIFIED'
  | 'SUBMITTED_FOR_DISPATCH'
  | 'DELIVERED'
  | 'NOT_ACCEPTED'
  | 'CANCELLED';

/** What the customer agreed to at checkout. Messages are only sent for the channels they ticked. */
export interface Consent {
  consent_email: boolean;
  consent_whatsapp: boolean;
  consent_promos: boolean;
  email?: string;
  /** Digits with country code, for example 919876543210. */
  whatsapp?: string;
  at: string;
}

export interface HostRecord {
  email: string;
  /** Typed by the developer, for example H01. */
  hostId: string;
  /** Shown next to every action this host performs. */
  nickname: string;
  active: boolean;
  createdAt?: string;
  /** True for the owner emails set in the app settings: shown, but not removable here. */
  fixed?: boolean;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorEmail: string;
  actorHostId: string;
  actorNickname: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
}

export interface ProofCheckResult {
  utrSource: 'auto' | 'edited' | 'manual';
  amountFound: boolean | null;
  /** Payment time read from the screenshot (ISO), when it could be read. */
  paidAt?: string;
  timeStatus?: 'fresh' | 'stale' | 'future' | 'unknown';
}

export interface RefundDetails {
  method: 'UPI_ID' | 'UPI_PHONE';
  value: string;
  submittedAt: string;
}

export type UserRole = 'DEVELOPER' | 'OWNER' | 'CUSTOMER';

export interface ProductMedia {
  url: string;
  type: 'image' | 'video';
  name?: string;
}

export type ProductStatus = 'AVAILABLE' | 'OUT_OF_STOCK' | 'COMING_SOON';

export interface Product {
  id: string;
  name: string;
  category: 'Sarees' | 'Custom Kuchu' | string;
  price: number;
  offerPrice?: number;
  description: string;
  image: string;
  media?: ProductMedia[];
  quantity?: number;
  status?: ProductStatus;
  createdAt?: string;
  /** CATEGORY-PATTERN-COLOR-KUCHU-SIZE, for example SILK-ZRI-MAR-KCH03-63M. */
  itemCode?: string;
  categoryCode?: string;
  patternCode?: string;
  color?: string;
  colorCode?: string;
  size?: string;
  kuchuCode?: string;
  /** Products with the same design key are shown as colour variants of one listing. */
  designKey?: string;
  /** Kuchu designs the host tagged as compatible with this saree. */
  compatibleKuchuIds?: string[];
  /** Thread colours the customer can choose from with a Kuchu, based on the saree's colour combination. */
  threadColors?: string[];
}

export interface KuchuDesign {
  /** Unique letters and digits, also the document id (for example KCH03). */
  id: string;
  name: string;
  price: number;
  /** Several photos so customers can preview the design. */
  photos: ProductMedia[];
  /** Hidden designs are not offered to customers. */
  active: boolean;
  createdAt?: string;
}

export interface CustomerAddress {
  fullName: string;
  phone: string;
  houseNameOrNumber?: string;
  street1?: string;
  street2?: string;
  landmark1: string;
  landmark2?: string;
  city?: string;
  taluk?: string;
  district?: string;
  state?: string;
  /** Filled from the pincode (India) and can be changed by the customer. */
  country?: string;
  street?: string;
  pincode: string;
  googleMapsPin?: string;
  consentTimestamp: string;
  pincodeCheck?: PincodeCheck;
}

export interface PincodeCheck {
  status: 'SERVICEABLE' | 'NOT_SERVICEABLE' | 'POSTAL_CODE_FOUND' | 'NOT_FOUND' | 'UNAVAILABLE';
  provider: string;
  message: string;
  checkedAt: string;
  district?: string;
  state?: string;
  taluk?: string;
}

export interface SavedDeliveryAddress extends CustomerAddress {
  id: string;
}

export interface ParcelParty {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface ParcelDetails {
  from: ParcelParty;
  to: ParcelParty;
  savedAt: string;
  savedBy: string;
}

export interface PaymentRecord {
  paymentId: string;
  kind: 'ITEM' | 'COURIER';
  amount: number;
  utr: string;
  screenshotUrl: string;
  verified: boolean;
  submittedAt?: string;
  /** What the automatic screenshot reading found (a hint for the host, not proof of payment). */
  proofCheck?: ProofCheckResult;
}

export interface CourierBill {
  billId: string;
  courierName: string;
  trackingId: string;
  amount: number;
}

export interface OrderLine {
  productId: string;
  name: string;
  price: number;
  regularPrice?: number;
  quantity: number;
  /** The colour, item ID and photo the customer chose, kept on the order. */
  color?: string;
  itemCode?: string;
  image?: string;
  /** Kuchu chosen with this saree, and the thread colour (the price already includes the Kuchu). */
  kuchuId?: string;
  kuchuName?: string;
  kuchuPrice?: number;
  threadColor?: string;
  status?: 'ACTIVE' | 'REJECTED';
  rejectionReason?: string;
  rejectionNote?: string;
  rejectedAt?: string;
  rejectedBy?: string;
}

export interface Order {
  orderId: string;
  userId: string;
  items: OrderLine[];
  itemTotal: number;
  /** The bag value before any offer, and the offer taken off (itemTotal is what the customer pays). */
  subtotal?: number;
  discount?: AppliedDiscount;
  /** Value of items the host rejected one by one (see items[].status). */
  rejectedTotal?: number;
  /** Amount to refund for rejected items; the customer is asked for refund details. */
  refundDue?: number;
  stage: OrderStage;
  isWithheld: boolean;
  courierNoticeAccepted: boolean;
  address: CustomerAddress;
  deliveryConfirmed?: boolean;
  deliveryConfirmedAt?: string;
  deliveryConfirmedBy?: string;
  parcelDetails?: ParcelDetails;
  itemPayment?: PaymentRecord;
  courierBill?: CourierBill;
  courierPayment?: PaymentRecord;
  deliveryPartner?: string;
  deliveryComments?: string;
  rejectionReason?: string;
  rejectionNote?: string;
  /** Which courier rule applied when the order was placed (A single saree, B Bangalore, C standard charge). */
  courierRule?: 'A' | 'B' | 'C';
  courierWaived?: boolean;
  courierRuleReason?: string;
  consent?: Consent;
  /** When the customer accepted the final-sale rule (orders with a Kuchu). */
  finalSaleAcceptedAt?: string;
  /** A deleted row is hidden from host screens; only the developer can restore or remove it for good. */
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
  /** Why the host put this order on hold (shown to the customer). */
  holdReason?: string;
  holdNote?: string;
  heldAt?: string;
  heldBy?: string;
  /** True when stock was already blocked at the moment the order was placed. */
  stockReserved?: boolean;
  /** Where to send the refund after the host cancels (not accepts) the order. */
  refundDetails?: RefundDetails;
  hostMessage?: string;
  hostMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Enquiry {
  id: string;
  userId: string;
  name: string;
  phone: string;
  message: string;
  productId?: string;
  productName?: string;
  /** Set when the customer reports a problem with a payment on one of their orders. */
  kind?: 'PAYMENT_ISSUE';
  orderId?: string;
  issueType?: string;
  status: 'NEW' | 'REPLIED';
  createdAt: string;
}

export type FeedbackSentiment = 'POSITIVE' | 'NEGATIVE' | 'SUGGESTION' | 'NEUTRAL';

export interface Feedback {
  id: string;
  userId: string;
  name?: string;
  text: string;
  sentiment: FeedbackSentiment;
  category: string;
  confidence: number;
  language: string;
  status: 'NEW' | 'REVIEWED';
  createdAt: string;
}
