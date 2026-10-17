# Product brief

Build a working Formspree-style form-to-email service with an owner-only dashboard. Multiple people can use the submission API, but only I can create, configure, or revoke keys. Each key routes submissions exclusively to the recipient configured in my dashboard. Implement the product, not just a mockup.

## Stack
- Next.js App Router, JavaScript, Tailwind CSS, Prisma, PostgreSQL, and Brevo transactional email API. Preserve compatible existing project conventions.
- Server-only environment variables: DATABASE_URL, BREVO_API_KEY, MAIL_FROM_EMAIL, MAIL_FROM_NAME, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, SESSION_SECRET. Supply .env.example with placeholders; never commit secrets.

## Dashboard
- Provide a polished, responsive admin login and dashboard with key management and submission history.
- Only the configured owner can log in; no signup or customer accounts. Protect all dashboard pages and admin APIs server-side using secure HttpOnly sessions; protect authenticated mutations against CSRF.
- Create a form/key by entering a label, recipient name, recipient email, and email subject. Names alone cannot route email; recipient email is required.
- Generate a strong random API key, display it once with a copy button and integration example, and store only its SHA-256 hash and identifying prefix.
- List keys with label, recipient, creation date, and active/revoked state. Allow recipient edits, key rotation, and revocation with confirmation. Revocation takes effect immediately; preserve historical records.
- Show submissions with form/key label, sender, timestamp, message, sending status, and failure details. Never expose Brevo credentials or raw keys.

## Public API
- POST /form/send accepts application/json and X-API-Key. No identifier in the URL and no form ID required in the body.
- Request: {"fields":{"firstName":"Alex","lastName":"Smith","email":"alex@example.com","message":"Hello!"}}.
- Require firstName, email, and message; lastName is optional. Validate types, email format, and sensible length limits. Reject unknown fields initially.
- Look up the key by hash and reject missing, invalid, or revoked keys. Resolve the recipient from database configuration only. Never accept recipient, sender address, subject, or HTML overrides from callers.
- Support browser integration with permissive CORS and OPTIONS preflight for POST, Content-Type, and X-API-Key; do not enable cookie credentials on this endpoint.
- Do not add CAPTCHA, bot detection, rate limits, origin allowlists, billing, or public onboarding. Browser submission keys are visible publicly and grant submission access only, never dashboard access.

## Persistence and email
- Model Form (label, recipient name/email, subject), ApiKey (form relation, hash, prefix, revokedAt), and Submission (form/key relations, fields JSON, recipient snapshot, status, Brevo message ID, error code, timestamps). Include migrations and useful indexes.
- Save each submission before sending. Call Brevo POST https://api.brevo.com/v3/smtp/email using its api-key header outside any open database transaction.
- Render an attractive mobile-friendly HTML email with purple accents, clear sender details, message paragraphs, timestamp, and a mailto reply button. Include plain text; escape all submitted content. Use the configured verified sender and visitor email as replyTo.
- Await Brevo before responding. Track PENDING, SENDING, ACCEPTED, FAILED, UNKNOWN; provider acceptance is not confirmed delivery. Timeouts/interrupted sends have uncertain outcomes; do not automatically resend them.
- Return consistent JSON with submissionId and status on success, and error code/message on failure. Use appropriate HTTP status codes. Redact secrets and message bodies from logs.

## Completion
- Deliver functional dashboard, API, Prisma migrations, setup README, and a copyable browser fetch example. No Redis, queues, workers, or delivery webhooks in v1.
- Test admin authorization, recipient isolation between keys, revocation, validation, and Brevo success/failure/timeout handling with mocked email calls. Run relevant checks and production build; report any blockers honestly.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
