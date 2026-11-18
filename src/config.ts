export const APP_VERSION = '0.1.0-web';
// Real staff emails come from VITE_* settings only. These placeholders just keep the offline demo mode
// (no Firebase configured) working; they grant nothing because Firestore rules decide real access.
const DEMO_DEVELOPER_EMAIL = 'developer@example.com';
const DEMO_OWNER_EMAIL = 'owner@example.com';

function parseEmails(value: string | undefined, fallback: string): string[] {
  const list = (value || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
  return list.length > 0 ? list : [fallback];
}

export const CONFIG = {
  version: APP_VERSION,
  developerEmails: parseEmails(import.meta.env.VITE_DEVELOPER_EMAILS, DEMO_DEVELOPER_EMAIL),
  ownerEmails: parseEmails(import.meta.env.VITE_OWNER_EMAILS, DEMO_OWNER_EMAIL),
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  pincodeProxyUrl: import.meta.env.VITE_PINCODE_PROXY_URL || '',
  feedbackUrl: import.meta.env.VITE_FEEDBACK_URL || '',
  // Hosts the developer can add. Starts at 3; raise it with VITE_MAX_HOST_LOGINS when the shop grows.
  maxHostLogins: Number(import.meta.env.VITE_MAX_HOST_LOGINS) || 3,
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  },
  cloudinary: {
    cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '',
    uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '',
    // Optional separate preset for customer payment screenshots (falls back to the product preset).
    proofPreset: import.meta.env.VITE_CLOUDINARY_PROOF_PRESET || '',
  },
};
