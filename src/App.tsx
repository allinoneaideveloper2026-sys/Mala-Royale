import React, { useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { GoogleAuthProvider, linkWithPopup, onAuthStateChanged, signInAnonymously, signInWithCredential, signInWithPopup, signOut, type User } from 'firebase/auth';
import { CONFIG } from './config';
import { LANGUAGES, LANGUAGE_STORAGE_KEY, TrContext, buildStrings, isUiLanguage, makeTr, type UiLanguage } from './lang/ui';
import { UserRole, Product, ProductStatus, Enquiry, Feedback, Order, CourierBill, CustomerAddress, ParcelDetails, ParcelParty, SavedDeliveryAddress, HostRecord, AuditEntry, KuchuDesign } from './domain/types';
import { globalOrderBook } from './domain/OrderBook';
import { auth, firebaseConfigured } from './firebase';
import AIOfferBannerContainer from './components/AIOfferBanner/AIOfferBannerContainer';
import SiteHeader from './components/storefront/SiteHeader';
import { CategoryTiles, ColorRow, HeroBanner, ProductSkeletons, type CategoryTile, type ColorTile } from './components/storefront/HomeSections';
import KuchuPicker from './components/storefront/KuchuPicker';
import ProductQuickView from './components/storefront/ProductQuickView';
import { HeartIcon } from './components/storefront/Icons';
import SiteFooter from './components/storefront/SiteFooter';
import SitePageView from './components/storefront/SitePageView';
import SitePagesEditor from './components/host/SitePagesEditor';
import { DEFAULT_PAGES, fillTokens, type SitePageKey, type SitePages } from './domain/sitePages';
import { useWishlist } from './app/wishlist';
import { withViewTransition } from './app/transitions';
import { cardBadges, discountPercent, type OfferAction } from './components/AIOfferBanner/offerEngine';
import { useBrowsingContext } from './components/AIOfferBanner/useBrowsingContext';
import { adjustWeight } from './analytics/insights';
import { analyzeFeedback } from './analytics/feedback';
import AboutSection, { type FeedbackResult } from './components/storefront/AboutSection';
import { HowItWorks, OrderTimeline, StoryShowcase, ValueStrip } from './components/storefront/StorefrontSections';
import { productCreatedMs } from './analytics/orderMetrics';
import { isAddressComplete } from './domain/address';
import { notifyOrder, describeNotify } from './app/notifyClient';
import { isEmail, newConsent, type NotifyEvent } from './domain/notifications';
import { PALETTE, buildItemCode, categoryCodeFor, colorCodeFor, designKeyFor, groupVariants, isValidItemCode, itemCodeTaken, type PaletteColor } from './domain/itemCode';
import { acceptedTotal, activeLines, isLineRejected } from './domain/orderItems';
import OrderLines from './components/orders/OrderLines';
import { colorsFromPhoto } from './app/photoColors';
import { saveShippingConfig, subscribeShippingConfig, holdCloudOrder, releaseCloudOrderHold, saveUpiSettings, uploadPaymentProof, cacheProducts, refreshProductsFresh, fetchCheckoutQrFresh, resetAiMemory, submitRefundDetails, attachCloudCourierBill, checkDeliveryPincode, createCloudOrder, confirmCloudOrderDelivery, deleteCloudDeliveryAddress, deleteEnquiry, deleteFeedback, deleteProduct, isAuthorizedHost, isConfiguredDeveloper, isConfiguredOwner, markCloudOrderNotAccepted, markCloudOrderDelivered, publishProduct, saveCloudDeliveryAddress, saveAiMemory, saveCategories, saveCloudParcelDetails, saveContactSettings, saveOrderMessage, setEnquiryStatus, setFeedbackStatus, subscribeAiMemory, subscribeCategories, subscribeContactSettings, subscribeFeedback, subscribeCheckoutQr, subscribeEnquiries, subscribeSavedAddresses, subscribeOrders, subscribeProducts, submitCloudOrderForDispatch, submitCloudCourierPayment, submitEnquiry, submitFeedback, updateOrderDelivery, updateProduct, uploadCheckoutQr, uploadProductMedia, verifyCloudPayment } from './domain/firestoreStore';
import { INITIAL_CATALOG, LOGO_URL, DEFAULT_CATEGORIES, NEW_CATEGORY_VALUE, unitPrice, effectiveStatus, isPurchasable, maxOrderable, linkButtonStyle, STATUS_LABELS, STATUS_COLORS, mediaButtonStyle, whatsAppLink, type HostOrderTab, type HostTab, type SortKey, type CartLine } from './app/shared';
import { WhatsAppIcon, GoogleSignInButton } from './components/common/icons';
import ProductManagerRow from './components/host/ProductManagerRow';
import { withTimeout, getOrderStatus, getOrderStatusStyle, newestFirst } from './app/utils';
import { validateRefundDetails } from './domain/refund';
import UpiPayBox from './components/checkout/UpiPayBox';
import ConfirmDialog, { type DialogResult, type DialogReason } from './components/host/ConfirmDialog';
import { saveSitePages, subscribeSitePages, deleteKuchu, publishKuchu, refreshKuchuFresh, rejectCloudOrderItem, subscribeKuchu, updateKuchu } from './domain/firestoreStore';
import KuchuManager from './components/host/KuchuManager';
import { FINAL_SALE_HEADLINE, choiceKey, compatibleKuchu, itemCodeWithKuchu, lineKey, lineUnitPrice, lineRegularPrice } from './domain/kuchu';
import { deleteHostRecord, deleteOrderForever, getMyHostRecord, logAudit, restoreOrder, saveHostRecord, setHostActive, softDeleteOrder, subscribeAuditLog, subscribeHostRecords, validateHostRecord } from './domain/adminStore';
import { useOrderUpdates } from './app/orderUpdates';
import ReportPaymentIssue from './components/checkout/ReportPaymentIssue';
import { isValidUpiId } from './domain/upi';
import { DEFAULT_SHIPPING, evaluateCourierRules, normalizePincode, parsePrefixes, type ShippingConfig } from './domain/shipping';
import { PaymentProofCapture, PaymentProofView, ProofCheckBadges, type ProofCheck } from './components/checkout/PaymentProof';
import { fingerprintFile, isValidUtr, validateProofFile } from './domain/paymentProof';
import RefundPrompt, { describeRefund } from './components/checkout/RefundPrompt';
import { CourierBillForm, CourierPaymentForm } from './components/checkout/CourierForms';
import DeliveryAddressFields from './components/checkout/DeliveryAddressFields';
import { validateProductMedia, ProductGallery } from './components/storefront/ProductMedia';

// Heavy, staff-only or rarely used screens are loaded on demand so the customer storefront bundle stays small.
const HostAnalytics = lazy(() => import('./components/host/HostAnalytics'));
const MasterLedger = lazy(() => import('./components/host/MasterLedger'));
const FeedbackPanel = lazy(() => import('./components/host/FeedbackPanel'));
const HostOrderActions = lazy(() => import('./components/host/HostOrderActions'));
const ParcelSheet = lazy(() => import('./components/host/ParcelSheet'));
const ShareMenu = lazy(() => import('./components/storefront/ShareMenu'));
const LazyFallback = () => <p style={{ padding: '0.75rem', color: '#6b6b6b' }}>Loading…</p>;

export default function App() {
  // Navigation & Authentication State
  const [lang, setLang] = useState<UiLanguage>(() => {
    try {
      const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return isUiLanguage(stored) ? stored : 'en';
    } catch {
      return 'en';
    }
  });
  const [role, setRole] = useState<UserRole>('CUSTOMER');
  const [userEmail, setUserEmail] = useState('customer@gmail.com');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseLoading, setFirebaseLoading] = useState(firebaseConfigured);
  const [syncError, setSyncError] = useState('');
  const [authorizedHosts, setAuthorizedHosts] = useState<string[]>(CONFIG.ownerEmails);
  const [newHostEmail, setNewHostEmail] = useState('');
  const [newHostId, setNewHostId] = useState('');
  const [newHostNickname, setNewHostNickname] = useState('');
  const [hostRecords, setHostRecords] = useState<HostRecord[]>([]);
  const [myHost, setMyHost] = useState<HostRecord | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [grantHostAccess, setGrantHostAccess] = useState(true);
  const [isUploadingProduct, setIsUploadingProduct] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);

  // Catalog State
  const [products, setProducts] = useState<Product[]>(firebaseConfigured ? [] : INITIAL_CATALOG);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortKey>('featured');
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyOffers, setOnlyOffers] = useState(false);
  const [hostTab, setHostTab] = useState<HostTab>('ORDERS');
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [paymentQrUpdatedAt, setPaymentQrUpdatedAt] = useState('');
  const [shippingConfig, setShippingConfig] = useState<ShippingConfig>(DEFAULT_SHIPPING);
  const [prefixDraft, setPrefixDraft] = useState('560');
  const [forceCourier, setForceCourier] = useState<Record<string, boolean>>({});
  const [upiId, setUpiId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [upiDraft, setUpiDraft] = useState('');
  const [payeeDraft, setPayeeDraft] = useState('');
  const [aiWeights, setAiWeights] = useState<Record<string, number>>({});
  const [contactEmail, setContactEmail] = useState('');
  const [consentEmail, setConsentEmail] = useState(false);
  const [consentWhatsapp, setConsentWhatsapp] = useState(false);
  const [consentPromos, setConsentPromos] = useState(false);
  const [notifyNote, setNotifyNote] = useState('');
  const [searchText, setSearchText] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [wishOnly, setWishOnly] = useState(false);
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const [devView, setDevView] = useState<'HOME' | 'HOST' | 'PAGES'>('HOME');
  const [sitePages, setSitePages] = useState<SitePages>(DEFAULT_PAGES);
  const [pageView, setPageView] = useState<SitePageKey | null>(null);
  const [productsReady, setProductsReady] = useState(!firebaseConfigured);
  const wishlist = useWishlist();
  const [kuchuList, setKuchuList] = useState<KuchuDesign[]>([]);
  const [kuchuChoice, setKuchuChoice] = useState<Record<string, string>>({});
  const [colorSuggestions, setColorSuggestions] = useState<PaletteColor[]>([]);
  const [lastPublished, setLastPublished] = useState<Product | null>(null);
  const [newProduct, setNewProduct] = useState({ name: '', category: 'Sarees', price: '', offerPrice: '', quantity: '1', description: '', image: '', categoryCode: '', patternCode: '', color: '', size: '', kuchuCode: '', itemCode: '', compatibleKuchuIds: [] as string[] });
  const [productMediaFiles, setProductMediaFiles] = useState<File[]>([]);
  const [paymentQrUrl, setPaymentQrUrl] = useState('');
  const [paymentQrFile, setPaymentQrFile] = useState<File | null>(null);

  // Customer Cart & Checkout State
  const [cartLines, setCart] = useState<CartLine[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<{ orderId: string; total: number; phone: string; name: string } | null>(null);
  const [orderCopied, setOrderCopied] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [feedbackItems, setFeedbackItems] = useState<Feedback[]>([]);
  const [shareTarget, setShareTarget] = useState<Product | null>(null);
  const [enquiryNeedsSignIn, setEnquiryNeedsSignIn] = useState(false);
  const [hostWhatsApp, setHostWhatsApp] = useState('');
  const [whatsAppDraft, setWhatsAppDraft] = useState('');
  const [highlightedProductId, setHighlightedProductId] = useState('');
  const hashHandled = useRef(false);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [isEnquiryOpen, setIsEnquiryOpen] = useState(false);
  const [enquiryName, setEnquiryName] = useState('');
  const [enquiryPhone, setEnquiryPhone] = useState('');
  const [enquiryMessage, setEnquiryMessage] = useState('');
  const [enquiryProduct, setEnquiryProduct] = useState<{ id: string; name: string } | null>(null);
  const [enquirySending, setEnquirySending] = useState(false);
  const [enquirySent, setEnquirySent] = useState(false);
  const [enquiryError, setEnquiryError] = useState('');
  const [lastEnquiryAt, setLastEnquiryAt] = useState(0);
  // Always price the cart from the live catalog so host price changes apply immediately.
  const cart: CartLine[] = cartLines.map(line => ({ ...line, product: products.find(product => product.id === line.product.id) || line.product, ...(line.kuchu ? { kuchu: kuchuList.find(item => item.id === line.kuchu?.id) || line.kuchu } : {}) }));
  const unavailableLines = cart.filter(line => !products.some(product => product.id === line.product.id) || !isPurchasable(line.product) || line.quantity > maxOrderable(line.product) || (line.kuchu ? !compatibleKuchu(line.product, kuchuList).some(item => item.id === line.kuchu?.id) : false));
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);
  const [courierPolicyAccepted, setCourierPolicyAccepted] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [hostOrderTab, setHostOrderTab] = useState<HostOrderTab>('ACTIVE');
  const [customerTab, setCustomerTab] = useState<'SHOP' | 'ORDERS' | 'ADDRESSES' | 'ABOUT'>('SHOP');
  const [savedAddresses, setSavedAddresses] = useState<SavedDeliveryAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [useSavedAddress, setUseSavedAddress] = useState(false);
  const [saveAddressForLater, setSaveAddressForLater] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [isCheckingPincode, setIsCheckingPincode] = useState(false);

  // Customer Form Data
  const [address, setAddress] = useState<CustomerAddress>({
    fullName: '',
    phone: '',
    houseNameOrNumber: '',
    street1: '',
    street2: '',
    street: '',
    landmark1: '',
    landmark2: '',
    taluk: '',
    district: '',
    state: '',
    country: 'India',
    pincode: '',
    googleMapsPin: '',
    consentTimestamp: ''
  });
  const [utr, setUtr] = useState('');
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [proofCheck, setProofCheck] = useState<ProofCheck | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  const t = buildStrings(lang);
  const tr = useMemo(() => makeTr(lang), [lang]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      /* the choice then lasts for this visit only */
    }
    document.documentElement.lang = lang;
  }, [lang]);
  const isStaff = role === 'OWNER' || role === 'DEVELOPER';
  const googleUser = firebaseUser && !firebaseUser.isAnonymous ? firebaseUser : null;
  const [logoFailed, setLogoFailed] = useState(false);

  const mediaPreviews = useMemo(() => productMediaFiles.map(file => ({
    name: file.name,
    url: URL.createObjectURL(file),
    isVideo: file.type.startsWith('video/'),
  })), [productMediaFiles]);
  useEffect(() => () => mediaPreviews.forEach(preview => URL.revokeObjectURL(preview.url)), [mediaPreviews]);

  // Browsing context for personalised offers (kept in the visitor's own browser; off for host and developer).
  const { context: browsingContext, trackProductView, trackAddToCart, dismissOffer } = useBrowsingContext(categoryFilter, !isStaff);

  const applySignedInUser = async (user: User | null) => {
    setFirebaseUser(user);
    setFirebaseLoading(true);

    if (!user?.email) {
      setUserEmail('');
      setRole('CUSTOMER');
      if (!user) setActiveOrders([]);
      setFirebaseLoading(false);
      return;
    }

    const email = user.email.toLowerCase();
    setUserEmail(email);

    try {
      const nextRole = isConfiguredDeveloper(email)
        ? 'DEVELOPER'
        : isConfiguredOwner(email) || await isAuthorizedHost(email)
          ? 'OWNER'
          : 'CUSTOMER';
      setRole(nextRole);
      setSyncError('');
    } catch (err) {
      console.error('Role check failed:', err);
      setRole('CUSTOMER');
      setSyncError(err instanceof Error ? err.message : 'Could not load account permissions.');
    } finally {
      setFirebaseLoading(false);
    }
  };

  useEffect(() => {
    if (!auth) {
      setFirebaseLoading(false);
      return;
    }

    return onAuthStateChanged(auth, user => {
      void applySignedInUser(user);
    }, error => {
      setFirebaseLoading(false);
      setSyncError(error.message);
    });
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) return;

    // Customers use a cached read (saves free-tier Firestore reads); staff get live updates.
    return subscribeProducts(nextProducts => {
      setSyncError('');
      setProductsReady(true);
      setProducts(nextProducts);
    }, error => setSyncError(error.message), { live: isStaff });
  }, [isStaff]);

  useEffect(() => {
    if (!firebaseConfigured) return;
    if (!firebaseUser) {
      setActiveOrders([]);
      return;
    }

    return subscribeOrders(firebaseUser.uid, role !== 'CUSTOMER', orders => {
      setSyncError('');
      setActiveOrders(orders);
    }, error => setSyncError(error.message));
  }, [firebaseUser, role]);

  useEffect(() => {
    if (!firebaseConfigured || role !== 'DEVELOPER') return;
    return subscribeHostRecords(records => {
      setSyncError('');
      setHostRecords(records);
      setAuthorizedHosts(records.filter(record => record.active).map(record => record.email));
    }, error => setSyncError(error.message));
  }, [role]);

  // Audit trail (developer only): the latest 100 actions with who did them and when.
  useEffect(() => {
    if (!firebaseConfigured || role !== 'DEVELOPER') return;
    return subscribeAuditLog(setAuditEntries, error => setSyncError(error.message));
  }, [role]);

  // The signed-in host's own record, so every action can carry their nickname and host ID.
  useEffect(() => {
    if (!firebaseConfigured || role !== 'OWNER' || !userEmail) { setMyHost(null); return; }
    getMyHostRecord(userEmail).then(setMyHost).catch(() => setMyHost(null));
  }, [role, userEmail]);

  useEffect(() => {
    if (!firebaseConfigured || !isStaff) return;
    return subscribeEnquiries(setEnquiries, error => setSyncError(error.message));
  }, [isStaff]);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return subscribeCategories(setCustomCategories, error => setSyncError(error.message), { live: isStaff });
  }, [isStaff]);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return subscribeContactSettings(number => {
      setHostWhatsApp(number);
      setWhatsAppDraft(number);
    }, () => undefined, { live: isStaff });
  }, [isStaff]);

  useEffect(() => {
    if (!firebaseConfigured || !isStaff) return;
    return subscribeFeedback(setFeedbackItems, error => setSyncError(error.message));
  }, [isStaff]);

  // A shared link like ...#product=p-123 scrolls to that piece and highlights it.
  useEffect(() => {
    if (hashHandled.current || products.length === 0) return;
    const match = /#product=([^&]+)/.exec(window.location.hash);
    if (!match) {
      hashHandled.current = true;
      return;
    }
    const id = decodeURIComponent(match[1]);
    if (!products.some(product => product.id === id)) return;
    hashHandled.current = true;
    window.setTimeout(() => focusProduct(id), 600);
  }, [products]);

  useEffect(() => {
    if (!firebaseConfigured || !isStaff) return;
    return subscribeAiMemory(setAiWeights, error => setSyncError(error.message));
  }, [isStaff]);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return subscribeCheckoutQr((url, updatedAt, upi) => {
      setSyncError('');
      setPaymentQrUrl(url);
      setPaymentQrUpdatedAt(updatedAt || '');
      setUpiId(upi.upiId);
      setPayeeName(upi.payeeName);
      setUpiDraft(upi.upiId);
      setPayeeDraft(upi.payeeName);
    }, error => setSyncError(error.message), { live: isStaff });
  }, [isStaff]);

  // Site pages (About us, Contact, Terms): customers read them (cached); the developer edits them.
  useEffect(() => {
    if (!firebaseConfigured) return;
    return subscribeSitePages(setSitePages, () => undefined, { live: role === 'DEVELOPER' });
  }, [role]);

  // A link like #page=terms opens that page.
  useEffect(() => {
    const open = () => {
      const match = /^#page=(about|contact|terms)$/.exec(window.location.hash);
      if (match) setPageView(match[1] as SitePageKey);
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);

  // Kuchu designs: customers read them (cached); staff see changes live.
  useEffect(() => {
    if (!firebaseConfigured) return;
    return subscribeKuchu(setKuchuList, () => undefined, { live: isStaff });
  }, [isStaff]);

  // Courier charge rules: customers read them (cached); staff see changes live.
  useEffect(() => {
    if (!firebaseConfigured) return;
    return subscribeShippingConfig(config => {
      setShippingConfig(config);
      setPrefixDraft(config.bangalorePrefixes.join(', '));
    }, () => undefined, { live: isStaff });
  }, [isStaff]);

  // Pre-fill the contact email from the Google sign-in, and fade the host's "customer notified" note.
  useEffect(() => {
    if (firebaseUser?.email) setContactEmail(current => current || firebaseUser.email || '');
  }, [firebaseUser]);
  useEffect(() => {
    if (!notifyNote) return;
    const timer = window.setTimeout(() => setNotifyNote(''), 7000);
    return () => window.clearTimeout(timer);
  }, [notifyNote]);

  // Suggest colours from the first uploaded photo of a new catalog item.
  useEffect(() => {
    const firstImage = productMediaFiles.find(file => file.type.startsWith('image/'));
    if (!firstImage) { setColorSuggestions([]); return; }
    let cancelled = false;
    colorsFromPhoto(firstImage).then(colors => { if (!cancelled) setColorSuggestions(colors); });
    return () => { cancelled = true; };
  }, [productMediaFiles]);

  // Tells the customer which of their orders changed since they last looked (status, host message, hold, cancellation).
  const { changed: changedOrders, markSeen: markOrderSeen } = useOrderUpdates(activeOrders, firebaseUser?.uid || userEmail || 'guest');

  // Always show the latest payment QR at the moment a customer is about to pay (cached copy may be up to 10 min old).
  const awaitingCourierPayment = activeOrders.some(order => Boolean(order.courierBill) && !order.courierPayment);
  useEffect(() => {
    if (!firebaseConfigured || isStaff) return;
    if (!isCheckoutOpen && !awaitingCourierPayment) return;
    let cancelled = false;
    fetchCheckoutQrFresh().then(({ url, updatedAt, upiId: freshUpiId, payeeName: freshPayee }) => {
      if (cancelled) return;
      setPaymentQrUrl(url);
      setPaymentQrUpdatedAt(updatedAt || '');
      setUpiId(freshUpiId);
      setPayeeName(freshPayee);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [isCheckoutOpen, awaitingCourierPayment, isStaff]);

  useEffect(() => {
    if (firebaseConfigured) {
      if (!googleUser) {
        setSavedAddresses([]);
        return;
      }
      return subscribeSavedAddresses(googleUser.uid, addresses => {
        setSavedAddresses(addresses);
        setSyncError('');
      }, error => setSyncError(error.message));
    }

    try {
      const saved = localStorage.getItem(`mala-royale:delivery-addresses:${userEmail}`);
      setSavedAddresses(saved ? JSON.parse(saved) as SavedDeliveryAddress[] : []);
    } catch {
      setSavedAddresses([]);
    }
    return undefined;
  }, [googleUser?.uid, userEmail]);

  const handleGoogleSignIn = async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    // Always show the Google account chooser instead of silently using the primary account.
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const current = auth.currentUser;
      if (current?.isAnonymous) {
        try {
          // Keep the guest's orders by attaching the Google account to the same session.
          await linkWithPopup(current, provider);
          await current.reload();
          await current.getIdToken(true);
          await applySignedInUser(auth.currentUser);
          return;
        } catch (linkError) {
          const linkCode = (linkError as { code?: string })?.code;
          if (linkCode === 'auth/credential-already-in-use') {
            const credential = GoogleAuthProvider.credentialFromError(linkError as never);
            if (credential) {
              await signInWithCredential(auth, credential);
              return;
            }
          }
          throw linkError;
        }
      }
      await signInWithPopup(auth, provider);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      setSyncError(error instanceof Error ? error.message : 'Google sign-in failed.');
    }
  };

  // Lets customers order without an account; a Google account can be linked later.
  const ensureCustomerSession = async (): Promise<string> => {
    if (firebaseUser) return firebaseUser.uid;
    if (!auth) throw new Error('Sign-in is not available.');
    const credential = await signInAnonymously(auth);
    return credential.user.uid;
  };

  const handleSignOut = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Sign out failed.');
    }
  };

  // Role Routing based on Sign-In Email
  const handleEmailSwitch = (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    setUserEmail(normalizedEmail);
    if (CONFIG.developerEmails.some((developer: string) => developer.trim().toLowerCase() === normalizedEmail)) {
      setRole('DEVELOPER');
    } else if (authorizedHosts.some(host => host.trim().toLowerCase() === normalizedEmail)) {
      setRole('OWNER');
    } else {
      setRole('CUSTOMER');
    }
  };

  const confirmHostAction = (message: string) => {
    if (typeof window === 'undefined') return true;
    return window.confirm(`${message} This action requires host consent.`);
  };

  // Pop-up confirmation for each host decision (accept / hold / reject / delete).
  const [acceptDialog, setAcceptDialog] = useState<null | {
    title: string; details: string; confirmLabel: string; tone: 'accept' | 'hold' | 'danger'; reasons?: DialogReason[];
    resolve: (result: DialogResult | null) => void;
  }>(null);
  const askDialog = (spec: { title: string; details: string; confirmLabel: string; tone?: 'accept' | 'hold' | 'danger'; reasons?: DialogReason[] }) => new Promise<DialogResult | null>(resolve => {
    setAcceptDialog({ ...spec, tone: spec.tone || 'accept', resolve });
  });
  const askAccept = async (title: string, details: string, confirmLabel: string) => (await askDialog({ title, details, confirmLabel })) !== null;
  const closeAcceptDialog = (result: DialogResult | null) => {
    acceptDialog?.resolve(result);
    setAcceptDialog(null);
  };

  // Tells the customer about an order event (email / WhatsApp), only where they agreed and the shop has switched it on.
  const notifyCustomer = (orderId: string, event: NotifyEvent) => {
    if (!firebaseConfigured) return;
    void notifyOrder(orderId, event).then(outcome => {
      const note = describeNotify(outcome);
      if (note) setNotifyNote(note);
    });
  };

  // Who is acting: shown beside every action in the audit trail.
  const actor = () => ({
    email: (firebaseUser?.email || userEmail || '').toLowerCase(),
    hostId: role === 'DEVELOPER' ? 'DEV' : (myHost?.hostId || 'OWNER'),
    nickname: role === 'DEVELOPER' ? 'Developer' : (myHost?.nickname || 'Owner'),
  });
  const audit = (action: string, targetType: string, targetId: string, summary: string) => {
    if (!firebaseConfigured || !isStaff) return;
    void logAudit(actor(), action, targetType, targetId, summary).catch(error => console.warn('Audit entry not saved:', error));
  };
  const orderSummary = (order: Order | undefined) => (order
    ? `${order.address?.fullName || 'Customer'} · ${order.items.length} item(s) · ₹${order.itemTotal}`
    : '');

  // Developer Action: Add Host Email Whitelist
  const handleAddHost = async (e: React.FormEvent) => {
    e.preventDefault();
    const record = { email: newHostEmail.trim().toLowerCase(), hostId: newHostId.trim(), nickname: newHostNickname.trim() };
    const problem = validateHostRecord(record);
    if (problem) {
      alert(problem);
      return;
    }
    const existing = hostRecords.find(host => host.email === record.email);
    const countedHosts = hostRecords.filter(host => !host.fixed);
    if (!existing && countedHosts.length >= CONFIG.maxHostLogins) {
      alert(`Limit reached: Maximum of ${CONFIG.maxHostLogins} host logins allowed.`);
      return;
    }
    if (hostRecords.some(host => host.hostId.toLowerCase() === record.hostId.toLowerCase() && host.email !== record.email)) {
      alert('That Host ID is already used by another host.');
      return;
    }
    if (!(await askAccept(`Add ${record.nickname} as a host?`, `${record.email} · Host ID ${record.hostId}. They will be able to see and act on orders. Every action they take is logged with this nickname.`, 'Add host'))) return;
    try {
      if (firebaseConfigured) {
        await saveHostRecord(record, actor().email);
        audit('HOST_ADDED', 'host', record.email, `Added host ${record.nickname} (${record.hostId})`);
      } else {
        setHostRecords([...hostRecords, { ...record, active: true }]);
        setAuthorizedHosts([...authorizedHosts, record.email]);
      }
      setNewHostEmail('');
      setNewHostId('');
      setNewHostNickname('');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not add the host.');
    }
  };

  // Quick switch: turn a host's access on or off without deleting them.
  const handleHostActiveToggle = async (host: HostRecord, active: boolean) => {
    if (!(await askAccept(`${active ? 'Turn on' : 'Turn off'} access for ${host.nickname}?`, `${host.email} will ${active ? 'be able to use' : 'no longer be able to use'} the host view${active ? '' : ' until you turn it back on'}.`, active ? 'Turn on' : 'Turn off'))) return;
    try {
      if (firebaseConfigured) {
        await setHostActive(host.email, active);
        audit(active ? 'HOST_ENABLED' : 'HOST_DISABLED', 'host', host.email, `${active ? 'Enabled' : 'Disabled'} host ${host.nickname} (${host.hostId})`);
      } else {
        setHostRecords(records => records.map(record => record.email === host.email ? { ...record, active } : record));
        setAuthorizedHosts(hosts => active ? [...hosts, host.email] : hosts.filter(email => email !== host.email));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not update host access.');
    }
  };

  // Permanent removal of a host and their access.
  const handleDeleteHost = async (host: HostRecord) => {
    if (!(await askDialog({ title: `Delete host ${host.nickname} for good?`, details: `${host.email} loses access and the host record is removed. Past actions stay in the audit trail with their nickname. This cannot be undone.`, confirmLabel: 'Delete host', tone: 'danger' }))) return;
    try {
      if (firebaseConfigured) {
        await deleteHostRecord(host.email);
        audit('HOST_DELETED', 'host', host.email, `Deleted host ${host.nickname} (${host.hostId})`);
      } else {
        setHostRecords(records => records.filter(record => record.email !== host.email));
        setAuthorizedHosts(hosts => hosts.filter(email => email !== host.email));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not delete the host.');
    }
  };

  const DELETE_REASONS: DialogReason[] = [
    { label: 'Test or duplicate order', note: '' },
    { label: 'Fake or spam order', note: '' },
    { label: 'Old record clean-up', note: '' },
    { label: 'Other', note: '' },
  ];

  // Delete a row from Order History / Master Ledger. The record is hidden, not erased; the developer can restore it.
  const handleDeleteOrderRow = async (order: Order) => {
    if (!['DELIVERED', 'NOT_ACCEPTED', 'CANCELLED'].includes(order.stage)) {
      alert('Only finished orders (delivered, not accepted or cancelled) can be deleted.');
      return;
    }
    const result = await askDialog({ title: `Delete ${order.orderId}?`, details: `${orderSummary(order)}. The row is removed from History and the Master Ledger. The customer keeps their own copy. The developer can restore it.`, confirmLabel: 'Delete row', tone: 'danger', reasons: DELETE_REASONS });
    if (!result) return;
    const reason = [result.reason, result.note].filter(Boolean).join(': ');
    try {
      if (firebaseConfigured) {
        await withTimeout(softDeleteOrder(order.orderId, actor().nickname, reason), 30000, 'Deleting is taking too long. Check your internet connection and try again.');
        audit('ORDER_DELETED', 'order', order.orderId, `Deleted row: ${reason}`);
      } else {
        setActiveOrders(orders => orders.map(item => item.orderId === order.orderId ? { ...item, deletedAt: new Date().toISOString(), deletedBy: actor().nickname, deleteReason: reason } : item));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not delete the row.');
    }
  };

  const handleRestoreOrderRow = async (order: Order) => {
    if (role !== 'DEVELOPER') return;
    if (!(await askAccept(`Restore ${order.orderId}?`, 'It will appear again in History and the Master Ledger.', 'Restore'))) return;
    try {
      if (firebaseConfigured) {
        await restoreOrder(order.orderId);
        audit('ORDER_RESTORED', 'order', order.orderId, 'Restored a deleted row');
      } else {
        setActiveOrders(orders => orders.map(item => { if (item.orderId !== order.orderId) return item; const { deletedAt: _a, deletedBy: _b, deleteReason: _c, ...rest } = item; return rest as Order; }));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not restore the row.');
    }
  };

  const handleDeleteOrderForever = async (order: Order) => {
    if (role !== 'DEVELOPER') return;
    if (!(await askDialog({ title: `Permanently delete ${order.orderId}?`, details: 'The order record is erased and cannot be restored. The customer will also lose it.', confirmLabel: 'Delete permanently', tone: 'danger' }))) return;
    try {
      if (firebaseConfigured) {
        await deleteOrderForever(order.orderId);
        audit('ORDER_ERASED', 'order', order.orderId, 'Permanently deleted an order record');
      } else {
        setActiveOrders(orders => orders.filter(item => item.orderId !== order.orderId));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not delete the record.');
    }
  };

  const handleProductMediaSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    if (selectedFiles.length === 0) return;
    try {
      const nextFiles = [...productMediaFiles, ...selectedFiles];
      await validateProductMedia(nextFiles);
      setProductMediaFiles(nextFiles);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not use those media files.');
    }
  };

  // Host Action: Publish Item with Price/Offers
  const handlePublishProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price || isUploadingProduct) return;
    const quantityValue = Math.floor(Number(newProduct.quantity));
    if (newProduct.quantity.trim() === '' || !Number.isFinite(quantityValue) || quantityValue < 0) {
      alert('Enter the quantity in stock (0 or more).');
      return;
    }
    const regularValue = parseFloat(newProduct.price);
    const offerValue = newProduct.offerPrice.trim() === '' ? undefined : parseFloat(newProduct.offerPrice);
    if (offerValue !== undefined && (!Number.isFinite(offerValue) || offerValue <= 0 || offerValue >= regularValue)) {
      alert('The offer price must be lower than the regular price. Leave it blank for no offer.');
      return;
    }
    const itemCode = (newProduct.itemCode.trim() || buildItemCode({ category: newProduct.categoryCode, pattern: newProduct.patternCode, color: colorCodeFor(newProduct.color), kuchu: newProduct.kuchuCode, size: newProduct.size })).toUpperCase();
    if (!isValidItemCode(itemCode)) {
      alert('Fill the Item ID parts (category code, pattern code, colour and size) so the ID looks like SILK-ZRI-MAR-63M.');
      return;
    }
    if (itemCodeTaken(itemCode, products)) {
      alert(`Item ID ${itemCode} is already used by another product. Change the colour, size or pattern code.`);
      return;
    }
    if (!confirmHostAction(`Publish "${newProduct.name}" (${itemCode}) to the catalog?`)) return;
    setIsUploadingProduct(true);
    try {
      const productId = `p-${Date.now()}`;
      const media = firebaseConfigured
        ? await withTimeout(uploadProductMedia(productMediaFiles), 120000, 'Uploading the photos is taking too long. Check your internet connection and try again.')
        : productMediaFiles.map(file => ({
          url: URL.createObjectURL(file),
          type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
          name: file.name,
        }));
      const coverImage = media.find(item => item.type === 'image')?.url || newProduct.image || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&q=80&w=600';
      const addedProduct: Product = {
        id: productId,
        name: newProduct.name,
        category: newProduct.category,
        price: regularValue,
        ...(offerValue !== undefined ? { offerPrice: offerValue } : {}),
        quantity: quantityValue,
        createdAt: new Date().toISOString(),
        description: newProduct.description || 'Exclusive boutique craftsmanship.',
        image: coverImage,
        media,
        itemCode,
        ...(newProduct.categoryCode.trim() ? { categoryCode: newProduct.categoryCode.trim().toUpperCase() } : {}),
        ...(newProduct.patternCode.trim() ? { patternCode: newProduct.patternCode.trim().toUpperCase() } : {}),
        ...(newProduct.color.trim() ? { color: newProduct.color.trim(), colorCode: colorCodeFor(newProduct.color) } : {}),
        ...(newProduct.size.trim() ? { size: newProduct.size.trim() } : {}),
        ...(newProduct.kuchuCode.trim() ? { kuchuCode: newProduct.kuchuCode.trim().toUpperCase() } : {}),
        ...(designKeyFor(newProduct.categoryCode, newProduct.patternCode) ? { designKey: designKeyFor(newProduct.categoryCode, newProduct.patternCode) } : {}),
        ...(newProduct.compatibleKuchuIds.length > 0 ? { compatibleKuchuIds: newProduct.compatibleKuchuIds } : {}),
      };
      if (firebaseConfigured) {
        await withTimeout(publishProduct(addedProduct), 60000, 'Saving the item is taking too long. Check your connection; if it does not appear in the catalog, try again.');
        audit('PRODUCT_PUBLISHED', 'product', addedProduct.id, `Published ${addedProduct.name}`);
      } else {
        setProducts([addedProduct, ...products]);
      }
      setNewProduct({ name: '', category: 'Sarees', price: '', offerPrice: '', quantity: '1', description: '', image: '', categoryCode: '', patternCode: '', color: '', size: '', kuchuCode: '', itemCode: '', compatibleKuchuIds: [] as string[] });
      setProductMediaFiles([]);
      setColorSuggestions([]);
      setLastPublished(addedProduct);
      alert(firebaseConfigured ? 'Item published to the live catalog.' : 'Item added to the local demo catalog.');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not publish product.');
    } finally {
      setIsUploadingProduct(false);
    }
  };

  const handleCheckoutQrUpload = async () => {
    if (!paymentQrFile || isUploadingQr) return;
    if (!confirmHostAction('Update the checkout QR for customers?')) return;
    setIsUploadingQr(true);
    try {
      const url = firebaseConfigured
        ? await withTimeout(uploadCheckoutQr(paymentQrFile), 60000, 'Saving the checkout QR is taking too long. Check your internet connection and try again.')
        : URL.createObjectURL(paymentQrFile);
      setPaymentQrUrl(url);
      setPaymentQrUpdatedAt(new Date().toISOString());
      setPaymentQrFile(null);
      alert(firebaseConfigured ? 'Checkout QR updated for all customers.' : 'Checkout QR updated in this local demo.');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not upload payment QR.');
    } finally {
      setIsUploadingQr(false);
    }
  };

  const handlePaymentQrSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] || null;
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Choose an image file for the payment QR.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('The payment QR image must be smaller than 5 MB.');
      return;
    }
    setPaymentQrFile(file);
  };

  const removeProductMediaFile = (index: number) => setProductMediaFiles(files => files.filter((_, fileIndex) => fileIndex !== index));

  // Host Action: Edit or remove a published product
  const handleUpdateProduct = async (
    productId: string,
    changes: { name: string; category: string; price: number; offerPrice?: number; quantity: number; status: ProductStatus; itemCode?: string; color?: string; colorCode?: string; size?: string; categoryCode?: string; patternCode?: string; compatibleKuchuIds?: string[] },
  ) => {
    try {
      if (firebaseConfigured) {
        await withTimeout(updateProduct(productId, changes), 30000, 'Saving the changes is taking too long. Check your internet connection and try again.');
        audit('PRODUCT_UPDATED', 'product', productId, `Edited: ${Object.keys(changes).join(', ')}`);
      } else {
        setProducts(current => current.map(product => product.id === productId ? { ...product, ...changes, ...(changes.categoryCode !== undefined || changes.patternCode !== undefined ? { designKey: designKeyFor(changes.categoryCode || '', changes.patternCode || '') || undefined } : {}) } : product));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not update the product.');
      throw error;
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!confirmHostAction(`Remove "${product.name}" from the catalog?`)) return;
    try {
      if (firebaseConfigured) {
        await withTimeout(deleteProduct(product.id), 30000, 'Removing the item is taking too long. Check your internet connection and try again.');
      } else {
        setProducts(current => current.filter(item => item.id !== product.id));
      }
      audit('PRODUCT_DELETED', 'product', product.id, `Deleted product ${product.name}`);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not remove the product.');
      throw error;
    }
  };

  // Customer enquiries. The host's WhatsApp number is never shown to customers:
  // they leave a message and their own number, and the host replies from the panel.
  const openEnquiry = (product?: Product) => {
    setEnquiryProduct(product ? { id: product.id, name: product.name } : null);
    setEnquiryMessage(product ? `I'm interested in "${product.name}" (₹${unitPrice(product)}). Is it available?` : '');
    setEnquiryError('');
    setEnquiryNeedsSignIn(false);
    setEnquirySent(false);
    setIsEnquiryOpen(true);
  };

  const sendEnquiry = async () => {
    if (enquirySending) return;
    const name = enquiryName.trim();
    const phone = enquiryPhone.replace(/\D/g, '');
    const message = enquiryMessage.trim();
    if (!name) {
      setEnquiryError(tr('Please enter your name.'));
      return;
    }
    if (phone.length < 10 || phone.length > 15) {
      setEnquiryError(tr('Enter your 10-digit WhatsApp number so we can reply.'));
      return;
    }
    if (!message) {
      setEnquiryError(tr('Please type your question.'));
      return;
    }
    if (Date.now() - lastEnquiryAt < 20000) {
      setEnquiryError(tr('Please wait a few seconds before sending another enquiry.'));
      return;
    }
    setEnquirySending(true);
    setEnquiryError('');
    setEnquiryNeedsSignIn(false);
    try {
      const enquiryInput = { name, phone, message, productId: enquiryProduct?.id, productName: enquiryProduct?.name };
      if (firebaseConfigured) {
        let uid = firebaseUser?.uid || '';
        if (!uid) {
          try {
            uid = await ensureCustomerSession();
          } catch (sessionError) {
            console.error('Enquiry session failed:', sessionError);
            setEnquiryNeedsSignIn(true);
            setEnquiryError(tr('A quick sign-in is needed to send your message. Please sign in with Google, then press Send again.'));
            return;
          }
        }
        await withTimeout(submitEnquiry(uid, enquiryInput), 30000, 'Sending is taking too long. Check your internet connection and try again.');
      } else {
        setEnquiries(current => [{ ...enquiryInput, id: `ENQ-${Date.now()}`, userId: 'local', status: 'NEW', createdAt: new Date().toISOString() }, ...current]);
      }
      setLastEnquiryAt(Date.now());
      setEnquirySent(true);
      setEnquiryMessage('');
    } catch (error) {
      console.error('Enquiry failed:', error);
      setEnquiryNeedsSignIn(!googleUser);
      setEnquiryError(googleUser ? tr('We could not send your enquiry right now. Please try again in a moment.') : tr('We could not send your message. Please sign in with Google and try again.'));
    } finally {
      setEnquirySending(false);
    }
  };

  const handleEnquiryStatus = async (enquiry: Enquiry, status: 'NEW' | 'REPLIED') => {
    try {
      if (firebaseConfigured) {
        await withTimeout(setEnquiryStatus(enquiry.id, status), 30000, 'Updating the enquiry is taking too long. Check your internet connection and try again.');
      } else {
        setEnquiries(current => current.map(item => item.id === enquiry.id ? { ...item, status } : item));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not update the enquiry.');
    }
  };

  const handleDeleteEnquiry = async (enquiry: Enquiry) => {
    if (!confirmHostAction(`Delete the enquiry from ${enquiry.name}?`)) return;
    try {
      if (firebaseConfigured) {
        await withTimeout(deleteEnquiry(enquiry.id), 30000, 'Deleting the enquiry is taking too long. Check your internet connection and try again.');
      } else {
        setEnquiries(current => current.filter(item => item.id !== enquiry.id));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not delete the enquiry.');
    }
  };

  const shareProduct = (product: Product) => setShareTarget(product);

  // Host: categories, delivery details, assistant feedback
  const handleAddCategory = async () => {
    const name = newCategoryName.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name) {
      alert('Enter a category name.');
      return;
    }
    const existing = categoryOptions.find(option => option.toLowerCase() === name.toLowerCase());
    if (existing) {
      setNewProduct(current => ({ ...current, category: existing }));
      setAddingCategory(false);
      setNewCategoryName('');
      return;
    }
    try {
      const nextCustom = [...customCategories, name];
      if (firebaseConfigured) {
        await withTimeout(saveCategories(nextCustom), 30000, 'Saving the category is taking too long. Check your internet connection and try again.');
        audit('CATEGORIES_CHANGED', 'settings', 'categories', 'Added a category');
      }
      setCustomCategories(nextCustom);
      setNewProduct(current => ({ ...current, category: name }));
      setAddingCategory(false);
      setNewCategoryName('');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not add the category.');
    }
  };

  const handleRemoveCategory = async (name: string) => {
    if (!confirmHostAction(`Remove the category "${name}"?`)) return;
    try {
      const nextCustom = customCategories.filter(option => option !== name);
      if (firebaseConfigured) {
        await withTimeout(saveCategories(nextCustom), 30000, 'Removing the category is taking too long. Check your internet connection and try again.');
        audit('CATEGORIES_CHANGED', 'settings', 'categories', 'Removed a category');
      }
      setCustomCategories(nextCustom);
      if (newProduct.category === name) setNewProduct(current => ({ ...current, category: DEFAULT_CATEGORIES[0] }));
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not remove the category.');
    }
  };

  const handleUpdateDelivery = async (orderId: string, deliveryPartner: string, deliveryComments: string) => {
    try {
      if (firebaseConfigured) {
        await withTimeout(updateOrderDelivery(orderId, deliveryPartner, deliveryComments), 30000, 'Saving is taking too long. Check your internet connection and try again.');
      } else {
        setActiveOrders(current => current.map(order => order.orderId === orderId ? { ...order, deliveryPartner, deliveryComments } : order));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not save the delivery details.');
      throw error;
    }
  };

  const handleInsightFeedback = (insightKey: string, useful: boolean) => {
    const next = { ...aiWeights, [insightKey]: adjustWeight(aiWeights[insightKey], useful) };
    setAiWeights(next);
    if (firebaseConfigured) {
      void saveAiMemory(next).catch(error => setSyncError(error instanceof Error ? error.message : 'Could not save your feedback.'));
    }
  };

  // Customer: act on a banner button
  const handleOfferAction = (action: OfferAction) => {
    setCustomerTab('SHOP');
    if (action.type === 'shop-category') {
      setCategoryFilter(action.category);
      setOnlyOffers(Boolean(action.onlyOffers));
    } else if (action.type === 'show-new') {
      setCategoryFilter('All');
      setOnlyOffers(false);
      setSortBy('newest');
    } else if (action.type === 'show-offers') {
      setCategoryFilter('All');
      setOnlyOffers(true);
    } else if (action.type === 'open-cart') {
      setIsCartOpen(true);
      return;
    }
    window.setTimeout(() => document.getElementById('mr-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const focusProduct = (productId: string) => {
    setCustomerTab('SHOP');
    setCategoryFilter('All');
    setOnlyOffers(false);
    setOnlyInStock(false);
    window.setTimeout(() => {
      document.getElementById(`product-${productId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedProductId(productId);
      window.setTimeout(() => setHighlightedProductId(''), 3600);
    }, 120);
  };

  const toggleOrder = (orderId: string) => setExpandedOrders(current => ({ ...current, [orderId]: !current[orderId] }));

  const handleRejectOrder = async (orderId: string, reason: string, note: string) => {
    try {
      if (firebaseConfigured) {
        await withTimeout(markCloudOrderNotAccepted(orderId, reason, note), 30000, 'Rejecting the order is taking too long. Check your internet connection and try again.');
      } else {
        globalOrderBook.markNotAccepted(orderId);
        setActiveOrders([...globalOrderBook.getAllOrders()].map(order => order.orderId === orderId ? { ...order, rejectionReason: reason, rejectionNote: note } : order));
      }
      audit('ORDER_REJECTED', 'order', orderId, `Rejected: ${reason}`);
      notifyCustomer(orderId, 'CANCELLED');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not reject the order.');
      throw error;
    }
  };

  const handleHoldOrder = async (orderId: string, reason: string, note: string) => {
    try {
      if (firebaseConfigured) {
        await withTimeout(holdCloudOrder(orderId, firebaseUser?.email || userEmail, reason, note), 30000, 'Putting the order on hold is taking too long. Check your internet connection and try again.');
      } else {
        globalOrderBook.holdOrder(orderId, userEmail, reason, note);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
      audit('ORDER_HELD', 'order', orderId, `On hold: ${reason}`);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not put the order on hold.');
      throw error;
    }
  };

  const handleReleaseOrder = async (orderId: string) => {
    try {
      if (firebaseConfigured) {
        await withTimeout(releaseCloudOrderHold(orderId), 30000, 'Releasing the order is taking too long. Check your internet connection and try again.');
      } else {
        globalOrderBook.releaseHold(orderId);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
      audit('ORDER_RELEASED', 'order', orderId, 'Hold released');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not release the order.');
      throw error;
    }
  };

  // One-time setup of the AI screenshot reader (developer only): accepts the AI model's licence on your Cloudflare account.
  const handleAcceptAiLicense = async () => {
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Sign in with Google first.');
      const response = await fetch('/api/ai-license', { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json() as { ok: boolean; message?: string; error?: string };
      alert(body.ok ? (body.message || 'Done.') : `Not done: ${body.error || 'unknown error'}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not reach the server.');
    }
  };

  const handlePublishKuchu = async (kuchu: Omit<KuchuDesign, 'photos' | 'createdAt'>, files: File[]) => {
    if (!(await askAccept(`Publish Kuchu ${kuchu.id}?`, `${kuchu.name} · ₹${kuchu.price} · ${files.length} photo(s). It becomes available to tag on sarees.`, 'Publish Kuchu'))) return;
    const photos = firebaseConfigured
      ? await withTimeout(uploadProductMedia(files), 120000, 'Uploading the photos is taking too long. Check your internet connection and try again.')
      : files.map(file => ({ url: URL.createObjectURL(file), type: 'image' as const, name: file.name }));
    const full: KuchuDesign = { ...kuchu, photos, createdAt: new Date().toISOString() };
    if (firebaseConfigured) {
      await withTimeout(publishKuchu(full), 60000, 'Saving is taking too long. Check your internet connection and try again.');
      audit('KUCHU_PUBLISHED', 'kuchu', full.id, `Published Kuchu ${full.name} (₹${full.price})`);
    } else {
      setKuchuList(current => [...current, full].sort((left, right) => left.id.localeCompare(right.id)));
    }
  };

  const handleUpdateKuchu = async (id: string, changes: { name: string; price: number; active: boolean }) => {
    if (firebaseConfigured) {
      await withTimeout(updateKuchu(id, changes), 30000, 'Saving is taking too long. Check your internet connection and try again.');
      audit('KUCHU_UPDATED', 'kuchu', id, `Kuchu ${changes.name}: ₹${changes.price}, ${changes.active ? 'visible' : 'hidden'}`);
    } else {
      setKuchuList(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
    }
  };

  const handleDeleteKuchu = async (kuchu: KuchuDesign) => {
    const used = products.filter(product => (product.compatibleKuchuIds || []).includes(kuchu.id)).length;
    if (!(await askDialog({ title: `Delete Kuchu ${kuchu.id}?`, details: `${kuchu.name}${used ? ` is tagged on ${used} saree(s); it will no longer be offered on them.` : '.'} Past orders keep their details.`, confirmLabel: 'Delete Kuchu', tone: 'danger' }))) return;
    try {
      if (firebaseConfigured) {
        await withTimeout(deleteKuchu(kuchu.id), 30000, 'Deleting is taking too long. Check your internet connection and try again.');
        audit('KUCHU_DELETED', 'kuchu', kuchu.id, `Deleted Kuchu ${kuchu.name}`);
      } else {
        setKuchuList(current => current.filter(item => item.id !== kuchu.id));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not delete the Kuchu.');
    }
  };

  const handleSaveSitePages = async (pages: SitePages) => {
    if (role !== 'DEVELOPER') return;
    if (!(await askAccept('Publish these page changes?', 'About us, Contact and Terms & Conditions will show this text to customers straight away.', 'Publish pages'))) return;
    if (firebaseConfigured) {
      await withTimeout(saveSitePages(pages), 30000, 'Saving is taking too long. Check your internet connection and try again.');
      audit('SITE_PAGES_EDITED', 'settings', 'pages', 'Edited the About, Contact or Terms pages');
    }
    setSitePages(pages);
  };

  const handleSaveShipping = async () => {
    const prefixes = parsePrefixes(prefixDraft);
    if (shippingConfig.ruleBEnabled && prefixes.length === 0) {
      alert('Enter at least one Bangalore pincode prefix, for example 560.');
      return;
    }
    if (!(await askAccept('Save courier charge rules?', 'New orders will use these rules straight away. Existing orders are not changed.', 'Save rules'))) return;
    const next = { ...shippingConfig, bangalorePrefixes: prefixes };
    try {
      if (firebaseConfigured) await withTimeout(saveShippingConfig(next), 30000, 'Saving is taking too long. Check your internet connection and try again.');
      setShippingConfig(next);
      audit('SHIPPING_RULES_CHANGED', 'settings', 'shipping', `Rule A ${next.ruleAEnabled ? 'on' : 'off'}, Rule B ${next.ruleBEnabled ? 'on' : 'off'} (${prefixes.join(', ')})`);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not save the courier rules.');
    }
  };

  const handleSaveUpi = async () => {
    const id = upiDraft.trim();
    if (id && !isValidUpiId(id)) {
      alert('Enter a valid UPI ID, for example yourname@bank.');
      return;
    }
    if (!confirmHostAction(id ? 'Save these UPI details? Customers will pay to this UPI ID.' : 'Turn off the dynamic QR and use only the uploaded QR?')) return;
    try {
      if (firebaseConfigured) await withTimeout(saveUpiSettings(id, payeeDraft), 30000, 'Saving is taking too long. Check your internet connection and try again.');
      setUpiId(id);
      setPayeeName(payeeDraft.trim());
      alert(id ? 'UPI details saved. Checkout now makes a QR for each order amount.' : 'Dynamic QR turned off.');
      audit('UPI_SETTINGS_CHANGED', 'settings', 'checkout', upiDraft.trim() ? `UPI ID set to ${upiDraft.trim()}` : 'Dynamic QR turned off');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not save the UPI details.');
    }
  };

  const handleReportPaymentIssue = async (order: Order, issueType: string, details: string) => {
    if (!firebaseConfigured || !firebaseUser) throw new Error('Sign in with Google to send a report, or message us on WhatsApp.');
    const phone = (order.address?.phone || '').replace(/\D/g, '');
    await withTimeout(submitEnquiry(firebaseUser.uid, {
      name: order.address?.fullName || 'Customer',
      phone,
      message: `[Payment problem] ${issueType}${details ? `\n${details}` : ''}\nOrder ${order.orderId} · item total ₹${order.itemTotal}${order.itemPayment?.utr ? ` · UTR ${order.itemPayment.utr}` : ''}`,
      kind: 'PAYMENT_ISSUE',
      orderId: order.orderId,
      issueType,
      productName: `Order ${order.orderId}`,
    }), 30000, 'Sending is taking too long. Check your internet connection and try again.');
  };

  // Reject one item of an order (for example a damaged piece) without cancelling the rest.
  const REJECT_ITEM_REASONS: DialogReason[] = [
    { label: 'Item is damaged or defective', note: 'This piece did not pass our quality check. We are sorry. The rest of your order continues, and we will refund this item.' },
    { label: 'Item is out of stock', note: 'This piece is no longer available. The rest of your order continues, and we will refund this item.' },
    { label: 'Colour or design does not match the photo', note: 'This piece does not match what you chose. The rest of your order continues, and we will refund this item.' },
    { label: 'Other', note: '' },
  ];
  const handleRejectItem = async (order: Order, index: number) => {
    const line = order.items[index];
    if (!line) return;
    const result = await askDialog({
      title: `Reject "${line.name}"${line.color ? ` (${line.color})` : ''}?`,
      details: `Order ${order.orderId} · ₹${line.price * line.quantity} for this item. Its stock is put back, the customer is asked for refund details, and the rest of the order continues. To cancel everything, use Reject order instead.`,
      confirmLabel: 'Reject this item',
      tone: 'danger',
      reasons: REJECT_ITEM_REASONS,
    });
    if (!result) return;
    try {
      if (firebaseConfigured) {
        await withTimeout(rejectCloudOrderItem(order.orderId, index, actor().nickname, result.reason, result.note), 30000, 'Rejecting the item is taking too long. Check your internet connection and try again.');
        audit('ORDER_ITEM_REJECTED', 'order', order.orderId, `Rejected ${line.itemCode || line.name}: ${result.reason}`);
        notifyCustomer(order.orderId, 'ITEM_REJECTED');
      } else {
        setSyncError('Rejecting single items needs the live database.');
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not reject the item.');
    }
  };

  const handleSubmitRefund = async (orderId: string, method: 'UPI_ID' | 'UPI_PHONE', value: string) => {
    if (firebaseConfigured) {
      await withTimeout(submitRefundDetails(orderId, method, value), 30000, 'Saving is taking too long. Check your internet connection and try again.');
    } else {
      globalOrderBook.submitRefundDetails(orderId, method, value);
      setActiveOrders([...globalOrderBook.getAllOrders()]);
    }
  };

  const handleResetInsights = async () => {
    if (role !== 'DEVELOPER') return;
    if (!confirmHostAction('Reset everything the AI assistant learned from your thumbs up / down? This cannot be undone.')) return;
    setAiWeights({});
    if (firebaseConfigured) {
      try {
        await resetAiMemory();
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Could not reset the AI insights.');
      }
    }
  };

  const handleSaveOrderMessage = async (orderId: string, message: string) => {
    try {
      if (firebaseConfigured) {
        await withTimeout(saveOrderMessage(orderId, message), 30000, 'Saving the message is taking too long. Check your internet connection and try again.');
      } else {
        setActiveOrders(current => current.map(order => order.orderId === orderId ? { ...order, hostMessage: message, hostMessageAt: new Date().toISOString() } : order));
      }
      audit('MESSAGE_TO_CUSTOMER', 'order', orderId, 'Sent a message to the customer');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not save the message.');
      throw error;
    }
  };

  const handleSaveWhatsApp = async (digitsInput: string) => {
    const digits = digitsInput.replace(/\D/g, '');
    if (digits && digits.length < 10) {
      alert('Enter a valid WhatsApp number (10 digits, or with the country code).');
      return;
    }
    try {
      if (firebaseConfigured) {
        await withTimeout(saveContactSettings(digits), 30000, 'Saving the number is taking too long. Check your internet connection and try again.');
        audit('WHATSAPP_NUMBER_CHANGED', 'settings', 'contact', 'Changed the shop WhatsApp number');
      } else {
        setHostWhatsApp(digits);
      }
      setWhatsAppDraft(digits);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not save the WhatsApp number.');
    }
  };

  const handleFeedbackStatus = async (item: Feedback, status: 'NEW' | 'REVIEWED') => {
    try {
      if (firebaseConfigured) {
        await withTimeout(setFeedbackStatus(item.id, status), 30000, 'Updating is taking too long. Check your internet connection and try again.');
      } else {
        setFeedbackItems(current => current.map(entry => entry.id === item.id ? { ...entry, status } : entry));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not update the feedback.');
    }
  };

  const handleDeleteFeedback = async (item: Feedback) => {
    if (!confirmHostAction('Delete this feedback?')) return;
    try {
      if (firebaseConfigured) {
        await withTimeout(deleteFeedback(item.id), 30000, 'Deleting is taking too long. Check your internet connection and try again.');
      } else {
        setFeedbackItems(current => current.filter(entry => entry.id !== item.id));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not delete the feedback.');
    }
  };

  // Customer: short feedback. It is analysed on the spot and filed for the host.
  const handleSubmitFeedback = async (input: { name: string; text: string }): Promise<FeedbackResult> => {
    const analysis = analyzeFeedback(input.text);
    try {
      if (firebaseConfigured) {
        let uid = firebaseUser?.uid || '';
        if (!uid) {
          try {
            uid = await ensureCustomerSession();
          } catch (sessionError) {
            console.error('Feedback session failed:', sessionError);
            return { status: 'needs-signin' };
          }
        }
        await withTimeout(submitFeedback(uid, {
          name: input.name,
          text: input.text,
          sentiment: analysis.sentiment,
          category: analysis.category,
          confidence: analysis.confidence,
          language: analysis.language,
        }), 30000, 'Sending is taking too long. Check your internet connection and try again.');
      } else {
        setFeedbackItems(current => [{
          id: `FB-${Date.now()}`, userId: 'local', name: input.name || undefined, text: input.text, sentiment: analysis.sentiment,
          category: analysis.category, confidence: analysis.confidence, language: analysis.language, status: 'NEW', createdAt: new Date().toISOString(),
        }, ...current]);
      }
      return { status: 'sent', sentiment: analysis.sentiment, category: analysis.category };
    } catch (error) {
      console.error('Feedback failed:', error);
      return googleUser ? { status: 'error' } : { status: 'needs-signin' };
    }
  };

  // Cart Management
  type KuchuSelection = { kuchu?: KuchuDesign };
  const addToCart = (product: Product, selection?: KuchuSelection) => isPurchasable(product) && setCart(current => {
    const candidate: CartLine = { product, quantity: 1, ...(selection?.kuchu ? { kuchu: selection.kuchu } : {}) };
    const key = lineKey(candidate);
    const limit = maxOrderable(products.find(item => item.id === product.id) || product);
    const sameProduct = current.filter(line => line.product.id === product.id).reduce((sum, line) => sum + line.quantity, 0);
    if (sameProduct >= limit) return current;
    return current.some(line => lineKey(line) === key)
      ? current.map(line => lineKey(line) === key ? { ...line, quantity: line.quantity + 1 } : line)
      : [...current, candidate];
  });
  const changeQuantity = (key: string, delta: number) => setCart(current => current.flatMap(line => {
    if (lineKey(line) !== key) return [line];
    const limit = maxOrderable(products.find(item => item.id === line.product.id) || line.product);
    const others = current.filter(other => other.product.id === line.product.id && lineKey(other) !== key).reduce((sum, other) => sum + other.quantity, 0);
    const nextQuantity = Math.min(line.quantity + delta, limit - others);
    return nextQuantity <= 0 ? [] : [{ ...line, quantity: nextQuantity }];
  }));
  const removeFromCart = (key: string) => setCart(current => current.filter(line => lineKey(line) !== key));
  const buyNow = (product: Product, selection?: KuchuSelection) => {
    addToCart(product, selection);
    setCheckoutStep(1);
    setIsCheckoutOpen(false);
    setIsCartOpen(true);
    setCustomerTab('SHOP');
  };
  // What the customer picked on a saree card: none, or one Kuchu design with a thread colour.
  const selectedKuchuFor = (product: Product): KuchuDesign | null => compatibleKuchu(product, kuchuList).find(item => item.id === kuchuChoice[choiceKey(product)]) || null;
  const selectionFor = (product: Product): KuchuSelection => {
    const kuchu = selectedKuchuFor(product);
    return kuchu ? { kuchu } : {};
  };
  const cartCount = cart.reduce((count, line) => count + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + lineUnitPrice(line.product, line.kuchu) * line.quantity, 0);
  const cartHasKuchu = cart.some(line => Boolean(line.kuchu));

  // Customer Action: Submit Order via OrderBook Engine
  // Which courier rule applies to the order being placed (checked again by the host).
  const customerKey = firebaseUser?.uid || userEmail || 'guest';
  const courierDecision = evaluateCourierRules({
    items: cart.map(line => ({ quantity: line.quantity })),
    pincode: address.pincode || '',
    userId: customerKey,
    recentOrders: isStaff ? [] : activeOrders,
    config: shippingConfig,
    now: Date.now(),
  });

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAddressComplete(address)) {
      alert(tr('Complete the required delivery-address fields before placing your order.'));
      setCheckoutStep(1);
      return;
    }
    if (!address.pincodeCheck) {
      alert(tr('Check the pincode online before placing your order.'));
      setCheckoutStep(1);
      return;
    }
    if (['NOT_FOUND', 'NOT_SERVICEABLE'].includes(address.pincodeCheck.status)) {
      alert(tr('This pincode could not be confirmed as deliverable. Please check the address or contact the host.'));
      setCheckoutStep(1);
      return;
    }
    if (cart.length === 0) {
      alert(tr('Your cart is empty. Add at least one item before placing an order.'));
      setIsCheckoutOpen(false);
      return;
    }
    if (!courierPolicyAccepted) {
      alert(t.acceptCourierNotice);
      return;
    }
    if (unavailableLines.length > 0) {
      alert(tr('Some items in your cart are no longer available. Please remove them and try again.'));
      setIsCheckoutOpen(false);
      setIsCartOpen(true);
      return;
    }
    try {
      let customerUid = firebaseUser?.uid || '';
      if (firebaseConfigured && !customerUid) {
        try {
          customerUid = await ensureCustomerSession();
        } catch (sessionError) {
          console.error('Guest checkout session failed:', sessionError);
          alert(tr('We could not start a secure checkout. Please use the "Sign in with Google" button in this step and try again.'));
          return;
        }
      }
      const proofProblem = validateProofFile(paymentProof);
      if (proofProblem || !paymentProof) {
        alert(tr(proofProblem));
        return;
      }
      if (consentEmail && !isEmail(contactEmail)) {
        alert(tr('Enter a valid email address to get updates by email, or untick the email box.'));
        return;
      }
      if (proofCheck?.blocking) {
        alert(proofCheck.blocking);
        return;
      }
      if (!isValidUtr(utr)) {
        alert(tr('Enter the 12-digit UTR shown in your payment app.'));
        return;
      }
      const proofFingerprint = await fingerprintFile(paymentProof);
      let proofUrl = '';
      if (firebaseConfigured) {
        setUploadingProof(true);
        try {
          proofUrl = await withTimeout(uploadPaymentProof(paymentProof), 90000, 'Uploading the screenshot is taking too long. Check your internet connection and try again.');
        } finally {
          setUploadingProof(false);
        }
      } else {
        proofUrl = URL.createObjectURL(paymentProof);
      }
      const orderItems = cart.map(line => ({ productId: line.product.id, name: line.product.name, price: lineUnitPrice(line.product, line.kuchu), regularPrice: lineRegularPrice(line.product, line.kuchu), quantity: line.quantity, ...(line.product.color ? { color: line.product.color } : {}), ...((line.kuchu ? itemCodeWithKuchu(line.product.itemCode, line.kuchu.id) : line.product.itemCode) ? { itemCode: line.kuchu ? itemCodeWithKuchu(line.product.itemCode, line.kuchu.id) : line.product.itemCode } : {}), ...(line.product.image ? { image: line.product.image } : {}), ...(line.kuchu ? { kuchuId: line.kuchu.id, kuchuName: line.kuchu.name, kuchuPrice: line.kuchu.price } : {}) }));
      const deliveryAddress: CustomerAddress = {
        ...address,
        country: address.country?.trim() || 'India',
        street: [address.houseNameOrNumber, address.street1, address.street2].filter(Boolean).join(', '),
        consentTimestamp: new Date().toISOString(),
      };
      const order = firebaseConfigured
        ? await createCloudOrder(
          customerUid,
          orderItems,
          cartTotal,
          deliveryAddress,
          courierPolicyAccepted,
          utr.trim(),
          proofUrl,
          proofFingerprint,
          proofCheck ? (({ blocking: _ignored, ...storable }) => storable)(proofCheck) : undefined,
          courierDecision,
          cartHasKuchu ? new Date().toISOString() : undefined,
          newConsent({ email: contactEmail, whatsapp: address.phone, consentEmail, consentWhatsapp, consentPromos }, new Date().toISOString()),
        )
        : globalOrderBook.createOrder(
          userEmail,
          orderItems,
          cartTotal,
          deliveryAddress,
          courierPolicyAccepted
        );

      if (!firebaseConfigured) {
        globalOrderBook.submitItemPayment(order.orderId, cartTotal, utr.trim(), proofUrl);
        setActiveOrders(globalOrderBook.getAllOrders());
      }
      if (firebaseConfigured) {
        // Stock was blocked for this order; update what the customer sees (and their saved copy) without extra reads.
        const bought = new Map<string, number>();
        orderItems.forEach(item => bought.set(item.productId, (bought.get(item.productId) || 0) + item.quantity));
        const updatedProducts = products.map(product => (
          bought.has(product.id) && typeof product.quantity === 'number'
            ? { ...product, quantity: Math.max(0, product.quantity - (bought.get(product.id) || 0)) }
            : product
        ));
        setProducts(updatedProducts);
        cacheProducts(updatedProducts);
      }
      if (saveAddressForLater && (googleUser || !firebaseConfigured)) {
        const savedAddress: SavedDeliveryAddress = {
          ...deliveryAddress,
          id: selectedAddressId || `address-${Date.now()}`,
        };
        try {
          if (firebaseConfigured && googleUser) {
            await saveCloudDeliveryAddress(googleUser.uid, savedAddress);
          } else {
            const nextAddresses = [savedAddress, ...savedAddresses.filter(saved => saved.id !== savedAddress.id)];
            setSavedAddresses(nextAddresses);
            localStorage.setItem(`mala-royale:delivery-addresses:${userEmail}`, JSON.stringify(nextAddresses));
          }
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : 'Order placed, but the address could not be saved for later.');
        }
      }
      setCart([]);
      setUtr('');
      setPaymentProof(null);
      setProofCheck(null);
      setIsCheckoutOpen(false);
      setCheckoutStep(1);
      setCustomerTab('ORDERS');
      setOrderCopied(false);
      setExpandedOrders({ [order.orderId]: true });
      notifyCustomer(order.orderId, 'ORDER_PLACED');
      setPlacedOrder({ orderId: order.orderId, total: cartTotal, phone: deliveryAddress.phone, name: deliveryAddress.fullName });
    } catch (err: any) {
      const message = err instanceof Error && err.message.includes('permission-denied')
        ? 'Firestore rejected this action. Check the deployed Firestore rules and signed-in account role.'
        : err.message;
      alert(message);
      // The most likely reason is that stock changed, so show the customer the current quantities.
      if (firebaseConfigured && !isStaff) {
        void refreshProductsFresh().then(setProducts).catch(() => undefined);
        void refreshKuchuFresh().then(setKuchuList).catch(() => undefined);
      }
    }
  };

  const handleConfirmDelivery = async (order: Order) => {
    if (!order.address.pincodeCheck) {
      setSyncError('This order needs an online pincode check before delivery can be confirmed.');
      return;
    }
    if (['NOT_FOUND', 'NOT_SERVICEABLE'].includes(order.address.pincodeCheck.status)) {
      setSyncError('This pincode is not confirmed as deliverable. Contact the customer or courier.');
      return;
    }
    if (!(await askAccept(`Accept the delivery address for ${order.orderId}?`, `${orderSummary(order)}. Pincode ${order.address.pincode || ''}: ${order.address.pincodeCheck.status}. The customer will see the order move forward.`, 'Accept address'))) return;
    try {
      if (firebaseConfigured) {
        await confirmCloudOrderDelivery(order.orderId, firebaseUser?.email || userEmail);
      } else {
        globalOrderBook.confirmDelivery(order.orderId, userEmail);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
      audit('ADDRESS_ACCEPTED', 'order', order.orderId, `Accepted delivery address (${order.address.pincode || 'no pincode'})`);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not confirm the delivery address.');
    }
  };

  const handleVerifyPayment = async (orderId: string, kind: 'ITEM' | 'COURIER') => {
    const paymentKindLabel = kind === 'ITEM' ? 'item payment' : 'courier payment';
    const target = activeOrders.find(item => item.orderId === orderId);
    const paid = kind === 'ITEM' ? target?.itemPayment : target?.courierPayment;
    if (!(await askAccept(`Accept the ${paymentKindLabel} for ${orderId}?`, `${orderSummary(target)}. Amount to confirm: ₹${paid?.amount ?? ''}${paid?.utr ? ` · UTR ${paid.utr}` : ''}. Only accept after checking your bank or UPI app.`, 'Payment received, accept'))) return;
    try {
      if (firebaseConfigured) {
        await verifyCloudPayment(orderId, kind);
      } else {
        globalOrderBook.verifyPayment(orderId, kind);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
      audit(kind === 'ITEM' ? 'ITEM_PAYMENT_ACCEPTED' : 'COURIER_PAYMENT_ACCEPTED', 'order', orderId, `Accepted ${paymentKindLabel}`);
      notifyCustomer(orderId, 'PAYMENT_VERIFIED');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not verify payment.');
    }
  };

  const handleCourierReceipt = async (
    orderId: string,
    bill: Omit<CourierBill, 'billId'>,
  ) => {
    try {
      if (firebaseConfigured) {
        await attachCloudCourierBill(orderId, bill);
      } else {
        globalOrderBook.attachCourierBill(orderId, bill);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
      audit('COURIER_BILL_ADDED', 'order', orderId, `Courier charge ₹${bill.amount} (${bill.courierName})`);
      notifyCustomer(orderId, 'COURIER_QUOTE_ADDED');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not save courier bill.');
      throw error;
    }
  };

  const handleCourierPayment = async (orderId: string, utr: string, proof: File) => {
    try {
      const proofFingerprint = await fingerprintFile(proof);
      if (firebaseConfigured) {
        if (!firebaseUser) throw new Error('Sign in before submitting payment.');
        const proofUrl = await withTimeout(uploadPaymentProof(proof), 90000, 'Uploading the screenshot is taking too long. Check your internet connection and try again.');
        await submitCloudCourierPayment(orderId, firebaseUser.uid, utr, proofUrl, proofFingerprint);
      } else {
        globalOrderBook.submitCourierPayment(orderId, userEmail, utr, URL.createObjectURL(proof));
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not submit courier payment.');
      throw error;
    }
  };

  const handleDispatch = async (orderId: string) => {
    const target = activeOrders.find(item => item.orderId === orderId);
    if (!(await askAccept(`Mark ${orderId} as dispatched?`, `${orderSummary(target)}. The customer will see it as dispatched.`, 'Mark dispatched'))) return;
    try {
      if (firebaseConfigured) {
        await submitCloudOrderForDispatch(orderId);
      } else {
        globalOrderBook.submitForDispatch(orderId);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
      audit('ORDER_DISPATCHED', 'order', orderId, 'Marked dispatched');
      notifyCustomer(orderId, 'DISPATCHED');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not submit order for dispatch.');
    }
  };

  const handleNotAccepted = async (orderId: string) => {
    if (!confirmHostAction(`Mark order ${orderId} as not accepted?`)) return;
    try {
      if (firebaseConfigured) {
        await markCloudOrderNotAccepted(orderId);
      } else {
        globalOrderBook.markNotAccepted(orderId);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not update order status.');
    }
  };

  const handleDelivered = async (orderId: string) => {
    const target = activeOrders.find(item => item.orderId === orderId);
    if (!(await askAccept(`Mark ${orderId} as delivered?`, `${orderSummary(target)}. This closes the order.`, 'Mark delivered'))) return;
    try {
      if (firebaseConfigured) {
        await markCloudOrderDelivered(orderId);
      } else {
        globalOrderBook.markDelivered(orderId);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
      audit('ORDER_DELIVERED', 'order', orderId, 'Marked delivered');
      notifyCustomer(orderId, 'DELIVERED');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not mark order delivered.');
    }
  };

  const handleSaveParcel = async (orderId: string, from: ParcelParty, to: ParcelParty) => {
    const parcelDetails: ParcelDetails = {
      from,
      to,
      savedAt: new Date().toISOString(),
      savedBy: firebaseUser?.email || userEmail,
    };
    try {
      if (firebaseConfigured) {
        await saveCloudParcelDetails(orderId, parcelDetails);
      } else {
        globalOrderBook.saveParcelDetails(orderId, parcelDetails);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not save parcel details.');
      throw error;
    }
  };

  const handleCheckPincode = async () => {
    setIsCheckingPincode(true);
    try {
      const result = await checkDeliveryPincode(address.pincode);
      setAddress(previous => ({
        ...previous,
        district: result.district || previous.district,
        taluk: result.taluk || previous.taluk,
        state: result.state || previous.state,
        country: previous.country || 'India',
        pincodeCheck: result,
      }));
    } finally {
      setIsCheckingPincode(false);
    }
  };

  const handleSaveDeliveryAddress = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAddressComplete(address)) {
      alert(tr('Complete all required delivery-address fields before saving.'));
      return;
    }
    const savedAddress: SavedDeliveryAddress = {
      ...address,
      id: editingAddressId || `address-${Date.now()}`,
      consentTimestamp: new Date().toISOString(),
    };
    try {
      if (firebaseConfigured) {
        if (!googleUser) throw new Error('Sign in with Google to save delivery addresses.');
        await saveCloudDeliveryAddress(googleUser.uid, savedAddress);
      } else {
        const nextAddresses = [savedAddress, ...savedAddresses.filter(saved => saved.id !== savedAddress.id)];
        setSavedAddresses(nextAddresses);
        localStorage.setItem(`mala-royale:delivery-addresses:${userEmail}`, JSON.stringify(nextAddresses));
      }
      setSelectedAddressId(savedAddress.id);
      setUseSavedAddress(true);
      setEditingAddressId(null);
      setCustomerTab('ADDRESSES');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not save delivery address.');
    }
  };

  const handleDeleteDeliveryAddress = async (addressId: string) => {
    try {
      if (firebaseConfigured) {
        if (!googleUser) throw new Error('Sign in with Google to manage delivery addresses.');
        await deleteCloudDeliveryAddress(googleUser.uid, addressId);
      } else {
        const nextAddresses = savedAddresses.filter(saved => saved.id !== addressId);
        setSavedAddresses(nextAddresses);
        localStorage.setItem(`mala-royale:delivery-addresses:${userEmail}`, JSON.stringify(nextAddresses));
      }
      if (selectedAddressId === addressId) {
        setSelectedAddressId('');
        setUseSavedAddress(false);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not delete delivery address.');
    }
  };

  const selectDeliveryAddress = (addressId: string) => {
    const savedAddress = savedAddresses.find(saved => saved.id === addressId);
    if (!savedAddress) return;
    setSelectedAddressId(savedAddress.id);
    setUseSavedAddress(true);
    setAddress({ ...savedAddress, consentTimestamp: '', street: savedAddress.street || '' });
  };

  const categoryOptions = Array.from(new Set([
    ...DEFAULT_CATEGORIES,
    ...customCategories,
    ...products.map(product => product.category).filter(Boolean),
  ]));

  const shopCategories = categoryOptions.filter(name => !/kuchu/i.test(name));
  const categoryTiles: CategoryTile[] = shopCategories
    .map(name => {
      const inCategory = products.filter(product => product.category === name);
      return { name, count: inCategory.length, image: inCategory.find(product => product.image)?.image };
    })
    .filter(tile => tile.count > 0);
  const colorMap = new Map<string, ColorTile>();
  products.forEach(product => {
    if (!product.color) return;
    const entry: ColorTile = colorMap.get(product.color) || { name: product.color, hex: PALETTE.find(option => option.code === product.colorCode || option.name === product.color)?.hex || '#d9d2c3', count: 0 };
    entry.count += 1;
    colorMap.set(product.color, entry);
  });
  const colorTiles: ColorTile[] = Array.from(colorMap.values()).sort((left, right) => right.count - left.count);
  const scrollToCatalog = () => window.setTimeout(() => document.getElementById('mr-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);

  const filteredProducts = (() => {
    let list = categoryFilter === 'All' ? products : products.filter(product => product.category === categoryFilter);
    const tokens = searchText.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      list = list.filter(product => {
        const haystack = `${product.name} ${product.category} ${product.color || ''} ${product.description || ''} ${product.itemCode || ''} ${product.size || ''}`.toLowerCase();
        return tokens.every(token => haystack.includes(token));
      });
    }
    if (colorFilter) list = list.filter(product => product.color === colorFilter);
    if (wishOnly) list = list.filter(product => wishlist.has(product.id));
    if (onlyInStock) list = list.filter(isPurchasable);
    if (onlyOffers) list = list.filter(product => discountPercent(product) > 0);
    const sorted = [...list];
    if (sortBy === 'newest') sorted.sort((left, right) => productCreatedMs(right) - productCreatedMs(left));
    else if (sortBy === 'price-asc') sorted.sort((left, right) => unitPrice(left) - unitPrice(right));
    else if (sortBy === 'price-desc') sorted.sort((left, right) => unitPrice(right) - unitPrice(left));
    else if (sortBy === 'discount') sorted.sort((left, right) => discountPercent(right) - discountPercent(left));
    else if (sortBy === 'in-stock') sorted.sort((left, right) => Number(isPurchasable(right)) - Number(isPurchasable(left)));
    return sorted;
  })();

  // Products of the same design in different colours are shown as one listing with colour choices.
  const [variantChoice, setVariantChoice] = useState<Record<string, string>>({});
  const groupedProducts = groupVariants(filteredProducts).map(group => {
    const chosen = group.variants.find(variant => variant.id === variantChoice[group.key]) || (colorFilter ? group.variants.find(variant => variant.color === colorFilter) : undefined);
    const shown = chosen || group.variants.find(isPurchasable) || group.variants[0];
    return { key: group.key, variants: group.variants, product: shown };
  });

  const viewProduct = viewProductId ? products.find(product => product.id === viewProductId) : undefined;
  const viewVariants = viewProduct ? (viewProduct.designKey ? products.filter(product => product.designKey === viewProduct.designKey) : [viewProduct]) : [];
  const viewRelated = viewProduct
    ? products.filter(product => product.id !== viewProduct.id && product.category === viewProduct.category && (!viewProduct.designKey || product.designKey !== viewProduct.designKey) && isPurchasable(product)).slice(0, 8)
    : [];

  const newEnquiryCount = enquiries.filter(item => item.status === 'NEW').length;
  const newFeedbackCount = feedbackItems.filter(item => item.status === 'NEW').length;

  const firstInFirstOut = newestFirst; // host lists show the newest order first
  const deletedOrders = activeOrders.filter(order => Boolean(order.deletedAt));
  const liveOrders = activeOrders.filter(order => !order.deletedAt);
  const hostActiveOrders = liveOrders
    .filter(order => !['SUBMITTED_FOR_DISPATCH', 'DELIVERED', 'NOT_ACCEPTED', 'CANCELLED'].includes(order.stage))
    .sort(firstInFirstOut);
  const hostDispatchedOrders = liveOrders
    .filter(order => order.stage === 'SUBMITTED_FOR_DISPATCH')
    .sort(firstInFirstOut);
  const hostHistoryOrders = liveOrders
    .filter(order => ['DELIVERED', 'NOT_ACCEPTED', 'CANCELLED'].includes(order.stage))
    .sort(firstInFirstOut);
  const hostVisibleOrders = hostOrderTab === 'ACTIVE'
    ? hostActiveOrders
    : hostOrderTab === 'DISPATCHED'
      ? hostDispatchedOrders
      : hostHistoryOrders;

  return (
    <TrContext.Provider value={tr}>
    <div style={{ fontFamily: 'Georgia, serif', backgroundColor: 'var(--mr-ivory)', color: '#333', minHeight: '100vh' }}>
      
      <style>{`
        .mr-zoomable { overflow: hidden; }
        .mr-zoomable img { transition: transform 0.35s ease; }
        .mr-zoomable:hover img { transform: scale(1.06); }
      `}</style>

      {/* ROLE SWITCHER & LANGUAGE HEADER */}
      <div style={{ backgroundColor: 'var(--mr-ink)', color: '#fff', padding: '0.6rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.85rem' }}>
        <div>
          {isStaff || !firebaseConfigured ? (
            <span>{tr('Role:')} <strong>{firebaseConfigured ? firebaseLoading ? tr('CHECKING ACCESS') : firebaseUser ? role === 'OWNER' ? tr('HOST') : role : tr('GUEST') : `LOCAL ${role === 'OWNER' ? 'HOST' : role}`}</strong> ({firebaseConfigured ? firebaseUser?.email || 'signed out' : userEmail})</span>
          ) : googleUser ? (
            <span>{googleUser.email}</span>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select aria-label={tr('Language')} value={lang} onChange={(e) => setLang(e.target.value as UiLanguage)} style={{ padding: '0.25rem', borderRadius: '4px' }}>
            {LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.label}</option>)}
          </select>
          {firebaseConfigured ? (
            googleUser ? (
              <button onClick={handleSignOut} style={{ padding: '0.35rem 0.9rem', cursor: 'pointer', borderRadius: '999px', border: '1px solid #dadce0', backgroundColor: '#fff', color: '#3c4043', fontWeight: 600 }}>{tr('Sign out')}</button>
            ) : (
              <GoogleSignInButton onClick={() => void handleGoogleSignIn()} disabled={firebaseLoading} label={firebaseLoading ? tr('Checking session...') : tr('Sign in with Google')} />
            )
          ) : (
            <select value={userEmail} onChange={(e) => handleEmailSwitch(e.target.value)} style={{ padding: '0.25rem', borderRadius: '4px' }}>
              <option value="customer@gmail.com">{t.roleCustomer}</option>
              <option value={CONFIG.ownerEmails[0]}>{t.roleHost}</option>
              <option value={CONFIG.developerEmails[0]}>{t.roleDeveloper}</option>
            </select>
          )}
        </div>
      </div>

      {(isStaff || !firebaseConfigured) ? (
        <div aria-live="polite" style={{ padding: '0.55rem 1.2rem', backgroundColor: firebaseConfigured ? '#e8f5e9' : '#fff3cd', color: firebaseConfigured ? '#1b5e20' : '#664d03', fontSize: '0.85rem' }}>
          {firebaseConfigured
            ? 'Firestore is configured; catalog and order changes sync live when connected.'
            : 'Local demo only: add Firebase project settings to sync catalog and orders across devices.'}
          {syncError && <span> Sync issue: {syncError}</span>}
        </div>
      ) : syncError ? (
        <div aria-live="polite" style={{ padding: '0.55rem 1.2rem', backgroundColor: '#fdecea', color: '#8b1e2d', fontSize: '0.85rem' }}>
          Something went wrong. Please refresh the page and try again.
        </div>
      ) : null}

      {/* BOUTIQUE BRANDING */}
      <div className="mr-announce">{tr('Where Tradition Meets Royalty')}</div>
      <SiteHeader
        links={[{ label: sitePages.about.title, onClick: () => setPageView('about') }, { label: sitePages.contact.title, onClick: () => setPageView('contact') }]}
        onHome={() => { setCustomerTab('SHOP'); withViewTransition(() => { setCategoryFilter('All'); setWishOnly(false); setColorFilter(''); setSearchText(''); }); }}
        search={searchText}
        onSearch={value => { setCustomerTab('SHOP'); setSearchText(value); }}
        wishlistCount={wishlist.ids.length}
        wishlistActive={wishOnly}
        onWishlist={() => { setCustomerTab('SHOP'); withViewTransition(() => setWishOnly(current => !current)); scrollToCatalog(); }}
        cartCount={cartCount}
        onCart={() => setIsCartOpen(true)}
        shopping={!isStaff}
        tr={tr}
      />
      {!isStaff && customerTab === 'SHOP' && <HeroBanner tr={tr} onShop={scrollToCatalog} />}

      {!isStaff && (
        <AIOfferBannerContainer
          products={products}
          context={browsingContext}
          activeCategory={categoryFilter}
          cartCount={cartCount}
          onAction={handleOfferAction}
          onDismiss={dismissOffer}
        />
      )}

      {!isStaff && <ValueStrip />}

      {/* MAIN CONTENT AREA */}
      <div style={{ maxWidth: '1100px', margin: '2rem auto', padding: '0 1rem' }}>
        {firebaseConfigured && firebaseLoading && <p role="status">Checking Google account and host access...</p>}

        {/* ------------------------------------------------------------------------- */}
        {/* DEVELOPER VIEW */}
        {/* ------------------------------------------------------------------------- */}
        {!firebaseLoading && role === 'DEVELOPER' && (
          <div className="mr-tabs" role="tablist" aria-label="Developer views">
            <button type="button" role="tab" className="mr-tab" aria-selected={devView === 'HOME'} onClick={() => withViewTransition(() => setDevView('HOME'))}>🛠️ Developer Telemetry &amp; Host Access (Home)</button>
            <button type="button" role="tab" className="mr-tab" aria-selected={devView === 'HOST'} onClick={() => withViewTransition(() => setDevView('HOST'))}>🏪 Host Management Panel</button>
            <button type="button" role="tab" className="mr-tab" aria-selected={devView === 'PAGES'} onClick={() => withViewTransition(() => setDevView('PAGES'))}>📝 Site Pages</button>
          </div>
        )}
        {!firebaseLoading && role === 'DEVELOPER' && devView === 'PAGES' && <SitePagesEditor key={JSON.stringify(sitePages)} pages={sitePages} whatsapp={hostWhatsApp} onSave={handleSaveSitePages} />}
        {!firebaseLoading && role === 'DEVELOPER' && devView === 'HOME' && (
          <div style={{ backgroundColor: '#fff', padding: '1.8rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: '2rem' }}>
            <h2 style={{ color: 'var(--mr-primary)', marginTop: 0 }}>🛠️ Developer Telemetry & Host Access</h2>
            <p style={{ fontSize: '0.9rem' }}>App Version: <strong>{CONFIG.version}</strong> | Active Orders in Engine: <strong>{activeOrders.length}</strong></p>
            <p style={{ fontSize: '0.85rem', margin: '0.3rem 0 0.8rem' }}>
              Screenshot reader (AI): <button type="button" onClick={() => void handleAcceptAiLicense()} style={{ cursor: 'pointer' }}>Accept AI model licence (one time)</button>
            </p>
            
            <div style={{ backgroundColor: '#f9f9f9', padding: '1.2rem', borderRadius: '6px', margin: '1.5rem 0' }}>
              <h4 style={{ margin: '0 0 0.8rem' }}>{t.addHostHeader} (Max {CONFIG.maxHostLogins})</h4>
              <form onSubmit={handleAddHost} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem', alignItems: 'center' }}>
                <input aria-label="Host ID" placeholder="Host ID (e.g. H01)" value={newHostId} onChange={e => setNewHostId(e.target.value)} required maxLength={24} style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }} />
                <input aria-label="Host Gmail" type="email" placeholder="Host Gmail" value={newHostEmail} onChange={e => setNewHostEmail(e.target.value)} required style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }} />
                <input aria-label="Host nickname" placeholder="Nickname (shown on actions)" value={newHostNickname} onChange={e => setNewHostNickname(e.target.value)} required maxLength={30} style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }} />
                <button type="submit" style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Add host</button>
              </form>
              <div style={{ marginTop: '1rem', display: 'grid', gap: '0.5rem' }}>
                <strong>Hosts</strong>
                {hostRecords.map(host => (
                  <div key={host.email} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem', alignItems: 'center', padding: '0.5rem 0.7rem', background: '#fff', border: '1px solid #eee', borderRadius: '6px', opacity: host.active ? 1 : 0.6 }}>
                    <label className="mr-switch" style={{ margin: 0 }} title={host.fixed ? 'Configured owner' : host.active ? 'Turn off' : 'Turn on'}>
                      <input type="checkbox" checked={host.active} disabled={host.fixed} onChange={event => void handleHostActiveToggle(host, event.target.checked)} aria-label={`Access for ${host.nickname}`} />
                      <span className="mr-switch-track" aria-hidden="true" />
                    </label>
                    <span style={{ flex: '1 1 200px' }}><strong>{host.nickname}</strong> <code>{host.hostId || 'no ID'}</code><br /><small>{host.email}{host.fixed ? ' (configured owner)' : ''}{host.active ? '' : ' · switched off'}</small></span>
                    {!host.fixed && <button type="button" onClick={() => void handleDeleteHost(host)} aria-label={`Delete ${host.nickname}`} style={{ background: '#fff', color: '#c62828', border: '1px solid #c62828', borderRadius: '4px', padding: '0.35rem 0.7rem', cursor: 'pointer' }}>Delete</button>}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ backgroundColor: '#f9f9f9', padding: '1.2rem', borderRadius: '6px', margin: '1.5rem 0' }}>
              <h4 style={{ margin: '0 0 0.8rem' }}>Audit trail (latest 100 actions)</h4>
              {auditEntries.length === 0 ? <p style={{ margin: 0, color: '#666' }}>No actions recorded yet.</p> : (
                <div style={{ overflowX: 'auto', maxHeight: '320px', overflowY: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem' }}>
                    <thead><tr>{['When', 'Who', 'Action', 'Target', 'What'].map(label => <th key={label} style={{ textAlign: 'left', padding: '0.35rem 0.5rem', borderBottom: '2px solid #ddd', position: 'sticky', top: 0, background: '#f9f9f9' }}>{label}</th>)}</tr></thead>
                    <tbody>
                      {auditEntries.map(entry => (
                        <tr key={entry.id}>
                          <td style={{ padding: '0.3rem 0.5rem', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{new Date(entry.at).toLocaleString('en-IN')}</td>
                          <td style={{ padding: '0.3rem 0.5rem', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{entry.actorNickname} <code>{entry.actorHostId}</code></td>
                          <td style={{ padding: '0.3rem 0.5rem', borderBottom: '1px solid #eee' }}>{entry.action}</td>
                          <td style={{ padding: '0.3rem 0.5rem', borderBottom: '1px solid #eee', fontFamily: 'monospace' }}>{entry.targetId}</td>
                          <td style={{ padding: '0.3rem 0.5rem', borderBottom: '1px solid #eee' }}>{entry.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ backgroundColor: '#f9f9f9', padding: '1.2rem', borderRadius: '6px', margin: '1.5rem 0' }}>
              <h4 style={{ margin: '0 0 0.8rem' }}>Deleted order rows ({deletedOrders.length})</h4>
              {deletedOrders.length === 0 ? <p style={{ margin: 0, color: '#666' }}>Nothing deleted.</p> : deletedOrders.map(order => (
                <div key={order.orderId} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #eee', fontSize: '0.85rem' }}>
                  <span style={{ flex: '1 1 260px' }}><code>{order.orderId}</code> · {order.address?.fullName} · ₹{order.itemTotal}<br /><small>Deleted {order.deletedAt ? new Date(order.deletedAt).toLocaleString('en-IN') : ''} by {order.deletedBy || 'unknown'}{order.deleteReason ? `: ${order.deleteReason}` : ''}</small></span>
                  <button type="button" onClick={() => void handleRestoreOrderRow(order)}>Restore</button>
                  <button type="button" onClick={() => void handleDeleteOrderForever(order)} style={{ color: '#c62828' }}>Delete permanently</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* HOST / OWNER VIEW (also shown to the developer account) */}
        {/* ------------------------------------------------------------------------- */}
        {!firebaseLoading && (role === 'OWNER' || (role === 'DEVELOPER' && devView === 'HOST')) && (
          <div style={{ backgroundColor: '#fff', padding: '1.8rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
            <h2 style={{ color: 'var(--mr-primary)', marginTop: 0 }}>🏪 Host Management Panel</h2>

            <div role="tablist" aria-label="Host sections" style={{ display: 'flex', gap: '0.3rem', overflowX: 'auto', borderBottom: '1px solid #ddd', margin: '0 0 1.2rem' }}>
              {([
                ['ORDERS', `Orders (${hostActiveOrders.length})`],
                ['LEDGER', 'Master ledger'],
                ['UPLOAD', 'Upload item'],
                ['CATALOG', `Manage catalog (${products.length})`],
                ['QR', 'Payment QR'],
                ['ENQUIRIES', `Enquiries${newEnquiryCount ? ` (${newEnquiryCount} new)` : ''}`],
                ['FEEDBACK', `Feedback${newFeedbackCount ? ` (${newFeedbackCount} new)` : ''}`],
                ['INSIGHTS', 'AI insights'],
              ] as const).map(([tab, label]) => (
                <button key={tab} type="button" role="tab" aria-selected={hostTab === tab} onClick={() => setHostTab(tab)} style={{ padding: '0.65rem 0.9rem', border: 0, borderBottom: hostTab === tab ? '3px solid var(--mr-primary)' : '3px solid transparent', background: 'transparent', color: 'var(--mr-primary)', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {label}
                </button>
              ))}
            </div>

            {hostTab === 'UPLOAD' && (<>
              <KuchuManager list={kuchuList} onPublish={handlePublishKuchu} onUpdate={handleUpdateKuchu} onDelete={handleDeleteKuchu} />
            {/* Catalog Upload Form */}
            <div style={{ backgroundColor: '#f7ebe8', padding: '1.2rem', borderRadius: '8px', marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 1rem' }}>Upload New Catalog Item</h3>
              {firebaseConfigured && (!CONFIG.cloudinary.cloudName || !CONFIG.cloudinary.uploadPreset) && <p role="status" style={{ color: '#8a4b08', fontSize: '0.85rem' }}>Configure VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to upload product media. You can still use a hosted image URL.</p>}
              {lastPublished && (
                <div role="status" style={{ marginBottom: '0.8rem', padding: '0.6rem 0.8rem', background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '8px', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
                  <span>Published <code>{lastPublished.itemCode}</code>{lastPublished.color ? ` (${lastPublished.color})` : ''}.</span>
                  <button type="button" onClick={() => { setNewProduct({ name: lastPublished.name, category: lastPublished.category, price: String(lastPublished.price), offerPrice: lastPublished.offerPrice ? String(lastPublished.offerPrice) : '', quantity: '1', description: lastPublished.description, image: '', categoryCode: lastPublished.categoryCode || '', patternCode: lastPublished.patternCode || '', color: '', size: lastPublished.size || '', kuchuCode: lastPublished.kuchuCode || '', itemCode: '', compatibleKuchuIds: lastPublished.compatibleKuchuIds || [] }); setLastPublished(null); }} style={{ cursor: 'pointer', fontWeight: 'bold' }}>Add another colour of this design</button>
                  <button type="button" onClick={() => setLastPublished(null)} style={{ cursor: 'pointer' }}>Dismiss</button>
                </div>
              )}
              <form onSubmit={handlePublishProduct} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem' }}>
                <input type="text" placeholder="Product Name *" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} required style={{ padding: '0.6rem' }} />
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  <select
                    aria-label="Category"
                    value={newProduct.category}
                    onChange={e => {
                      if (e.target.value === NEW_CATEGORY_VALUE) {
                        setAddingCategory(true);
                      } else {
                        setAddingCategory(false);
                        setNewProduct({ ...newProduct, category: e.target.value });
                      }
                    }}
                    style={{ padding: '0.6rem' }}
                  >
                    {categoryOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    <option value={NEW_CATEGORY_VALUE}>➕ Add new category...</option>
                  </select>
                  {addingCategory && (
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input aria-label="New category name" placeholder="New category name" maxLength={40} value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} style={{ padding: '0.5rem', flex: 1, minWidth: 0 }} />
                      <button type="button" onClick={() => void handleAddCategory()} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.5rem 0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>Add</button>
                    </div>
                  )}
                </div>
                <input type="number" placeholder="Regular Price (₹) *" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} required style={{ padding: '0.6rem' }} />
                <input type="number" min="1" step="0.01" aria-label="Offer price (leave blank for no offer)" placeholder="Offer Price (₹) - blank = no offer" value={newProduct.offerPrice} onChange={e => setNewProduct({ ...newProduct, offerPrice: e.target.value })} style={{ padding: '0.6rem' }} />
                <input type="number" min="0" step="1" aria-label="Quantity in stock" placeholder="Quantity in stock *" value={newProduct.quantity} onChange={e => setNewProduct({ ...newProduct, quantity: e.target.value })} required style={{ padding: '0.6rem' }} />
                <div style={{ gridColumn: '1 / -1', display: 'grid', gap: '0.6rem', padding: '0.8rem', background: 'var(--mr-tint)', border: '1px solid #eee', borderRadius: '8px' }}>
                  <strong>Item ID and colour</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
                    <input aria-label="Category code" list="mr-category-codes" placeholder={`Category code (${categoryCodeFor(newProduct.category) || 'SILK'})`} value={newProduct.categoryCode} onChange={e => setNewProduct({ ...newProduct, categoryCode: e.target.value.toUpperCase(), itemCode: '' })} maxLength={6} style={{ padding: '0.55rem' }} />
                    <datalist id="mr-category-codes">{['SILK', 'COTN', 'GEOR', 'CHIF', 'LINN', 'TUSS'].map(code => <option key={code} value={code} />)}</datalist>
                    <input aria-label="Pattern code" placeholder="Pattern code (e.g. ZRI)" value={newProduct.patternCode} onChange={e => setNewProduct({ ...newProduct, patternCode: e.target.value.toUpperCase(), itemCode: '' })} maxLength={6} style={{ padding: '0.55rem' }} />
                    <input aria-label="Colour" list="mr-color-names-upload" placeholder="Colour (e.g. Maroon)" value={newProduct.color} onChange={e => setNewProduct({ ...newProduct, color: e.target.value, itemCode: '' })} maxLength={30} style={{ padding: '0.55rem' }} />
                    <datalist id="mr-color-names-upload">{PALETTE.map(option => <option key={option.code} value={option.name} />)}</datalist>
                    <input aria-label="Size" placeholder="Size (e.g. 6.3m)" value={newProduct.size} onChange={e => setNewProduct({ ...newProduct, size: e.target.value, itemCode: '' })} maxLength={12} style={{ padding: '0.55rem' }} />
                    <input aria-label="Kuchu code (optional)" placeholder="Kuchu code (optional)" value={newProduct.kuchuCode} onChange={e => setNewProduct({ ...newProduct, kuchuCode: e.target.value.toUpperCase(), itemCode: '' })} maxLength={8} style={{ padding: '0.55rem' }} />
                  </div>
                  {colorSuggestions.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
                      <span>Colours seen in your photo:</span>
                      {colorSuggestions.map(option => (
                        <button key={option.code} type="button" onClick={() => setNewProduct({ ...newProduct, color: option.name, itemCode: '' })} style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', padding: '0.25rem 0.6rem', borderRadius: '999px', border: '1px solid #ccc', background: newProduct.color === option.name ? 'var(--mr-tint-strong)' : '#fff', cursor: 'pointer' }}>
                          <span aria-hidden="true" style={{ width: '14px', height: '14px', borderRadius: '50%', background: option.hex, border: '1px solid #999' }} />{option.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem' }}>
                    Item ID (made from the parts above; you can change it)
                    <input aria-label="Item ID" value={newProduct.itemCode} onChange={e => setNewProduct({ ...newProduct, itemCode: e.target.value.toUpperCase() })} placeholder={buildItemCode({ category: newProduct.categoryCode, pattern: newProduct.patternCode, color: colorCodeFor(newProduct.color), kuchu: newProduct.kuchuCode, size: newProduct.size }) || 'SILK-ZRI-MAR-63M'} maxLength={48} style={{ padding: '0.55rem', fontFamily: 'monospace' }} />
                  </label>
                  <small style={{ color: '#666' }}>Items with the same category code and pattern code are shown together as colours of one design.</small>
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'grid', gap: '0.6rem', padding: '0.8rem', background: 'var(--mr-tint)', border: '1px solid #eee', borderRadius: '8px' }}>
                  <strong>Kuchu work (optional)</strong>
                  {kuchuList.length === 0
                    ? <small style={{ color: '#666' }}>Add Kuchu designs in the Upload Kuchu Section above to tag them on this saree.</small>
                    : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {kuchuList.filter(kuchu => kuchu.active).map(kuchu => (
                          <label key={kuchu.id} style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', padding: '0.3rem 0.6rem', border: '1px solid #ddd', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
                            <input type="checkbox" checked={newProduct.compatibleKuchuIds.includes(kuchu.id)} onChange={event => setNewProduct({ ...newProduct, compatibleKuchuIds: event.target.checked ? [...newProduct.compatibleKuchuIds, kuchu.id] : newProduct.compatibleKuchuIds.filter(id => id !== kuchu.id) })} />
                            {kuchu.photos[0] && <img src={kuchu.photos[0].url} alt="" style={{ width: '30px', height: '30px', objectFit: 'cover', borderRadius: '4px' }} />}
                            {kuchu.name} <code>{kuchu.id}</code> +₹{kuchu.price}
                          </label>
                        ))}
                      </div>
                    )}
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
                  <label style={mediaButtonStyle}>
                    📷 Take photo
                    <input type="file" accept="image/*" capture="environment" onChange={handleProductMediaSelection} style={{ display: 'none' }} />
                  </label>
                  <label style={mediaButtonStyle}>
                    🎥 Record video
                    <input type="file" accept="video/*" capture="environment" onChange={handleProductMediaSelection} style={{ display: 'none' }} />
                  </label>
                  <label style={mediaButtonStyle}>
                    🖼️ Choose from gallery
                    <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple onChange={handleProductMediaSelection} style={{ display: 'none' }} />
                  </label>
                  <span style={{ color: '#666', fontSize: '0.8rem' }}>
                    Up to 6 photos and one video (30 seconds max). The camera buttons open the camera on a phone; on a computer they open the file picker.
                  </span>
                </div>
                {mediaPreviews.length > 0 && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '0.7rem' }}>
                    {mediaPreviews.map((preview, index) => (
                      <div key={`${preview.name}-${index}`} style={{ position: 'relative', width: '84px', height: '84px' }}>
                        {preview.isVideo ? (
                          <video src={preview.url} muted playsInline style={{ width: '84px', height: '84px', objectFit: 'cover', borderRadius: '6px' }} />
                        ) : (
                          <img src={preview.url} alt={preview.name} style={{ width: '84px', height: '84px', objectFit: 'cover', borderRadius: '6px' }} />
                        )}
                        <button type="button" aria-label={`Remove ${preview.name}`} onClick={() => removeProductMediaFile(index)} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: '#8b1e2d', color: '#fff', cursor: 'pointer', lineHeight: 1 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea placeholder="Product Description" value={newProduct.description} onChange={e => setNewProduct({ ...newProduct, description: e.target.value })} style={{ padding: '0.6rem', gridColumn: '1 / -1' }} />
                <button type="submit" disabled={isUploadingProduct} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.7rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', gridColumn: '1 / -1' }}>
                  {isUploadingProduct ? 'Uploading media...' : t.publishProduct}
                </button>
              </form>
            </div>

            </>)}
            {hostTab === 'QR' && (<>
            <div style={{ backgroundColor: '#fff', padding: '1.2rem', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 0.6rem' }}>Checkout Payment QR</h3>
              <p style={{ margin: '0 0 0.8rem', color: '#666', fontSize: '0.9rem' }}>Customers will see this QR during checkout.</p>
              <p style={{ margin: '0 0 0.8rem', fontSize: '0.85rem', color: paymentQrUrl ? '#1b5e20' : '#8a4b08' }}>
                {paymentQrUpdatedAt ? `Last updated: ${new Date(paymentQrUpdatedAt).toLocaleString()}` : paymentQrUrl ? 'Last updated: not recorded' : 'No QR uploaded yet.'}
              </p>
              {firebaseConfigured && (!CONFIG.cloudinary.cloudName || !CONFIG.cloudinary.uploadPreset) && <p role="status" style={{ color: '#8a4b08', fontSize: '0.85rem' }}>Configure VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in the deployment environment to upload images.</p>}
              {paymentQrUrl && <img src={paymentQrUrl} alt="Current checkout payment QR" style={{ width: '160px', height: '160px', objectFit: 'contain', display: 'block', marginBottom: '0.8rem' }} />}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem', alignItems: 'center' }}>
                <input type="file" accept="image/*" onChange={handlePaymentQrSelection} />
                <button type="button" disabled={!paymentQrFile || isUploadingQr} onClick={() => void handleCheckoutQrUpload()} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.6rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {isUploadingQr ? 'Uploading...' : 'Save checkout QR'}
                </button>
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', padding: '1.2rem', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 0.6rem' }}>Dynamic payment QR (recommended)</h3>
              <p style={{ margin: '0 0 0.8rem', color: '#666', fontSize: '0.9rem' }}>
                Add your UPI ID and the name on your UPI account. Checkout then makes a QR and a "Pay in your UPI app" button for the exact amount of each order (after offers), so customers do not type or change the amount. The uploaded QR above stays as a backup.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
                <input aria-label="UPI ID" placeholder="UPI ID, for example name@bank" value={upiDraft} onChange={event => setUpiDraft(event.target.value)} style={{ padding: '0.5rem', flex: '1 1 220px' }} />
                <input aria-label="Name on UPI account" placeholder="Name on UPI account" value={payeeDraft} onChange={event => setPayeeDraft(event.target.value)} style={{ padding: '0.5rem', flex: '1 1 180px' }} />
                <button type="button" onClick={() => void handleSaveUpi()} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.6rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Save UPI details</button>
              </div>
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', color: upiId ? '#1b5e20' : '#8a4b08' }}>{upiId ? `Dynamic QR is on for ${upiId}.` : 'Not set: customers see the uploaded QR.'}</p>
            </div>

            <div style={{ backgroundColor: '#fff', padding: '1.2rem', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 0.6rem' }}>Courier charge rules</h3>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', margin: '0.4rem 0' }}>
                <input type="checkbox" checked={shippingConfig.ruleBEnabled} onChange={event => setShippingConfig({ ...shippingConfig, ruleBEnabled: event.target.checked })} />
                <span><strong>Rule B:</strong> no courier charge for deliveries inside Bangalore.</span>
              </label>
              <label style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', margin: '0.4rem 0 0.4rem 1.6rem', fontSize: '0.9rem' }}>
                Pincode prefixes
                <input value={prefixDraft} onChange={event => setPrefixDraft(event.target.value)} placeholder="560" style={{ padding: '0.4rem', width: '220px' }} />
              </label>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', margin: '0.4rem 0' }}>
                <input type="checkbox" checked={shippingConfig.ruleAEnabled} onChange={event => setShippingConfig({ ...shippingConfig, ruleAEnabled: event.target.checked })} />
                <span><strong>Rule A:</strong> no courier charge for a single saree (quantity 1), unless the same customer already ordered to the same pincode in the last 24 hours.</span>
              </label>
              <p style={{ margin: '0.4rem 0', fontSize: '0.85rem', color: '#666' }}><strong>Rule C</strong> applies to everything else: you add the courier details and charge, the customer pays it, and you verify it before dispatch.</p>
              <button type="button" onClick={() => void handleSaveShipping()} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.6rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Save courier rules</button>
            </div>

            </>)}
            {hostTab === 'ENQUIRIES' && (<>
            {/* Customer enquiries */}
            <div style={{ backgroundColor: '#fff', padding: '1.2rem', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 0.3rem' }}>Customer enquiries ({enquiries.filter(item => item.status === 'NEW').length} new)</h3>
              <p style={{ margin: '0 0 0.8rem', color: '#666', fontSize: '0.85rem' }}>
                Customers write to you from the chat button on the website. Reply on WhatsApp using the customer's number. Your own number stays hidden unless you add one below as an optional "message us directly" choice.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', margin: '0 0 1rem' }}>
                <input type="tel" inputMode="numeric" aria-label="Optional direct WhatsApp number" placeholder="Optional direct WhatsApp number" value={whatsAppDraft} onChange={event => setWhatsAppDraft(event.target.value)} style={{ padding: '0.5rem', flex: '1 1 220px' }} />
                <button type="button" onClick={() => void handleSaveWhatsApp(whatsAppDraft)} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Save number</button>
                {hostWhatsApp && <button type="button" onClick={() => void handleSaveWhatsApp('')} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Remove number</button>}
                <small style={{ color: '#777', flexBasis: '100%' }}>{hostWhatsApp ? 'Customers now see a "message us directly" link in the chat, which shows this number to those who use it.' : 'No number saved. Customers can only send enquiries through the form.'}</small>
              </div>
              {enquiries.length === 0 ? (
                <p style={{ margin: 0, color: '#666', fontStyle: 'italic' }}>No enquiries yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  {[...enquiries].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map(enquiry => (
                    <div key={enquiry.id} style={{ border: '1px solid #eee', borderLeft: `4px solid ${enquiry.status === 'NEW' ? '#25d366' : '#bbb'}`, borderRadius: '6px', padding: '0.7rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                        <strong>{enquiry.name}</strong>
                        <span>· {enquiry.phone}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', padding: '0.15rem 0.55rem', borderRadius: '999px', backgroundColor: enquiry.status === 'NEW' ? '#e8f5e9' : '#eee', color: enquiry.status === 'NEW' ? '#1b5e20' : '#555' }}>{enquiry.status === 'NEW' ? 'New' : 'Replied'}</span>
                        {enquiry.kind === 'PAYMENT_ISSUE' && <span style={{ fontSize: '0.75rem', fontWeight: 'bold', padding: '0.15rem 0.55rem', borderRadius: '999px', backgroundColor: '#fdecea', color: '#8b1e2d', border: '1px solid #f5b5bd' }}>Payment problem{enquiry.orderId ? ` · ${enquiry.orderId}` : ''}</span>}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#777', margin: '0.2rem 0' }}>{new Date(enquiry.createdAt).toLocaleString()}</div>
                      {enquiry.productName && <div style={{ fontSize: '0.85rem', color: '#555' }}>About: {enquiry.productName}</div>}
                      <p style={{ margin: '0.4rem 0', whiteSpace: 'pre-wrap' }}>{enquiry.message}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                        <a href={whatsAppLink(enquiry.phone, `Hello ${enquiry.name}, thank you for contacting Mala Royale${enquiry.productName ? ` about ${enquiry.productName}` : ''}. `)} target="_blank" rel="noreferrer" style={{ backgroundColor: '#25d366', color: '#fff', textDecoration: 'none', fontWeight: 'bold', padding: '0.4rem 0.8rem', borderRadius: '4px' }}>Reply on WhatsApp</a>
                        <button type="button" onClick={() => void handleEnquiryStatus(enquiry, enquiry.status === 'NEW' ? 'REPLIED' : 'NEW')} style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}>{enquiry.status === 'NEW' ? 'Mark replied' : 'Mark as new'}</button>
                        <button type="button" onClick={() => void handleDeleteEnquiry(enquiry)} style={{ padding: '0.4rem 0.8rem', backgroundColor: '#fff', color: '#8b1e2d', border: '1px solid #8b1e2d', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            </>)}
            {hostTab === 'CATALOG' && (<>
            {/* Manage catalog */}
            <div style={{ backgroundColor: '#fff', padding: '1.2rem', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 0.3rem' }}>Manage catalog ({products.length})</h3>
              <p style={{ margin: '0 0 0.8rem', color: '#666', fontSize: '0.85rem' }}>Edit prices and offers, mark an item out of stock or coming soon, or remove it.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', margin: '0 0 0.9rem' }}>
                <strong style={{ fontSize: '0.85rem' }}>Categories:</strong>
                {categoryOptions.map(option => {
                  const inUse = products.some(product => product.category === option);
                  const removable = customCategories.includes(option) && !inUse;
                  return (
                    <span key={option} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', backgroundColor: 'var(--mr-tint-strong)', color: 'var(--mr-primary)', borderRadius: '999px', padding: '0.15rem 0.7rem', fontSize: '0.8rem' }}>
                      {option}
                      {removable && <button type="button" aria-label={`Remove category ${option}`} onClick={() => void handleRemoveCategory(option)} style={{ background: 'none', border: 'none', color: '#8b1e2d', cursor: 'pointer', padding: 0 }}>✕</button>}
                    </span>
                  );
                })}
              </div>
              {products.length === 0 ? (
                <p style={{ margin: 0, color: '#666', fontStyle: 'italic' }}>No items published yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  {products.map(product => (
                    <ProductManagerRow
                      key={`${product.id}-${product.name}-${product.price}-${product.offerPrice ?? ''}-${product.status ?? ''}`}
                      product={product}
                      categories={categoryOptions}
                      allProducts={products}
                      kuchuList={kuchuList}
                      onSave={handleUpdateProduct}
                      onDelete={handleDeleteProduct}
                    />
                  ))}
                </div>
              )}
            </div>

            </>)}
            {hostTab === 'ORDERS' && (<>
            {/* Manage Incoming Orders */}
            <h3>Incoming Orders & Courier Billing</h3>
            <div role="tablist" aria-label="Host order queues" style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid #ddd', margin: '0.8rem 0 1rem' }}>
              {([
                ['ACTIVE', `Active (${hostActiveOrders.length})`],
                ['DISPATCHED', `Dispatched (${hostDispatchedOrders.length})`],
                ['HISTORY', `History (${hostHistoryOrders.length})`],
              ] as const).map(([tab, label]) => (
                <button key={tab} type="button" role="tab" aria-selected={hostOrderTab === tab} onClick={() => setHostOrderTab(tab)} style={{ padding: '0.65rem 0.8rem', border: 0, borderBottom: hostOrderTab === tab ? '3px solid var(--mr-primary)' : '3px solid transparent', background: 'transparent', color: 'var(--mr-primary)', fontWeight: 'bold', cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
            <p style={{ color: '#666', fontSize: '0.85rem' }}>Active orders are listed oldest first. Times are shown in your local timezone.</p>
            {hostVisibleOrders.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic' }}>
                {hostOrderTab === 'ACTIVE' && firebaseConfigured ? 'Incoming orders will appear here as customers submit them.' : 'No orders in this section.'}
              </p>
            ) : hostVisibleOrders.map(ord => {
              const canDispatch = Boolean(ord.deliveryConfirmed && ord.itemPayment?.verified) && (!ord.courierBill || Boolean(ord.courierPayment?.verified));
              const open = Boolean(expandedOrders[ord.orderId]);
              return (
                <article key={ord.orderId} className={`mr-order-row${open ? ' is-open' : ''}`} style={{ border: '1px solid #ddd', padding: '0.8rem 1rem', borderRadius: '8px', marginBottom: '0.7rem', background: '#fff' }}>
                  <div className="mr-quick" role="tooltip">
                    <strong>{ord.address.fullName}</strong> · {ord.address.phone}<br />
                    {ord.items.filter(item => !isLineRejected(item)).map(item => `${item.name}${item.color ? ` (${item.color})` : ''} × ${item.quantity}`).join(', ')}<br />
                    {getOrderStatus(ord)}{ord.itemPayment?.utr ? ` · UTR ${ord.itemPayment.utr}` : ''}<br />
                    {[ord.address.city, ord.address.district, ord.address.state, ord.address.pincode, ord.address.country].filter(Boolean).join(', ')}
                  </div>
                  <button type="button" className="mr-order-head" aria-expanded={open} onClick={() => toggleOrder(ord.orderId)}>
                    <span style={{ minWidth: 0 }}><span className="mr-order-label">Customer</span><div className="mr-order-value">{ord.address.fullName}</div></span>
                    <span className="mr-col-id" style={{ minWidth: 0 }}><span className="mr-order-label">Order ID</span><div className="mr-order-value" style={{ fontFamily: 'monospace' }}>{ord.orderId}</div></span>
                    <span className="mr-col-date" style={{ minWidth: 0 }}><span className="mr-order-label">Date</span><div className="mr-order-value">{new Date(ord.createdAt).toLocaleDateString()}</div></span>
                    <span><span className="mr-order-label">Amount</span><div className="mr-order-value" style={{ color: 'var(--mr-primary)' }}>₹{ord.itemTotal}</div></span>
                    <span className="mr-chevron" aria-hidden="true">›</span>
                  </button>
                  {open && (
                  <div className="mr-expand">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', marginTop: '0.6rem' }}>
                    <span className="mr-status-chip" style={getOrderStatusStyle(ord)}>{getOrderStatus(ord)}</span>
                    {ord.rejectionReason && <span style={{ fontSize: '0.85rem', color: '#8b1e2d' }}>Rejected: {ord.rejectionReason}</span>}
                    {ord.stage === 'NOT_ACCEPTED' && (
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: ord.refundDetails ? '#1b5e20' : '#664d03' }}>
                        {ord.refundDetails ? `Refund ₹${ord.itemTotal} to ${describeRefund(ord)}` : 'Waiting for the customer to send refund details'}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.85rem', margin: '0.45rem 0', color: '#555' }}>
                    Received {new Date(ord.createdAt).toLocaleString()} · Updated {new Date(ord.updatedAt).toLocaleString()}
                  </p>
                  <p style={{ fontSize: '0.9rem', margin: '0.4rem 0' }}>
                    Customer: {ord.address.fullName} ({ord.address.phone}){' '}
                    <a href={whatsAppLink(ord.address.phone, `Hello ${ord.address.fullName}, thank you for your order ${ord.orderId} at Mala Royale. We have received it and will update you shortly.`)} target="_blank" rel="noreferrer" style={{ marginLeft: '0.4rem', color: '#128c7e', fontWeight: 'bold' }}>WhatsApp customer</a>
                  </p>
                  <div style={{ margin: '0.6rem 0', padding: '0.75rem', background: 'var(--mr-tint)', borderRadius: '5px' }}>
                    <strong>Delivery address</strong>
                    <p style={{ margin: '0.35rem 0' }}>
                      {[ord.address.houseNameOrNumber, ord.address.street1, ord.address.street2, ord.address.landmark1, ord.address.landmark2, ord.address.city, ord.address.taluk, ord.address.district, ord.address.state, ord.address.pincode, ord.address.country].filter(Boolean).join(', ') || ord.address.street}
                    </p>
                    {ord.address.pincodeCheck && <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>{ord.address.pincodeCheck.provider}: {ord.address.pincodeCheck.message}</p>}
                    {ord.deliveryConfirmed ? (
                      <p role="status" style={{ color: '#1b5e20', margin: '0.35rem 0 0' }}>
                        Deliverable confirmed by {ord.deliveryConfirmedBy} · {ord.deliveryConfirmedAt ? new Date(ord.deliveryConfirmedAt).toLocaleString() : ''}
                      </p>
                    ) : (
                      <button type="button" disabled={!ord.address.pincodeCheck || ['NOT_FOUND', 'NOT_SERVICEABLE'].includes(ord.address.pincodeCheck.status)} onClick={() => void handleConfirmDelivery(ord)} style={{ marginTop: '0.35rem', padding: '0.5rem 0.75rem' }}>
                        Confirm address is deliverable
                      </button>
                    )}
                  </div>
                  <OrderLines items={ord.items} onRejectItem={hostOrderTab === 'ACTIVE' && activeLines(ord).length > 1 ? index => void handleRejectItem(ord, index) : undefined} />
                  <p style={{ margin: '0.4rem 0', fontWeight: 'bold' }}>
                    Items total: ₹{acceptedTotal(ord)}
                    {(ord.rejectedTotal || 0) > 0 && <span style={{ color: '#8b1e2d', fontWeight: 'normal' }}> (₹{ord.rejectedTotal} rejected; originally ₹{ord.itemTotal}{ord.refundDue ? `, refund ₹${ord.refundDue}${ord.refundDetails ? ` to ${describeRefund(ord)}` : ' - waiting for the customer to send refund details'}` : ''})</span>}
                  </p>
                  <Suspense fallback={<LazyFallback />}><ParcelSheet key={`${ord.orderId}-${ord.parcelDetails?.savedAt || 'new'}`} order={ord} onSave={handleSaveParcel} /></Suspense>
                  {ord.itemPayment && (
                    <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                      Item payment: {ord.itemPayment.verified ? 'Confirmed' : 'Awaiting confirmation'}{ord.itemPayment.utr ? <> · UTR <code>{ord.itemPayment.utr}</code></> : null}<ProofCheckBadges check={ord.itemPayment.proofCheck} expectedAmount={ord.itemTotal} />
                      {!ord.itemPayment.verified && <button type="button" disabled={!ord.deliveryConfirmed} onClick={() => void handleVerifyPayment(ord.orderId, 'ITEM')} style={{ marginLeft: '0.5rem' }}>{t.verifyPayment}</button>}
                      <div style={{ marginTop: '0.4rem' }}><PaymentProofView url={ord.itemPayment.screenshotUrl} /></div>
                    </div>
                  )}
                  {ord.courierBill && (
                    <div style={{ marginTop: '0.6rem', padding: '0.7rem', background: '#f5f8fa', borderRadius: '5px' }}>
                      <strong>Courier charge: ₹{ord.courierBill.amount}</strong>
                      <span> · {ord.courierBill.courierName} · Tracking {ord.courierBill.trackingId}</span>
                      {ord.courierPayment && (
                        <p style={{ margin: '0.4rem 0' }}>
                          Customer UTR: <code>{ord.courierPayment.utr}</code> · {ord.courierPayment.verified ? 'Confirmed' : 'Awaiting host confirmation'}
                          {!ord.courierPayment.verified && <button type="button" onClick={() => void handleVerifyPayment(ord.orderId, 'COURIER')} style={{ marginLeft: '0.5rem' }}>Confirm courier payment</button>}
                          <span style={{ display: 'block', marginTop: '0.4rem' }}><PaymentProofView url={ord.courierPayment.screenshotUrl} caption="Courier payment screenshot" /></span>
                        </p>
                      )}
                    </div>
                  )}
                  {ord.courierRule && (() => {
                    const recheck = evaluateCourierRules({
                      items: ord.items.map(item => ({ quantity: item.quantity })),
                      pincode: ord.address.pincode || '',
                      userId: ord.userId,
                      recentOrders: liveOrders.filter(other => other.orderId !== ord.orderId && other.createdAt < ord.createdAt),
                      config: shippingConfig,
                      now: Date.parse(ord.createdAt),
                    });
                    const mismatch = Boolean(ord.courierWaived) && !recheck.waived;
                    return (
                      <p style={{ margin: '0.5rem 0', fontSize: '0.85rem', color: mismatch ? '#8b1e2d' : '#1b5e20', fontWeight: 'bold' }}>
                        Courier rule {ord.courierRule}: {ord.courierWaived ? 'charge waived' : 'standard charge'}. {ord.courierRuleReason}
                        {mismatch && ` Check failed: ${recheck.reason} Add a courier charge below if it applies.`}
                      </p>
                    );
                  })()}
                  {hostOrderTab === 'ACTIVE' && (!ord.courierWaived || ord.courierBill || forceCourier[ord.orderId]) && <CourierBillForm key={`${ord.orderId}-${ord.courierBill?.billId || 'new'}`} order={ord} onSave={handleCourierReceipt} />}
                  {hostOrderTab === 'ACTIVE' && ord.courierWaived && !ord.courierBill && !forceCourier[ord.orderId] && (
                    <button type="button" onClick={() => setForceCourier(current => ({ ...current, [ord.orderId]: true }))} style={{ margin: '0.4rem 0', cursor: 'pointer' }}>Add a courier charge anyway</button>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.8rem' }}>
                    {hostOrderTab === 'ACTIVE' && <button type="button" disabled={!canDispatch} onClick={() => void handleDispatch(ord.orderId)} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.45rem 0.8rem', borderRadius: '4px', cursor: canDispatch ? 'pointer' : 'not-allowed' }}>{t.markDispatched}</button>}
                    {hostOrderTab === 'DISPATCHED' && <button type="button" onClick={() => void handleDelivered(ord.orderId)} style={{ backgroundColor: '#2e7d32', color: '#fff', border: 'none', padding: '0.45rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>Mark delivered</button>}
                    {hostOrderTab === 'HISTORY' && <button type="button" onClick={() => void handleDeleteOrderRow(ord)} style={{ backgroundColor: '#fff', color: '#c62828', border: '1px solid #c62828', padding: '0.45rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>Delete row</button>}
                  </div>
                  <Suspense fallback={<LazyFallback />}><HostOrderActions key={`${ord.orderId}-${ord.hostMessageAt || 'new'}`} order={ord} canReject={hostOrderTab === 'ACTIVE'} onReject={handleRejectOrder} onHold={handleHoldOrder} onRelease={handleReleaseOrder} onSaveMessage={handleSaveOrderMessage} /></Suspense>
                  </div>
                  )}
                </article>
              );
            })}
            </>)}

            {hostTab === 'LEDGER' && (
              <Suspense fallback={<LazyFallback />}><MasterLedger orders={liveOrders} products={products} onSaveDelivery={handleUpdateDelivery} onDeleteRow={handleDeleteOrderRow} /></Suspense>
            )}

            {hostTab === 'FEEDBACK' && (
              <Suspense fallback={<LazyFallback />}><FeedbackPanel feedback={feedbackItems} onStatus={handleFeedbackStatus} onDelete={handleDeleteFeedback} /></Suspense>
            )}

            {hostTab === 'INSIGHTS' && (
              <Suspense fallback={<LazyFallback />}><HostAnalytics orders={activeOrders} products={products} enquiries={enquiries} weights={aiWeights} onFeedback={handleInsightFeedback} isDeveloper={role === 'DEVELOPER'} onReset={handleResetInsights} /></Suspense>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* CUSTOMER VIEW */}
        {/* ------------------------------------------------------------------------- */}
        {!firebaseLoading && role === 'CUSTOMER' && (
          <div>
            <nav aria-label={tr('Customer sections')} style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #ddd', marginBottom: '1.4rem' }}>
              <button
                type="button"
                role="tab"
                aria-selected={customerTab === 'SHOP'}
                onClick={() => setCustomerTab('SHOP')}
                style={{ padding: '0.7rem 1rem', border: 0, borderBottom: customerTab === 'SHOP' ? '3px solid var(--mr-primary)' : '3px solid transparent', background: 'transparent', color: 'var(--mr-primary)', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {tr('Shop')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={customerTab === 'ORDERS'}
                onClick={() => setCustomerTab('ORDERS')}
                style={{ padding: '0.7rem 1rem', border: 0, borderBottom: customerTab === 'ORDERS' ? '3px solid var(--mr-primary)' : '3px solid transparent', background: 'transparent', color: 'var(--mr-primary)', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {tr('Recent orders')}{activeOrders.length > 0 ? ` (${activeOrders.length})` : ''}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={customerTab === 'ADDRESSES'}
                onClick={() => setCustomerTab('ADDRESSES')}
                style={{ padding: '0.7rem 1rem', border: 0, borderBottom: customerTab === 'ADDRESSES' ? '3px solid var(--mr-primary)' : '3px solid transparent', background: 'transparent', color: 'var(--mr-primary)', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {tr('Addresses')}{savedAddresses.length > 0 ? ` (${savedAddresses.length})` : ''}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={customerTab === 'ABOUT'}
                onClick={() => setCustomerTab('ABOUT')}
                style={{ padding: '0.7rem 1rem', border: 0, borderBottom: customerTab === 'ABOUT' ? '3px solid var(--mr-primary)' : '3px solid transparent', background: 'transparent', color: 'var(--mr-primary)', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {tr('About')}
              </button>
            </nav>

            <div key={customerTab} className="mr-tab-in">
            {customerTab === 'ADDRESSES' && (
              <section aria-label={tr('Saved delivery addresses')}>
                <h2 style={{ color: 'var(--mr-primary)', marginTop: 0 }}>{tr('Delivery addresses')}</h2>
                {firebaseConfigured && !googleUser && (
                  <div style={{ marginBottom: '1rem' }}>
                    <p role="status" style={{ marginTop: 0 }}>{tr('Sign in with Google to save addresses to your account.')}</p>
                    <GoogleSignInButton onClick={() => void handleGoogleSignIn()} disabled={firebaseLoading} label={tr('Sign in with Google')} />
                  </div>
                )}
                <div style={{ display: 'grid', gap: '0.7rem', marginBottom: '1.2rem' }}>
                  {savedAddresses.map(saved => (
                    <article key={saved.id} style={{ backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '6px', padding: '0.9rem' }}>
                      <strong>{saved.fullName} · {saved.phone}</strong>
                      <p style={{ margin: '0.35rem 0', color: '#555' }}>
                        {[saved.houseNameOrNumber, saved.street1, saved.street2, saved.landmark1, saved.landmark2, saved.city, saved.taluk, saved.district, saved.state, saved.pincode, saved.country].filter(Boolean).join(', ')}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <button type="button" onClick={() => { selectDeliveryAddress(saved.id); setCustomerTab('SHOP'); setIsCheckoutOpen(true); setCheckoutStep(1); }} style={{ padding: '0.45rem 0.7rem' }}>{tr('Use at checkout')}</button>
                        <button type="button" onClick={() => { setAddress({ ...saved }); setEditingAddressId(saved.id); }} style={{ padding: '0.45rem 0.7rem' }}>{tr('Edit')}</button>
                        <button type="button" onClick={() => void handleDeleteDeliveryAddress(saved.id)} style={{ padding: '0.45rem 0.7rem' }}>{tr('Delete')}</button>
                      </div>
                    </article>
                  ))}
                </div>
                <form onSubmit={handleSaveDeliveryAddress} style={{ backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', display: 'grid', gap: '0.8rem' }}>
                  <h3 style={{ margin: 0 }}>{editingAddressId ? tr('Edit address') : tr('Add a delivery address')}</h3>
                  <DeliveryAddressFields address={address} setAddress={setAddress} isCheckingPincode={isCheckingPincode} onCheckPincode={() => void handleCheckPincode()} />
                  <button type="submit" style={{ justifySelf: 'start', backgroundColor: 'var(--mr-primary)', color: '#fff', border: 0, borderRadius: '4px', padding: '0.6rem 0.9rem', cursor: 'pointer' }}>
                    {editingAddressId ? tr('Save address changes') : tr('Save address')}
                  </button>
                  {editingAddressId && <button type="button" onClick={() => { setEditingAddressId(null); setAddress({ fullName: '', phone: '', houseNameOrNumber: '', street1: '', street2: '', street: '', landmark1: '', landmark2: '', taluk: '', district: '', state: '', country: 'India', pincode: '', consentTimestamp: '' }); }} style={{ justifySelf: 'start' }}>{tr('Cancel editing')}</button>}
                </form>
              </section>
            )}

            {customerTab === 'SHOP' && (
              <>
            {categoryTiles.length >= 2 && <CategoryTiles tiles={categoryTiles} active={categoryFilter} onSelect={name => { withViewTransition(() => setCategoryFilter(categoryFilter === name ? 'All' : name)); scrollToCatalog(); }} tr={tr} />}
            <ColorRow colors={colorTiles} active={colorFilter} onSelect={name => { withViewTransition(() => setColorFilter(name)); if (name) scrollToCatalog(); }} tr={tr} />
            <StoryShowcase products={products} onSelect={product => focusProduct(product.id)} />

            {/* Sticky filter bar */}
            {products.length > 0 && <div className="mr-filterbar" role="region" aria-label={tr('Filters')}>
              {categoryTiles.length >= 2 && (
                <select value={categoryFilter} onChange={event => withViewTransition(() => setCategoryFilter(event.target.value))} aria-label={tr('Category')} style={{ padding: '0.4rem 0.8rem', borderRadius: '999px', border: '1px solid var(--mr-line)', background: '#fff' }}>
                  <option value="All">{tr('All categories')}</option>
                  {categoryTiles.map(tile => <option key={tile.name} value={tile.name}>{tr(tile.name)}</option>)}
                </select>
              )}
              <button type="button" className="mr-chip" aria-pressed={onlyInStock} onClick={() => withViewTransition(() => setOnlyInStock(current => !current))}>{tr('In stock only')}</button>
              <button type="button" className="mr-chip" aria-pressed={onlyOffers} onClick={() => withViewTransition(() => setOnlyOffers(current => !current))}>{tr('On offer')}</button>
              <button type="button" className="mr-chip" aria-pressed={wishOnly} onClick={() => withViewTransition(() => setWishOnly(current => !current))}>♥ {tr('Saved')} ({wishlist.ids.length})</button>
              {colorFilter && <button type="button" className="mr-chip" aria-pressed="true" onClick={() => withViewTransition(() => setColorFilter(''))}>{tr('Colour')}: {colorFilter} ×</button>}
              {searchText && <button type="button" className="mr-chip" aria-pressed="true" onClick={() => setSearchText('')}>“{searchText}” ×</button>}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', marginLeft: 'auto' }}>
                {tr('Sort by')}
                <select value={sortBy} onChange={event => withViewTransition(() => setSortBy(event.target.value as SortKey))} style={{ padding: '0.4rem', borderRadius: '8px', border: '1px solid var(--mr-line)' }}>
                  <option value="featured">{tr('Featured')}</option>
                  <option value="newest">{tr('Newest first')}</option>
                  <option value="price-asc">{tr('Price: low to high')}</option>
                  <option value="price-desc">{tr('Price: high to low')}</option>
                  <option value="discount">{tr('Biggest discount')}</option>
                  <option value="in-stock">{tr('In stock first')}</option>
                </select>
              </label>
              <span style={{ color: '#777', fontSize: '0.85rem' }}>{tr(filteredProducts.length === 1 ? '{count} item' : '{count} items', { count: filteredProducts.length })}</span>
              {(categoryFilter !== 'All' || onlyInStock || onlyOffers || wishOnly || colorFilter || searchText || sortBy !== 'featured') && (
                <button type="button" className="mr-chip" onClick={() => withViewTransition(() => { setCategoryFilter('All'); setOnlyInStock(false); setOnlyOffers(false); setWishOnly(false); setColorFilter(''); setSearchText(''); setSortBy('featured'); })}>{tr('Clear all')}</button>
              )}
              {cartCount > 0 && <button type="button" className="mr-btn" onClick={() => setIsCartOpen(true)} style={{ padding: '0.45rem 1.1rem', fontSize: '0.85rem' }}>{tr(cartCount === 1 ? 'View cart · {count} item · ₹{total}' : 'View cart · {count} items · ₹{total}', { count: cartCount, total: cartTotal })}</button>}
            </div>}
            {filteredProducts.length === 0 && products.length === 0 && productsReady && (
              <div role="status" className="mr-fade-up" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--mr-primary)' }}>
                <img src="./brand/icon-sarees.png" alt="" width="64" style={{ opacity: 0.9 }} />
                <h2 style={{ margin: '0.6rem 0 0.2rem' }}>{tr('Our new collection is being prepared')}</h2>
                <p style={{ margin: 0, color: '#555' }}>{tr('Please check back soon, or message us on WhatsApp.')}</p>
              </div>
            )}
            {filteredProducts.length === 0 && products.length > 0 && <p role="status" style={{ color: '#666' }}>{tr('No items match these filters.')}</p>}

            {!productsReady && products.length === 0 && <ProductSkeletons />}
            {/* Catalog Grid */}
            <div id="mr-catalog" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.8rem', scrollMarginTop: '100px' }}>
              {groupedProducts.map(({ key: groupKey, variants, product }) => (
                <div key={groupKey} className="mr-card" id={`product-${product.id}`} style={{ backgroundColor: '#fff', borderRadius: '14px', overflow: 'hidden', boxShadow: highlightedProductId === product.id ? '0 0 0 3px var(--mr-gold), 0 12px 30px rgba(16,29,56,0.35)' : '0 4px 12px rgba(0,0,0,0.08)', transition: 'box-shadow 0.4s ease', display: 'flex', flexDirection: 'column' }}>
                  <ProductGallery
                    key={product.id}
                    product={product}
                    badges={cardBadges(product)}
                    onView={() => trackProductView(product.id, product.category)}
                    overlay={(
                      <>
                        <button type="button" className="mr-heart" aria-pressed={wishlist.has(product.id)} aria-label={tr('Save for later')} onClick={event => { event.stopPropagation(); wishlist.toggle(product.id); }}><HeartIcon filled={wishlist.has(product.id)} /></button>
                        <button type="button" className="mr-quick" onClick={event => { event.stopPropagation(); setViewProductId(product.id); trackProductView(product.id, product.category); }}>{tr('Quick view')}</button>
                      </>
                    )}
                  />
                  <div style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--mr-primary)', fontWeight: 'bold', textTransform: 'uppercase' }}>{tr(product.category)}</span>
                      <h3 style={{ margin: '0.3rem 0', fontSize: '1.1rem' }}>{product.name}</h3>
                      {variants.length > 1 && (
                        <div role="group" aria-label={tr('Colours')} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.3rem 0' }}>
                          {variants.map(variant => {
                            const swatch = PALETTE.find(option => option.code === variant.colorCode || option.name === variant.color);
                            const selected = variant.id === product.id;
                            return (
                              <button key={variant.id} type="button" aria-pressed={selected} title={`${variant.color || variant.name}${isPurchasable(variant) ? '' : ' (not available)'}`} onClick={() => setVariantChoice(current => ({ ...current, [groupKey]: variant.id }))} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: '999px', border: selected ? '2px solid var(--mr-primary)' : '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: '0.78rem', opacity: isPurchasable(variant) ? 1 : 0.55 }}>
                                <span aria-hidden="true" style={{ width: '14px', height: '14px', borderRadius: '50%', background: swatch?.hex || '#ddd', border: '1px solid #999' }} />{variant.color || variant.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {(product.color || product.itemCode) && variants.length === 1 && (
                        <p style={{ margin: '0 0 0.2rem', fontSize: '0.78rem', color: 'var(--mr-primary)' }}>{product.color ? `${tr('Colour')}: ${product.color}` : ''}{product.size ? ` · ${product.size}` : ''}</p>
                      )}
                      <p style={{ fontSize: '0.85rem', color: '#666', lineHeight: '1.3' }}>{product.description}</p>
                      <KuchuPicker product={product} kuchuList={kuchuList} selectedId={kuchuChoice[choiceKey(product)] || ''} onKuchu={id => setKuchuChoice(current => ({ ...current, [choiceKey(product)]: id }))} tr={tr} />
                      {typeof product.quantity === 'number' && product.quantity > 0 && product.quantity <= 3 && effectiveStatus(product) === 'AVAILABLE' && (
                        <p style={{ margin: '0.2rem 0', color: '#b45309', fontSize: '0.8rem', fontWeight: 'bold' }}>{tr('Only {count} left', { count: product.quantity })}</p>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginTop: '0.3rem' }}>
                        <button type="button" onClick={() => openEnquiry(product)} style={linkButtonStyle}>{tr('💬 Ask about this')}</button>
                        <button type="button" onClick={() => shareProduct(product)} style={linkButtonStyle}>{tr('↗ Share')}</button>
                      </div>
                    </div>
                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div>
                        {product.offerPrice ? (
                          <>
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--mr-primary)' }}>₹{lineUnitPrice(product, selectedKuchuFor(product))}</span>
                            <span style={{ fontSize: '0.85rem', color: '#999', textDecoration: 'line-through', marginLeft: '0.4rem' }}>₹{lineRegularPrice(product, selectedKuchuFor(product))}</span>
                          </>
                        ) : (
                          <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--mr-primary)' }}>₹{lineUnitPrice(product, selectedKuchuFor(product))}</span>
                        )}
                      </div>
                      {isPurchasable(product) ? (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            onClick={() => { const selection = selectionFor(product); addToCart(product, selection); trackAddToCart(product.id, product.category); }}
                            style={{ backgroundColor: '#fff', color: 'var(--mr-primary)', border: '1px solid var(--mr-primary)', padding: '0.45rem 0.65rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            {tr('+ Add')}
                          </button>
                          <button
                            onClick={() => { const selection = selectionFor(product); buyNow(product, selection); }}
                            style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.45rem 0.65rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            {tr('Buy now')}
                          </button>
                        </div>
                      ) : (
                        <span style={{ ...STATUS_COLORS[effectiveStatus(product)], fontSize: '0.85rem', fontWeight: 'bold', padding: '0.4rem 0.8rem', borderRadius: '999px' }}>
                          {tr(STATUS_LABELS[effectiveStatus(product)])}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <HowItWorks />

            {/* Cart Drawer */}
            {isCartOpen && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
                <div role="dialog" aria-label={tr('Shopping cart')} style={{ backgroundColor: '#fff', maxWidth: '550px', width: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '12px', padding: '1.8rem', position: 'relative' }}>
                  <button type="button" aria-label={tr('Close cart')} onClick={() => setIsCartOpen(false)} style={{ position: 'absolute', top: '15px', right: '15px', border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                  <h2 style={{ color: 'var(--mr-primary)', marginTop: 0 }}>{tr('Your cart')}</h2>

                  {cart.length === 0 ? (
                    <div>
                      <p>{tr('Your cart is empty.')}</p>
                      <button type="button" onClick={() => setIsCartOpen(false)} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.7rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>{tr('Continue shopping')}</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gap: '0.9rem' }}>
                        {cart.map(line => (
                          <div key={lineKey(line)} style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '0.9rem' }}>
                            <img src={line.product.image} alt="" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px', flex: '0 0 64px' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <strong>{line.product.name}</strong>{line.product.color && <span style={{ marginLeft: '0.4rem', fontSize: '0.78rem', color: 'var(--mr-primary)' }}>({line.product.color})</span>}{line.kuchu && <div style={{ fontSize: '0.78rem', color: '#555' }}>Kuchu: {line.kuchu.name} <code>{line.kuchu.id}</code> (+₹{line.kuchu.price})</div>}
                              <div style={{ fontSize: '0.85rem', color: '#666' }}>{tr('₹{price} each', { price: lineUnitPrice(line.product, line.kuchu) })}{typeof line.product.quantity === 'number' && line.product.quantity <= 5 ? ` · ${tr('only {count} left', { count: line.product.quantity })}` : ''}</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
                                <button type="button" aria-label={`Decrease quantity of ${line.product.name}`} onClick={() => changeQuantity(lineKey(line), -1)} style={{ width: '30px', height: '30px', cursor: 'pointer' }}>−</button>
                                <span aria-live="polite" style={{ minWidth: '1.5rem', textAlign: 'center', fontWeight: 'bold' }}>{line.quantity}</span>
                                <button type="button" aria-label={`Increase quantity of ${line.product.name}`} disabled={line.quantity >= maxOrderable(line.product)} onClick={() => changeQuantity(lineKey(line), 1)} style={{ width: '30px', height: '30px', cursor: line.quantity >= maxOrderable(line.product) ? 'not-allowed' : 'pointer' }}>+</button>
                                <button type="button" onClick={() => removeFromCart(lineKey(line))} style={{ marginLeft: '0.4rem', background: 'none', border: 'none', color: '#8b1e2d', textDecoration: 'underline', cursor: 'pointer' }}>{tr('Remove')}</button>
                              </div>
                            </div>
                            <div style={{ fontWeight: 'bold', color: 'var(--mr-primary)' }}>₹{lineUnitPrice(line.product, line.kuchu) * line.quantity}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ borderTop: '2px solid var(--mr-primary)', marginTop: '1rem', paddingTop: '0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                          <span>{tr('Items ({count})', { count: cartCount })}</span>
                          <span>₹{cartTotal}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '0.4rem', fontWeight: 'bold', fontSize: '1.1rem' }}>
                          <span>{tr('Order total')}</span>
                          <span style={{ color: 'var(--mr-primary)' }}>₹{cartTotal}</span>
                        </div>
                        <p style={{ color: '#666', fontSize: '0.8rem', marginBottom: 0 }}>{tr('Courier charges are billed separately after your order is confirmed.')}</p>
                        {unavailableLines.length > 0 && (
                          <p role="alert" style={{ color: '#8b1e2d', fontSize: '0.85rem', marginBottom: 0 }}>
                            {tr('Please update or remove: {names}.', { names: unavailableLines.map(line => line.product.name).join(', ') })} {tr(unavailableLines.length === 1 ? 'It is no longer available, or there is not enough stock.' : 'They are no longer available, or there is not enough stock.')}
                          </p>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '1.2rem' }}>
                        <button type="button" onClick={() => setIsCartOpen(false)} style={{ flex: '1 1 140px', backgroundColor: '#fff', color: 'var(--mr-primary)', border: '1px solid var(--mr-primary)', padding: '0.7rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>{tr('Continue shopping')}</button>
                        <button type="button" disabled={unavailableLines.length > 0} onClick={() => { setIsCartOpen(false); setCheckoutStep(1); setIsCheckoutOpen(true); }} style={{ flex: '1 1 140px', backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.7rem', borderRadius: '6px', cursor: unavailableLines.length > 0 ? 'not-allowed' : 'pointer', opacity: unavailableLines.length > 0 ? 0.6 : 1, fontWeight: 'bold' }}>{tr('Proceed to checkout')}</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 3-Step Checkout Drawer */}
            {isCheckoutOpen && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
                <div style={{ backgroundColor: '#fff', maxWidth: '550px', width: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '12px', padding: '1.8rem', position: 'relative' }}>
                  <button onClick={() => setIsCheckoutOpen(false)} style={{ position: 'absolute', top: '15px', right: '15px', border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>

                  <h2 style={{ color: 'var(--mr-primary)', marginTop: 0 }}>{tr('Checkout')}</h2>

                  {/* Order Summary */}
                  <div style={{ backgroundColor: 'var(--mr-tint)', padding: '0.8rem', borderRadius: '6px', marginBottom: '1.2rem', fontSize: '0.9rem' }}>
                    <strong>{tr('Order summary')}</strong>
                    {cart.length === 0 ? (
                      <p style={{ margin: '0.4rem 0 0' }}>{tr('Your cart is empty.')}</p>
                    ) : cart.map(line => (
                      <div key={lineKey(line)} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.35rem' }}>
                        <span>{line.product.name}{line.product.color ? ` (${line.product.color})` : ''} × {line.quantity}</span>
                        <span>₹{lineUnitPrice(line.product, line.kuchu) * line.quantity}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.5rem', fontWeight: 'bold' }}>
                      <span>{tr('Order total')}</span>
                      <span>₹{cartTotal}</span>
                    </div>
                    <button type="button" onClick={() => { setIsCheckoutOpen(false); setIsCartOpen(true); }} style={{ marginTop: '0.5rem', padding: '0.35rem 0.7rem', cursor: 'pointer' }}>{tr('Edit cart')}</button>
                  </div>

                  {/* Courier Policy Notice */}
                  <div style={{ backgroundColor: '#fff8e7', borderLeft: '4px solid #d97706', padding: '0.8rem', borderRadius: '4px', marginBottom: '1.2rem', fontSize: '0.85rem' }}>
                    <strong style={{ color: '#92400e' }}>{t.courierNoticeTitle}</strong>
                    {courierDecision.waived
                      ? <p role="status" style={{ margin: '0.3rem 0 0.5rem', color: '#1b5e20', fontWeight: 'bold' }}>{tr(courierDecision.reason)}</p>
                      : <>
                        <p style={{ margin: '0.3rem 0 0.5rem' }}>{t.courierNoticeBody}</p>
                        {normalizePincode(address.pincode) && <p role="status" style={{ margin: '0 0 0.5rem' }}>{tr(courierDecision.reason)}</p>}
                      </>}
                    <label style={{ fontWeight: 'bold', cursor: 'pointer' }}>
                      <input type="checkbox" checked={courierPolicyAccepted} onChange={(e) => setCourierPolicyAccepted(e.target.checked)} /> {t.acceptCourierNotice}
                    </label>
                  </div>

                  {/* Step 1: Address */}
                  {checkoutStep === 1 && (
                    <div>
                      <h3>{t.step1Address}</h3>
                      {savedAddresses.length > 0 && (
                        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.8rem' }}>
                          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input type="checkbox" checked={useSavedAddress} onChange={event => {
                              setUseSavedAddress(event.target.checked);
                              if (event.target.checked && !selectedAddressId) selectDeliveryAddress(savedAddresses[0].id);
                            }} />
                            {tr('Use a saved address')}
                          </label>
                          {useSavedAddress && (
                            <>
                              <select aria-label={tr('Select saved delivery address')} value={selectedAddressId} onChange={event => selectDeliveryAddress(event.target.value)}>
                                {savedAddresses.map(saved => <option key={saved.id} value={saved.id}>{saved.fullName} · {saved.street1} · {saved.pincode}</option>)}
                              </select>
                              <p style={{ margin: 0, color: '#555', fontSize: '0.85rem' }}>
                                {[address.houseNameOrNumber, address.street1, address.street2, address.landmark1, address.landmark2, address.city, address.taluk, address.district, address.state, address.pincode, address.country].filter(Boolean).join(', ')}
                              </p>
                              <button type="button" disabled={isCheckingPincode || address.pincode.length !== 6} onClick={() => void handleCheckPincode()}>
                                {isCheckingPincode ? tr('Checking pincode...') : tr('Check selected pincode online')}
                              </button>
                              {address.pincodeCheck && <span role="status">{address.pincodeCheck.provider}: {address.pincodeCheck.message}</span>}
                            </>
                          )}
                        </div>
                      )}
                      {!useSavedAddress && <DeliveryAddressFields address={address} setAddress={setAddress} isCheckingPincode={isCheckingPincode} onCheckPincode={() => void handleCheckPincode()} />}
                      {!useSavedAddress && (googleUser || !firebaseConfigured) && (
                        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.6rem' }}>
                          <input type="checkbox" checked={saveAddressForLater} onChange={event => setSaveAddressForLater(event.target.checked)} />
                          {tr('Save this address for next time')}
                        </label>
                      )}
                      <p style={{ color: '#666', fontSize: '0.8rem' }}>{tr('Delivery address only. The host will confirm courier serviceability before accepting payment.')}</p>
                      <button
                        onClick={() => setCheckoutStep(2)}
                        disabled={!address.pincodeCheck || ['NOT_FOUND', 'NOT_SERVICEABLE'].includes(address.pincodeCheck.status) || (useSavedAddress ? !selectedAddressId : !isAddressComplete(address))}
                        style={{ marginTop: '1.2rem', backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.7rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}
                      >{tr('Next: Item Payment')}</button>
                    </div>
                  )}

                  {/* Step 2: Payment */}
                  {checkoutStep === 2 && (
                    <form onSubmit={handlePlaceOrder}>
                      <h3>{t.step2Payment} (₹{cartTotal})</h3>
                      {firebaseConfigured && !googleUser && (
                        <div style={{ backgroundColor: '#f1f8ff', border: '1px solid #cfe3f7', padding: '0.8rem', borderRadius: '6px', margin: '0.6rem 0', fontSize: '0.85rem' }}>
                          <strong>{tr('No account needed.')}</strong> {tr(address.phone ? 'The host will confirm your order on WhatsApp at {phone}. Sign in with Google (optional) to keep track of your orders on any device.' : 'The host will confirm your order on WhatsApp. Sign in with Google (optional) to keep track of your orders on any device.', { phone: address.phone })}
                          <div style={{ marginTop: '0.5rem' }}>
                            <GoogleSignInButton onClick={() => void handleGoogleSignIn()} disabled={firebaseLoading} label={tr('Sign in with Google (optional)')} />
                          </div>
                        </div>
                      )}
                      <div style={{ backgroundColor: 'var(--mr-tint)', padding: '1rem', borderRadius: '6px', margin: '0.8rem 0' }}>
                        <p style={{ marginTop: 0, fontSize: '0.9rem' }}>{tr('Scan the payment QR provided by the host, pay, then attach the screenshot from your payment app. We will read the 12-digit UTR from it for you to check.')}</p>
                        <UpiPayBox upiId={upiId} payeeName={payeeName} amount={cartTotal} note="Mala Royale order" fallbackQrUrl={paymentQrUrl} tr={tr} />
                      </div>
                      <fieldset style={{ margin: '0.6rem 0', padding: '0.7rem', border: '1px solid #ddd', borderRadius: '8px', display: 'grid', gap: '0.45rem', fontSize: '0.88rem' }}>
                        <legend style={{ fontWeight: 'bold', padding: '0 0.3rem' }}>{tr('Order updates (optional)')}</legend>
                        <input type="email" aria-label={tr('Email for updates')} placeholder={tr('Your email (Gmail)')} value={contactEmail} onChange={event => setContactEmail(event.target.value)} style={{ padding: '0.5rem' }} />
                        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
                          <input type="checkbox" checked={consentEmail} onChange={event => setConsentEmail(event.target.checked)} />
                          {tr('Email me updates about this order')}
                        </label>
                        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
                          <input type="checkbox" checked={consentWhatsapp} onChange={event => setConsentWhatsapp(event.target.checked)} />
                          {tr('WhatsApp me updates about this order on')} {address.phone || tr('my phone number')}
                        </label>
                        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
                          <input type="checkbox" checked={consentPromos} onChange={event => setConsentPromos(event.target.checked)} />
                          {tr('Also send me offers and new arrivals')}
                        </label>
                        <small style={{ color: '#666' }}>{tr('We use these only for your order and, if you ticked it, offers. You can ask us to stop at any time.')}</small>
                      </fieldset>
                      <PaymentProofCapture file={paymentProof} onFile={setPaymentProof} utr={utr} onUtr={setUtr} expectedAmount={cartTotal} onCheck={setProofCheck} label={tr('Payment screenshot (PhonePe, GPay, Paytm or bank app)')} />
                      <button type="submit" disabled={firebaseLoading || uploadingProof} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.7rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>{uploadingProof ? tr('Uploading screenshot...') : t.placeOrder}</button>
                      {cartHasKuchu && <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: '#6b7280', textAlign: 'center' }}>{tr(FINAL_SALE_HEADLINE)}</p>}
                    </form>
                  )}
                </div>
              </div>
            )}
              </>
            )}

            {customerTab === 'ORDERS' && (
              <section aria-label={tr('Recent orders and tracking')}>
                <h2 style={{ color: 'var(--mr-primary)', marginTop: 0 }}>{t.myOrders}</h2>
                {firebaseConfigured && !googleUser && (
                  <div style={{ backgroundColor: '#f1f8ff', border: '1px solid #cfe3f7', padding: '0.8rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{tr('Placed an order before, or want to track orders from any device?')}</span>
                    <GoogleSignInButton onClick={() => void handleGoogleSignIn()} disabled={firebaseLoading} label={tr('Sign in with Google')} />
                  </div>
                )}
                {!isStaff && changedOrders.length > 0 && (
                  <div role="status" aria-live="polite" style={{ backgroundColor: '#e8f0fe', border: '1px solid #b6ccf7', padding: '0.8rem', borderRadius: '8px', marginBottom: '1rem', display: 'grid', gap: '0.5rem' }}>
                    <strong>{tr('Updates on your orders')}</strong>
                    {changedOrders.map(order => (
                      <div key={order.orderId} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', fontSize: '0.9rem' }}>
                        <span><code>{order.orderId}</code>: <strong>{tr(getOrderStatus(order))}</strong>{order.isWithheld && order.holdReason ? ` (${order.holdReason})` : ''}{order.stage === 'NOT_ACCEPTED' && order.rejectionReason ? ` (${order.rejectionReason})` : ''}</span>
                        <button type="button" onClick={() => { setExpandedOrders(current => ({ ...current, [order.orderId]: true })); markOrderSeen(order.orderId); }} style={{ cursor: 'pointer' }}>{tr('View')}</button>
                        <button type="button" onClick={() => markOrderSeen(order.orderId)} style={{ cursor: 'pointer' }}>{tr('Got it')}</button>
                      </div>
                    ))}
                    {changedOrders.length > 1 && <button type="button" onClick={() => markOrderSeen()} style={{ justifySelf: 'start', cursor: 'pointer' }}>{tr('Dismiss all')}</button>}
                  </div>
                )}
                {activeOrders.length === 0 ? (
                  <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #eee' }}>
                    <p style={{ marginTop: 0 }}>{firebaseConfigured && !googleUser ? tr('No orders on this device yet.') : tr('No orders yet.')}</p>
                    <button type="button" onClick={() => setCustomerTab('SHOP')} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 0, padding: '0.6rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>{tr('Browse the collection')}</button>
                  </div>
                ) : [...activeOrders].sort(newestFirst).map(ord => { const open = Boolean(expandedOrders[ord.orderId]); return (
                  <article key={ord.orderId} className="mr-order-row" style={{ backgroundColor: '#fff', border: '1px solid #eee', padding: '0.8rem 1rem', borderRadius: '10px', marginBottom: '0.8rem' }}>
                    <button type="button" className="mr-order-head is-customer" aria-expanded={open} onClick={() => toggleOrder(ord.orderId)}>
                      <span style={{ minWidth: 0 }}><span className="mr-order-label">{tr('Order ID')}</span><div className="mr-order-value" style={{ fontFamily: 'monospace' }}>{ord.orderId}</div></span>
                      <span className="mr-col-date" style={{ minWidth: 0 }}><span className="mr-order-label">{tr('Placed on')}</span><div className="mr-order-value">{new Date(ord.createdAt).toLocaleDateString()}</div></span>
                      <span><span className="mr-order-label">{tr('Total')}</span><div className="mr-order-value" style={{ color: 'var(--mr-primary)' }}>₹{ord.itemTotal}</div></span>
                      <span className="mr-status-chip" style={getOrderStatusStyle(ord)}>{tr(getOrderStatus(ord))}</span>
                      <span className="mr-chevron" aria-hidden="true">›</span>
                    </button>
                    {ord.isWithheld && !['NOT_ACCEPTED', 'CANCELLED', 'DELIVERED'].includes(ord.stage) && (
                      <div role="status" style={{ margin: '0.6rem 0', padding: '0.7rem', background: '#fff3cd', border: '1px solid #ffe08a', borderRadius: '8px', fontSize: '0.9rem' }}>
                        <strong>{tr('Your order is on hold')}</strong>{ord.holdReason ? `: ${ord.holdReason}` : ''}
                        {ord.holdNote && <div style={{ marginTop: '0.25rem' }}>{ord.holdNote}</div>}
                      </div>
                    )}
                    <ReportPaymentIssue order={ord} onSubmit={handleReportPaymentIssue} whatsappUrl={hostWhatsApp ? whatsAppLink(hostWhatsApp, `Hello Mala Royale, I have a problem with the payment for order ${ord.orderId}.`) : undefined} />
                    {(ord.stage === 'NOT_ACCEPTED' || (ord.refundDue || 0) > 0) && (
                      <RefundPrompt order={ord} onSubmit={handleSubmitRefund} validate={validateRefundDetails} />
                    )}
                    {open && (
                    <div className="mr-expand">
                    <OrderTimeline order={ord} />
                    {ord.hostMessage && (
                      <div role="status" style={{ margin: '0.7rem 0', padding: '0.7rem', background: '#eef6ff', border: '1px solid #cfe3f7', borderRadius: '8px' }}>
                        <strong>{tr('Message from Mala Royale')}</strong>
                        <p style={{ margin: '0.3rem 0 0', whiteSpace: 'pre-wrap' }}>{ord.hostMessage}</p>
                      </div>
                    )}
                    <OrderLines items={ord.items} />
                    {ord.itemPayment && <div style={{ margin: '0.4rem 0' }}><PaymentProofView url={ord.itemPayment.screenshotUrl} caption={tr('Your payment screenshot')} /></div>}
                    <p style={{ margin: '0.4rem 0', fontWeight: 'bold' }}>{tr('Order total: ₹')}{acceptedTotal(ord)}{(ord.rejectedTotal || 0) > 0 && <span style={{ color: '#8b1e2d', fontWeight: 'normal' }}> ({tr('₹')}{ord.rejectedTotal} {tr('of your items were rejected; originally ₹')}{ord.itemTotal})</span>}</p>
                    <p style={{ margin: '0.4rem 0', color: '#666', fontSize: '0.85rem' }}>{tr('Last updated')} {new Date(ord.updatedAt).toLocaleString()}</p>
                    <div style={{ margin: '0.7rem 0', padding: '0.75rem', backgroundColor: 'var(--mr-tint)', borderRadius: '6px' }}>
                      <strong>{tr('Delivery address submitted')}</strong>
                      <p style={{ margin: '0.35rem 0' }}>{ord.address.fullName} · {ord.address.phone}</p>
                      <p style={{ margin: '0.35rem 0' }}>
                        {[ord.address.houseNameOrNumber, ord.address.street1, ord.address.street2, ord.address.landmark1, ord.address.landmark2, ord.address.city, ord.address.taluk, ord.address.district, ord.address.state, ord.address.pincode, ord.address.country].filter(Boolean).join(', ') || ord.address.street}
                      </p>
                      <p role="status" style={{ margin: '0.35rem 0', color: ord.deliveryConfirmed ? '#1b5e20' : '#8a4b08' }}>
                        {ord.deliveryConfirmed ? `Host confirmed deliverable${ord.deliveryConfirmedAt ? ` · ${new Date(ord.deliveryConfirmedAt).toLocaleString()}` : ''}` : tr('Waiting for host to confirm delivery serviceability')}
                      </p>
                    </div>
                    {ord.courierBill && (
                      <div style={{ marginTop: '0.6rem', backgroundColor: '#e8f5e9', padding: '0.8rem', borderRadius: '6px', fontSize: '0.9rem' }}>
                        <p style={{ margin: 0 }}>{tr('Courier:')} <strong>{ord.courierBill.courierName}</strong></p>
                        <p style={{ margin: '0.2rem 0' }}>{tr('Tracking ID:')} <strong>{ord.courierBill.trackingId}</strong></p>
                        <p style={{ margin: 0 }}>{tr('Courier Charge:')} <strong>₹{ord.courierBill.amount}</strong></p>
                      </div>
                    )}
                    {ord.courierBill && <CourierPaymentForm order={ord} paymentQrUrl={paymentQrUrl} upiId={upiId} payeeName={payeeName} canSubmit={!firebaseConfigured || Boolean(firebaseUser)} onSubmit={handleCourierPayment} />}
                    </div>
                    )}
                  </article>
                ); })}
              </section>
            )}

            {customerTab === 'ABOUT' && (
              <AboutSection
                onSubmitFeedback={handleSubmitFeedback}
                signInButton={<GoogleSignInButton onClick={() => void handleGoogleSignIn()} disabled={firebaseLoading} label={tr('Sign in with Google')} />}
              />
            )}
            </div>

            {placedOrder && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: '1rem' }}>
                <div role="dialog" aria-label={tr('Order placed')} style={{ backgroundColor: '#fff', maxWidth: '460px', width: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '12px', padding: '1.8rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '2.4rem' }} aria-hidden="true">✅</div>
                  <h2 style={{ color: 'var(--mr-primary)', margin: '0.3rem 0' }}>{tr('Order placed!')}</h2>
                  <p style={{ margin: '0.3rem 0', color: '#555' }}>{tr('Thank you, {name}. Your order ID is:', { name: placedOrder.name })}</p>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 'bold', backgroundColor: 'var(--mr-tint)', padding: '0.7rem', borderRadius: '6px', letterSpacing: '0.04em', wordBreak: 'break-all' }}>{placedOrder.orderId}</div>
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard?.writeText(placedOrder.orderId).then(() => setOrderCopied(true)).catch(() => undefined); }}
                    style={{ marginTop: '0.6rem', padding: '0.45rem 0.9rem', cursor: 'pointer' }}
                  >
                    {orderCopied ? tr('Copied ✓') : tr('Copy order ID')}
                  </button>
                  <p style={{ margin: '0.9rem 0 0.3rem', fontWeight: 'bold' }}>{tr('Order total: ₹')}{placedOrder.total}</p>
                  <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.3rem 0 1rem' }}>
                    {tr('The host will verify your payment and confirm your order on WhatsApp at {phone}. Keep this order ID for any questions.', { phone: placedOrder.phone })}
                  </p>
                  {firebaseConfigured && !googleUser && (
                    <div style={{ marginBottom: '1rem' }}>
                      <p style={{ color: '#666', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>{tr('Want to track this order from any device?')}</p>
                      <GoogleSignInButton onClick={() => void handleGoogleSignIn()} disabled={firebaseLoading} label={tr('Sign in with Google')} />
                    </div>
                  )}
                  <button type="button" onClick={() => setPlacedOrder(null)} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.7rem 1.2rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>{tr('View my orders')}</button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {!isStaff && (
        <SiteFooter pages={sitePages} whatsapp={hostWhatsApp} whatsappUrl={hostWhatsApp ? whatsAppLink(hostWhatsApp, 'Hello Mala Royale, I have a question.') : undefined} onOpen={setPageView} tr={tr} />
      )}
      {pageView && (
        <SitePageView
          page={sitePages[pageView]}
          shop="Mala Royale"
          whatsapp={hostWhatsApp}
          whatsappUrl={pageView === 'contact' && hostWhatsApp ? whatsAppLink(hostWhatsApp, 'Hello Mala Royale, I have a question.') : undefined}
          onClose={() => { setPageView(null); if (window.location.hash.startsWith('#page=')) window.history.replaceState(null, '', window.location.pathname + window.location.search); }}
          tr={tr}
        />
      )}
      {viewProduct && (
        <ProductQuickView
          product={viewProduct}
          variants={viewVariants}
          related={viewRelated}
          kuchuList={kuchuList}
          kuchuId={kuchuChoice[choiceKey(viewProduct)] || ''}
          wished={wishlist.has(viewProduct.id)}
          badges={cardBadges(viewProduct)}
          onKuchu={id => setKuchuChoice(current => ({ ...current, [choiceKey(viewProduct)]: id }))}
          onVariant={id => setViewProductId(id)}
          onOpen={id => setViewProductId(id)}
          onAdd={() => {
            const selection = selectionFor(viewProduct);
            addToCart(viewProduct, selection);
            trackAddToCart(viewProduct.id, viewProduct.category);
            return true;
          }}
          onBuy={() => {
            const selection = selectionFor(viewProduct);
            setViewProductId(null);
            buyNow(viewProduct, selection);
          }}
          onToggleWish={() => wishlist.toggle(viewProduct.id)}
          onShare={() => shareProduct(viewProduct)}
          onClose={() => setViewProductId(null)}
          onView={() => trackProductView(viewProduct.id, viewProduct.category)}
          courierFor={pin => evaluateCourierRules({ items: [{ quantity: 1 }], pincode: pin, userId: customerKey, recentOrders: isStaff ? [] : activeOrders, config: shippingConfig, now: Date.now() })}
          checkPincode={checkDeliveryPincode}
          tr={tr}
        />
      )}
      {shareTarget && <Suspense fallback={null}><ShareMenu product={shareTarget} onClose={() => setShareTarget(null)} /></Suspense>}

      {!isStaff && (
        <div style={{ position: 'fixed', right: '16px', bottom: '16px', zIndex: 900, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.6rem' }}>
          {isEnquiryOpen && (
            <div role="dialog" aria-label={tr('Send us an enquiry')} style={{ width: 'min(330px, calc(100vw - 32px))', maxHeight: '80vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }}>
              <div style={{ backgroundColor: '#075e54', color: '#fff', padding: '0.8rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{tr('Mala Royale')}</strong>
                  <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>{tr('Ask us anything. We reply on WhatsApp.')}</div>
                </div>
                <button type="button" aria-label={tr('Close chat')} onClick={() => setIsEnquiryOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
              </div>
              {enquirySent ? (
                <div style={{ padding: '1.3rem', textAlign: 'center', backgroundColor: '#ece5dd' }}>
                  <div style={{ fontSize: '2rem' }} aria-hidden="true">✅</div>
                  <strong>{tr('Enquiry sent!')}</strong>
                  <p style={{ color: '#555', fontSize: '0.85rem' }}>{tr('We will reply to you on WhatsApp shortly.')}</p>
                  <button type="button" onClick={() => { setEnquirySent(false); setEnquiryProduct(null); setIsEnquiryOpen(false); }} style={{ backgroundColor: '#25d366', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.55rem 1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>{tr('Close')}</button>
                </div>
              ) : (
                <div style={{ padding: '0.9rem', display: 'grid', gap: '0.6rem', backgroundColor: '#ece5dd' }}>
                  {enquiryProduct && (
                    <div style={{ fontSize: '0.8rem', backgroundColor: '#fff', borderRadius: '6px', padding: '0.4rem 0.6rem', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                      <span>{tr('About:')} <strong>{enquiryProduct.name}</strong></span>
                      <button type="button" aria-label={tr('Remove product from enquiry')} onClick={() => setEnquiryProduct(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                    </div>
                  )}
                  <input aria-label={tr('Your name')} placeholder={tr('Your name *')} maxLength={80} value={enquiryName} onChange={event => setEnquiryName(event.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }} />
                  <input aria-label={tr('Your WhatsApp number')} type="tel" inputMode="numeric" placeholder={tr('Your WhatsApp number *')} maxLength={16} value={enquiryPhone} onChange={event => setEnquiryPhone(event.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }} />
                  <textarea aria-label={tr('Your message')} rows={4} maxLength={1000} placeholder={tr('Type your question *')} value={enquiryMessage} onChange={event => setEnquiryMessage(event.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc', resize: 'vertical' }} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {['Is this available?', 'What are the courier charges?', 'I want a custom Kuchu'].map(chip => (
                      <button key={chip} type="button" onClick={() => setEnquiryMessage(chip)} style={{ backgroundColor: '#fff', border: '1px solid #bbb', borderRadius: '999px', padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}>{chip}</button>
                    ))}
                  </div>
                  {enquiryError && <p role="alert" style={{ color: '#b00020', margin: 0, fontSize: '0.8rem' }}>{enquiryError}</p>}
                  {enquiryNeedsSignIn && !googleUser && (
                    <GoogleSignInButton onClick={() => void handleGoogleSignIn()} disabled={firebaseLoading} label={tr('Sign in with Google')} />
                  )}
                  <button type="button" disabled={enquirySending} onClick={() => void sendEnquiry()} style={{ backgroundColor: '#25d366', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.65rem', fontWeight: 'bold', cursor: enquirySending ? 'not-allowed' : 'pointer', opacity: enquirySending ? 0.7 : 1 }}>{enquirySending ? tr('Sending...') : tr('Send enquiry')}</button>
                  <small style={{ color: '#555' }}>{tr('We will reply to you on WhatsApp at the number you enter.')}</small>
                  {hostWhatsApp && (
                    <a
                      href={whatsAppLink(hostWhatsApp, `${enquiryName.trim() ? `Hi, I'm ${enquiryName.trim()}. ` : 'Hi! '}${enquiryMessage.trim()}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textAlign: 'center', color: '#075e54', fontWeight: 'bold', fontSize: '0.82rem' }}
                    >
                      {tr('Or message us directly on WhatsApp')}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
          <button type="button" aria-label={tr('Chat with us')} onClick={() => (isEnquiryOpen ? setIsEnquiryOpen(false) : openEnquiry())} style={{ width: '58px', height: '58px', borderRadius: '50%', backgroundColor: '#25d366', border: 'none', boxShadow: '0 4px 14px rgba(0,0,0,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <WhatsAppIcon />
          </button>
        </div>
      )}
      {notifyNote && <div role="status" style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 1100, background: '#1b5e20', color: '#fff', padding: '0.6rem 0.9rem', borderRadius: '8px', boxShadow: '0 4px 14px rgba(0,0,0,0.25)', maxWidth: '320px', fontSize: '0.9rem' }}>{notifyNote}</div>}
      {acceptDialog && (
        <ConfirmDialog
          title={acceptDialog.title}
          details={acceptDialog.details}
          confirmLabel={acceptDialog.confirmLabel}
          tone={acceptDialog.tone}
          reasons={acceptDialog.reasons}
          onCancel={() => closeAcceptDialog(null)}
          onConfirm={result => closeAcceptDialog(result)}
        />
      )}
    </div>
    </TrContext.Provider>
  );
}
