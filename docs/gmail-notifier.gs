/**
 * Mala Royale - free email sender using your own Gmail (Google Apps Script).
 *
 * Setup (about 10 minutes, no domain needed):
 * 1. Sign in to the Gmail account the emails should come from. Open https://script.google.com and create a New project.
 * 2. Replace the code with this whole file and save.
 * 3. Project Settings (gear icon) -> Script properties -> Add: name SECRET, value a long random text you make up.
 *    Keep the same text for the Cloudflare secret GMAIL_SCRIPT_SECRET.
 * 4. Deploy -> New deployment -> type "Web app". Execute as: Me. Who has access: Anyone. Deploy and allow access when asked.
 * 5. Copy the Web app URL (ends in /exec). Put it in Cloudflare as the secret GMAIL_SCRIPT_URL.
 * 6. In wrangler.jsonc set "EMAIL_PROVIDER": "gmail" and push.
 *
 * A free Gmail account can send roughly 100 recipients a day (check Google's current limit).
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || data.secret !== secret) return reply_({ ok: false, error: 'bad secret' });
    if (!data.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.to)) return reply_({ ok: false, error: 'bad recipient' });
    if (MailApp.getRemainingDailyQuota() < 1) return reply_({ ok: false, error: 'daily email limit reached' });
    MailApp.sendEmail({
      to: data.to,
      subject: String(data.subject || '').slice(0, 200),
      body: String(data.text || ''),
      htmlBody: String(data.html || ''),
      name: String(data.name || 'Mala Royale')
    });
    return reply_({ ok: true });
  } catch (error) {
    return reply_({ ok: false, error: String(error) });
  }
}

function reply_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
