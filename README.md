# Submitly

Owner-managed form-to-email service: Next.js App Router (JavaScript), Tailwind CSS, NextAuth, Prisma, PostgreSQL, and Brevo. Only the configured owner manages forms and keys. Submission users need no accounts.

## Setup

Use Node.js 22+ and PostgreSQL. Install dependencies, copy `.env.example` to `.env`, and generate a password hash:

```sh
npm install
npm run password:hash
```

| Environment variable | Value |
| --- | --- |
| DATABASE_URL | PostgreSQL URL with provider TLS settings; URL-encode credentials |
| BREVO_API_KEY | Transactional API key, not SMTP password |
| MAIL_FROM_EMAIL | Verified Brevo sender email |
| MAIL_FROM_NAME | Sender display name |
| ADMIN_EMAIL | Sole owner login email |
| ADMIN_PASSWORD_HASH | Salted scrypt output from password:hash, never plaintext |
| SESSION_SECRET | Random secret of at least 32 characters |

Generate the session secret, initialize, and start:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
npm run db:generate
npm run db:migrate
npm run dev
```

For local development, open http://localhost:3000. The production dashboard is https://submitly.vaadii.in. Sign in with the owner email and original password. Create a form with its label, recipient name/email, and subject. Copy the newly revealed key immediately; it cannot be retrieved again. Rotate to replace a lost key. Editing recipients affects future submissions; history preserves recipient snapshots.

## Production

```sh
npm run db:generate
npm run db:migrate
npm test
npm run build
npm start
```

Deploy behind HTTPS with these server-only environment variables. Forward the correct public host/protocol through a trusted reverse proxy. Production NextAuth cookies are Secure, HttpOnly, and SameSite=Lax; local HTTP development uses non-Secure cookies. Sessions last eight hours. Changing SESSION_SECRET invalidates sessions. `.env` is ignored by Git; no secrets have a NEXT_PUBLIC prefix.

## Browser integration

No form ID is required. Browser keys are intentionally public and grant submission access only.

```js
const response = await fetch('https://submitly.vaadii.in/form/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'YOUR_SUBMISSION_KEY',
  },
  body: JSON.stringify({ fields: {
    firstName: 'Alex',
    lastName: 'Smith', // optional
    email: 'alex@example.com',
    message: 'Hello!',
  } }),
});
const result = await response.json();
if (!response.ok) {
  // Do not automatically retry UNKNOWN outcomes or a lost response.
  throw new Error(result.error.message);
}
console.log(result.submissionId, result.status);
```

CORS permits all origins, POST/OPTIONS, Content-Type and X-API-Key, without cookie credentials. Body limit: 64 KiB. Names: 100 characters. Email: 254 characters. Message: 10,000 characters. firstName, email, and message are required. Unknown fields and recipient/sender/subject/HTML overrides are rejected.

Success: HTTP 202 with `{ "submissionId": "...", "status": "ACCEPTED" }`.

Errors contain `{ "error": { "code": "...", "message": "..." } }`, plus submissionId/status when saved. HTTP 400: invalid JSON/fields; 401: invalid/revoked key; 413: oversized body; 415: wrong media type; 502: email rejection/configuration failure; 503: persistence/service failure; 504: uncertain provider outcome.

## Sending and security

- PENDING: saved before sending.
- SENDING: send is about to be attempted.
- ACCEPTED: Brevo returned a message ID. **Not confirmed delivery.**
- FAILED: missing email configuration or explicit provider HTTP rejection.
- UNKNOWN: timeout, interruption, or malformed success response.

Brevo runs outside database transactions with a 15-second timeout and no retries. Following process interruption, pending/sending records older than five minutes become UNKNOWN when the owner opens or refreshes the dashboard. Until refresh, they retain their last persisted state. Failed final database writes return UNKNOWN even if Brevo accepted the email. Never automatically resend uncertain outcomes.

Key admission and revocation use PostgreSQL row locks. Previously admitted submissions may finish; new requests are rejected immediately after revocation. Recipient and subject snapshots preserve history. From uses the verified configured sender; replyTo uses the visitor email. Submitted HTML is escaped; plain text is included.

Dashboard pages and admin mutations enforce owner sessions server-side. NextAuth protects login/logout against CSRF; custom mutations require the exact Origin and an action header. Only key hashes and prefixes are stored. Logs exclude credentials, raw keys, message bodies, and raw provider errors.

## Verification

`npm test` uses mocked database and email calls covering authorization, CSRF, recipient isolation, revocation/rotation, validation, HTML escaping, provider success/failure/timeouts, and persistence failures. Tests send no real email.

Dashboard features include form search, submission details, 25-record history pages, empty states, and database failure states. V1 deliberately excludes signup, CAPTCHA, rate limits, origin allowlists, billing, queues, workers, delivery webhooks, and automatic retries.

References: [Brevo transactional email](https://developers.brevo.com/reference/send-transac-email), [NextAuth Credentials](https://authjs.dev/getting-started/authentication/credentials).
