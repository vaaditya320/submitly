export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function emailContent(submission, env) {
  const f = submission.fields;
  const sender = [f.firstName, f.lastName].filter(Boolean).join(' ');
  const date = new Date(submission.createdAt).toISOString();
  const textContent = `New submission\n\nFrom: ${sender} <${f.email}>\nReceived: ${date}\n\n${f.message}\n\nReply: ${f.email}`;
  const htmlContent = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f6f4fb;font-family:Arial,sans-serif;color:#29243b;padding:24px 12px"><table role="presentation" style="width:100%;max-width:600px;margin:auto;border-collapse:collapse"><tr><td style="padding:20px;color:#7150d7;font-size:24px;font-weight:bold">↗ Submitly</td></tr><tr><td style="background:white;border-top:4px solid #7955da;padding:32px;border-radius:12px"><p style="font-size:12px;letter-spacing:2px;color:#7955da">A NEW CONNECTION</p><h1 style="font-size:26px">You've got a message.</h1><p style="line-height:1.7"><strong>${escapeHtml(sender)}</strong><br>${escapeHtml(f.email)}<br><span style="font-size:12px;color:#7b768c">${escapeHtml(date)}</span></p><div style="padding:20px;background:#f8f6fc;border-radius:8px;overflow-wrap:anywhere">${f.message.split(/\r?\n/).map(p => `<p style="line-height:1.7;margin:0 0 12px">${escapeHtml(p) || '<br>'}</p>`).join('')}</div><p style="margin-top:32px"><a href="mailto:${escapeHtml(encodeURIComponent(f.email))}" style="display:inline-block;background:#7955da;color:white;padding:14px 24px;border-radius:8px;text-decoration:none">Reply to ${escapeHtml(f.firstName)} ↗</a></p></td></tr><tr><td style="padding:24px;font-size:12px;color:#8b859c;text-align:center">Delivered to your inbox with Submitly</td></tr></table></body></html>`;
  return { sender: { email: env.MAIL_FROM_EMAIL, name: env.MAIL_FROM_NAME || 'Submitly' }, to: [{ email: submission.recipientEmail, name: submission.recipientName }], replyTo: { email: f.email, name: sender }, subject: submission.subject, htmlContent, textContent };
}
export async function sendEmail(submission, { fetchImpl = fetch, env = process.env, timeoutMs = 15000 } = {}) {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM_EMAIL) return { status: 'FAILED', errorCode: 'EMAIL_NOT_CONFIGURED' };
  const controller = new AbortController();
  let timer;
  try {
    const operation = (async () => {
      const response = await fetchImpl('https://api.brevo.com/v3/smtp/email', { method: 'POST', signal: controller.signal, headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(emailContent(submission, env)) });
      if (!response.ok) return { status: 'FAILED', errorCode: `BREVO_HTTP_${response.status}` };
      const data = await response.json();
      return typeof data.messageId === 'string' ? { status: 'ACCEPTED', brevoMessageId: data.messageId } : { status: 'UNKNOWN', errorCode: 'BREVO_INVALID_RESPONSE' };
    })();
    return await Promise.race([operation, new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ status: 'UNKNOWN', errorCode: 'BREVO_TIMEOUT' }); }, timeoutMs); })]);
  } catch { return { status: 'UNKNOWN', errorCode: 'BREVO_INTERRUPTED' }; }
  finally { clearTimeout(timer); }
}
