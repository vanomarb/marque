# Backend plan

The site is a static front end. Sign-in, saved briefs, the contact form and the newsletter run in the browser only and
say so on the page. This is what has to exist behind them before launch.

A brief is what a client prices in the builder. A quote is the studio's priced reply to a brief, and the client approves
it to start the work.

## The seam

The pages never touch storage or the network. They get one object from `createBackend()` in
`app/lib/backend/index.ts` and call four small interfaces defined in `app/lib/backend/types.ts`. Only
`app/lib/backend/storage.ts`, the local adapters, and the header's first-paint script (see "The header" below) read
`localStorage`.

| Interface | Today (local adapter) | After launch |
|---|---|---|
| `auth`: `AuthBackend` | `local-auth.ts`: code shown on the page, session in `localStorage` (`marque.account`), Google not connected | Email codes and Google OAuth on the server, session cookie |
| `briefs`: `BriefsBackend` | `local-briefs.ts`: briefs in `localStorage` (`marque.briefs`), each under the email that saved it, newest 12 per person | Briefs table per account |
| `contact`: `ContactBackend` | `local-contact.ts`: checks the message, answers `not-connected` | `POST /api/contact` |
| `newsletter`: `NewsletterBackend` | `local-newsletter.ts`: checks the address, answers `not-connected` | `POST /api/newsletter` |

To connect a concern, write a network adapter with the same interface (for example `createHttpAuth()`), return it from
`createBackend()` and leave the local one for tests. Every method resolves and none throws: network errors, timeouts
and 5xx responses become the `failed` result with a message the page can show. The pages already handle every result,
including `sent`, `subscribed`, `redirect` and `failed`.

Pure rules stay in `app/lib/` and run on both sides: `validateContact()`, `parseEmail()` and `emailProblem()`,
`validateFirstName()`, `isSelection()`, `estimate()` and `firstProjectPrice()`. The server checks again; it never trusts
totals from the browser.

## auth

| Method | Endpoint | Request | Response | Errors |
|---|---|---|---|---|
| `startEmailSignIn(email, firstName?)` | `POST /api/auth/code` | `{ email, firstName? }` | `200 {}` → `{ status: 'sent', email, preview: null }` | `422 { field, message }` → `invalid`; `429`, `5xx` → `failed` |
| `verifyCode(email, code)` | `POST /api/auth/verify` | `{ email, code }` | `200 { session }` and a session cookie → `{ status: 'signed-in', session, remembered: true }` | `401 { reason: 'wrong-code' }` → `wrong-code`; `410` → `expired`; `5xx` → `failed` |
| `startGoogleSignIn()` | `GET /api/auth/google/start` | | `200 { url }` → `{ status: 'redirect', url }` | `5xx` → `failed`. Today: `{ status: 'not-connected' }`; drop it once OAuth is live |
| `currentSession()` | `GET /api/session` | cookie | `200 { session }` or `204` → `null` | network error → `null` |
| `signOut()` | `DELETE /api/session` | cookie | `204` | ignored: the cookie is cleared either way |

- **No passwords.** Google OAuth (OpenID Connect, `email` and `profile` scopes) and email one-time codes.
- **Codes.** Four digits, single use, valid for 10 minutes, at most 5 tries, then a new code. Store only a hash. Rate-limit
  sends per email and per IP. The email says what the code is for and that nobody from Marque will ask for it.
- **Accounts.** `id`, `email` (unique, lower-cased), `email_verified_at`, `first_name` (optional, up to 40 characters),
  `google_sub` (optional, unique), `created_at`. A Google sign-in with a verified email that matches an account signs into
  it and stores `google_sub`. `Session` keeps its shape: `{ firstName: string | null, email }`.
- **Sessions.** An HttpOnly, Secure, SameSite=Lax cookie with a random id; expires after 30 days unused. List it on the
  Cookie Policy before it ships.
- **The header.** `app/components/header.html` reads `marque.account` before first paint to show the name, by the same
  rules as `readSession()`. Once sessions are cookies, replace that with a non-HttpOnly `marque_name` cookie holding the
  label only, or drop the first-paint name.

## briefs

| Method | Endpoint | Request | Response | Errors |
|---|---|---|---|---|
| `list()` | `GET /api/briefs` | cookie | `200 [{ id, savedAt, selection }]`, newest first, at most 12 | `401`, `5xx` → `[]` and the page shows its empty state |
| `save(selection)` | `POST /api/briefs` | `{ selection }` | `201 { brief, dropped }` → `saved`; `200 { brief }` → `already-saved` | `422` → `failed`; `5xx` → `failed`. `not-saved` is the local adapter's, when the browser keeps nothing |
| `remove(id)` | `DELETE /api/briefs/:id` | cookie | `204` → `removed`; `404` → `not-found`, which the page treats as removed | `5xx` → `failed`. `not-removed` is the local adapter's, when the browser won't change what it keeps |

- **Table.** `id`, `account_id` (nullable), `email` (nullable, for briefs sent before an account exists), `selection`
  (the builder's JSON, `Selection` in `app/lib/estimate.ts`), `saved_at`.
- **Invariants.** Validate with `isSelection()`, read older records with `fromStored()`, keep the newest 12 per account
  (`MAX_BRIEFS`), and treat the same selection as the newest brief as `already-saved`.
- **On this device today.** Each brief in `marque.briefs` stores `owner`: the lower-cased email that saved it, or null
  when it was saved signed out. `list()` returns the signed-in person's briefs and the unowned ones. Signing in, or
  starting the page with a session already kept, claims the unowned ones for that email.
- **Moving local briefs.** After sign-in, upload the briefs in `marque.briefs` that have no owner and those owned by the
  signed-in email, then remove them from the browser. Another email's briefs stay where they are.

## contact

| Method | Endpoint | Request | Response | Errors |
|---|---|---|---|---|
| `send(message)` | `POST /api/contact` | `{ name, business, email, message }` and a honeypot field | `202` → `sent` | `422 { errors }` → `invalid`; `429`, `5xx` → `failed` |

- **Table.** `id`, `name`, `business`, `email`, `message`, `brief_id` (nullable), `created_at`, `account_id` (nullable).
- Email the studio inbox and send the sender a plain receipt. The page clears the form only on `sent`.

## newsletter

| Method | Endpoint | Request | Response | Errors |
|---|---|---|---|---|
| `subscribe(email)` | `POST /api/newsletter` | `{ email }` | `202` → `subscribed` (a confirmation email goes out) | `422 { message }` → `invalid`; `5xx` → `failed` |

Double opt-in and one-click unsubscribe. Store `email`, `confirmed_at`, `unsubscribed_at`.

## Linking by verified email

When an account's email is verified (by code or by Google), attach every contact submission and every brief stored
under that same email address, in one transaction: set `account_id`, keep the original timestamps. Never attach on an
unverified email, and never by name. Show what was attached on Your briefs ("2 earlier messages and 1 brief joined
your account").

## First-project discount

- 15% off each one-time service on your first project, rounded to the dollar in your favour: each line's saving is
  `FIRST_PROJECT.percent` of it rounded up (`firstProjectPrice()`), and the one-time total and "You save" are the sums of
  the lines. A service has one first-project price, alone or in any mix. Never on monthly work; one per client.
- **Eligible** when the account (and any verified email linked to it) has no paid one-time project. Record
  `first_project_discount_used_at` when the deposit for that project is paid.
- The builder's "My first project with Marque" box stays the visitor's claim; the quote checks eligibility.

## Late-day credit

- Every one-time service is promised by day 3. Day 1 is the day the quote is approved; for a website, the day the text
  and photos are in; for photo and video, the day of the shoot. Days waiting on the client's replies or approvals pause
  the count.
- Per service on a project: `due_on`, `paused_days`, `delivered_on`. Credit = `LATE_CREDIT.perDay` ($5) for each day
  late, capped at that service's price, as a negative line on the final invoice.

## Managed hosting

- **Subdomain provisioning.** On a Managed order, create the site's project on the hosting platform, deploy from its
  repository, and give it a free Marque subdomain (`<site>.<marque-domain>`). Daily backups, and uptime monitoring with
  alerts to the studio.
- **Custom domains.** The client buys their own domain from any registrar; Marque never buys, sells or renews domains.
  Store the hostname, show the DNS records to add and verify them. Keep the subdomain as a fallback.
- **Billing.** $39 a month, billed at the start of each month, cancel any time; the site runs to the end of the paid
  month.
- **Cancel and export.** On cancel, transfer the repository to the client's account (or send an archive), with the short
  deploy guide, then take the site down at the end of the paid month and release the subdomain.
- **Handed over** sites get the same repository transfer and guide on delivery, and no hosting from Marque.

## Sample content

The studio figures on Home (projects shipped, median days to launch, share delivered by day 3, returning clients) and
the founder quotes on Home and Pricing are placeholder content for the prototype. They stand for client work, unlike
the three works, which are studio projects Marque briefed itself. They all live in `app/lib/samples.ts`, which the
build inlines at the `<!-- samples:… -->` markers in `app/index.html` and `app/pricing/index.html`. They are not real
results or real clients: replace them with real figures and quotes (with permission), or delete the markers, before
launch.

## Launch checklist

- [ ] Connect auth: Google OAuth client, email one-time codes, sessions, sign out.
- [ ] Email sending: a transactional provider with SPF, DKIM and DMARC on the sending domain; templates for the code,
      the contact receipt and newsletter confirmation.
- [ ] Form endpoints: contact and newsletter, with validation, rate limits and a honeypot.
- [ ] Briefs stored server-side, unowned local briefs uploaded after sign-in, linking by verified email.
- [ ] Replace the sample stats and testimonials with real ones (or remove them) before removing noindex or taking real
      clients. See "Sample content" above.
- [ ] Confirm the team description on the Studio page ("A small team of designers, developers and writers") against
      the people who do the work.
- [ ] Remove `noindex`: take `<meta name="robots" content="noindex" />` off every page (keep it on `app/work/`, the
      redirect, and the 404), and add a `sitemap.xml` and `robots.txt`.
- [ ] Real contact details: the studio's email address on the Privacy Policy, the Terms and the footer.
- [ ] Payments: card payments and invoices for the deposit and the final payment, the monthly billing for Managed
      hosting, social media and ads, with the first-project discount and late-day credits as invoice lines.
- [ ] Update the Terms, Privacy Policy and Cookie Policy: remove the "isn't connected yet" sections, list the session
      cookie, name the email and hosting providers.
- [ ] Remove the "Preview" labels and the not-connected messages from the sign-in page, the contact form and the
      newsletter.
