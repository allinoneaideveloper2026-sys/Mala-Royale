// The one place that sends messages to customers. Secrets (keys, tokens) come only from the Worker's environment.
// Channels: email (Gmail script today, Resend later), WhatsApp Cloud API, and push (ready, switched off).
// Each channel is an adapter behind a small interface, so a provider can be replaced without touching the rest.
import { composeMessage, isEmail, type NotifyEvent, type ShopInfo } from '../src/domain/notifications';
import type { Order } from '../src/domain/types';

export interface NotifyEnv {
  EMAIL_PROVIDER?: string; // 'gmail' | 'resend' | 'off'
  WHATSAPP_PROVIDER?: string; // 'cloud' | 'off'
  PUSH_PROVIDER?: string; // 'off' for now
  SHOP_NAME?: string;
  SITE_URL?: string;
  GMAIL_SCRIPT_URL?: string;
  GMAIL_SCRIPT_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_TEMPLATE_LANG?: string;
}

type FetchFn = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface EmailMessage { to: string; subject: string; text: string; html: string }
export interface EmailProvider { name: string; send: (message: EmailMessage) => Promise<void> }
export interface WhatsAppProvider { name: string; sendTemplate: (to: string, template: string, params: string[]) => Promise<void> }

const fail = async (label: string, response: { status: number; text: () => Promise<string> }) => {
  const detail = (await response.text()).slice(0, 200);
  throw new Error(`${label} failed (${response.status}) ${detail}`.trim());
};

/** Sends through a small Google Apps Script that mails from your own Gmail (free, no domain needed). */
export function gmailScriptProvider(env: NotifyEnv, fetchFn: FetchFn): EmailProvider | null {
  if (!env.GMAIL_SCRIPT_URL || !env.GMAIL_SCRIPT_SECRET) return null;
  return {
    name: 'gmail',
    async send(message) {
      const response = await fetchFn(env.GMAIL_SCRIPT_URL as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: env.GMAIL_SCRIPT_SECRET, to: message.to, subject: message.subject, text: message.text, html: message.html, name: env.SHOP_NAME || 'Mala Royale' }),
      });
      const body = await response.text();
      let ok = response.ok;
      try { ok = ok && (JSON.parse(body) as { ok?: boolean }).ok === true; } catch { ok = false; }
      if (!ok) throw new Error(`Gmail script failed (${response.status}) ${body.slice(0, 160)}`.trim());
    },
  };
}

/** Resend (needs your own verified domain). Uses the plain web API, so no extra package is needed. */
export function resendProvider(env: NotifyEnv, fetchFn: FetchFn): EmailProvider | null {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return null;
  return {
    name: 'resend',
    async send(message) {
      const response = await fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      });
      if (!response.ok) await fail('Resend', response);
    },
  };
}

/** WhatsApp Cloud API: pre-approved templates named mr_<event> with three text values (name, order number, status). */
export function whatsappCloudProvider(env: NotifyEnv, fetchFn: FetchFn): WhatsAppProvider | null {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return null;
  return {
    name: 'whatsapp-cloud',
    async sendTemplate(to, template, params) {
      const response = await fetchFn(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: { name: template, language: { code: env.WHATSAPP_TEMPLATE_LANG || 'en' }, components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text })) }] },
        }),
      });
      if (!response.ok) await fail('WhatsApp', response);
    },
  };
}

export function emailProviderFor(env: NotifyEnv, fetchFn: FetchFn): EmailProvider | null {
  if (env.EMAIL_PROVIDER === 'gmail') return gmailScriptProvider(env, fetchFn);
  if (env.EMAIL_PROVIDER === 'resend') return resendProvider(env, fetchFn);
  return null; // 'off' or not set
}

export function whatsappProviderFor(env: NotifyEnv, fetchFn: FetchFn): WhatsAppProvider | null {
  return env.WHATSAPP_PROVIDER === 'cloud' ? whatsappCloudProvider(env, fetchFn) : null;
}

export const whatsappTemplateName = (event: NotifyEvent) => `mr_${event.toLowerCase()}`;

export type ChannelResult = 'sent' | `skipped: ${string}` | `failed: ${string}`;
export interface NotifyResults { email: ChannelResult; whatsapp: ChannelResult; push: ChannelResult }

/** Sends the message for this event to each channel the customer agreed to and the shop has switched on. */
export async function sendNotifications({ env, event, order, fetchFn }: { env: NotifyEnv; event: NotifyEvent; order: Order; fetchFn: FetchFn }): Promise<NotifyResults> {
  const shop: ShopInfo = { name: env.SHOP_NAME || 'Mala Royale', siteUrl: env.SITE_URL || '' };
  const message = composeMessage(event, order, shop);
  const consent = order.consent;
  const results: NotifyResults = { email: 'skipped: not agreed', whatsapp: 'skipped: not agreed', push: 'skipped: not switched on' };

  if (consent?.consent_email && isEmail(consent.email)) {
    const provider = emailProviderFor(env, fetchFn);
    if (!provider) results.email = 'skipped: email is switched off';
    else {
      try { await provider.send({ to: consent.email, subject: message.subject, text: message.text, html: message.html }); results.email = 'sent'; }
      catch (error) { results.email = `failed: ${error instanceof Error ? error.message : String(error)}`; }
    }
  }

  if (consent?.consent_whatsapp && consent.whatsapp) {
    const provider = whatsappProviderFor(env, fetchFn);
    if (!provider) results.whatsapp = 'skipped: WhatsApp is switched off';
    else {
      try { await provider.sendTemplate(consent.whatsapp, whatsappTemplateName(event), message.whatsappParams); results.whatsapp = 'sent'; }
      catch (error) { results.whatsapp = `failed: ${error instanceof Error ? error.message : String(error)}`; }
    }
  }
  return results;
}
