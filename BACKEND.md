# Backend plan

The site is a static front end. Sign-in, saved briefs, the contact form and the newsletter work in the browser only
and say so on the page. This is what has to exist behind them before launch, in the order it unblocks the front end.

## Accounts and sign-in

- **Two ways in, no passwords.** Google OAuth (OpenID Connect, `email` and `profile` scopes) and email one-time codes.
- **One-time codes.** Four digits, single use, valid for 10 minutes, at most 5 tries, then a new code. Store only a hash.
  Rate-limit sends per email and per IP. The email says what the code is for and that nobody from Marque will ask for it.
- **Accounts.** `id`, `email` (unique, lower-cased), `email_verified_at`, `first_name` (optional, up to 40 characters),
  `google_sub` (optional, unique), `created_at`. A Google sign-in with a verified email that matches an existing account
  signs into that account and stores `google_sub`.
- **Sessions.** An HttpOnly, Secure, SameSite=Lax cookie holding a random session id; sessions expire after 30 days of no
  use. Sign out deletes the session server-side. Update the Cookie Policy to list this cookie before it ships.
- **Front end.** `app/lib/account.ts` keeps the same `Session` shape (`firstName` may be null). Replace `demoCode()` and
  the on-screen code (`data-preview-code`) with a request to send the code, and the code check with a request to verify
  it. "Continue with Google" (`data-google` in `app/account/index.html`) starts the OAuth redirect.

## Briefs

- **Table.** `id`, `account_id` (nullable), `email` (nullable, for briefs sent before an account exists), `selection`
  (the JSON the builder already produces, see `Selection` in `app/lib/estimate.ts`), `saved_at`.
- **Validate on the server** with the same rules as `isSelection()`, and price it again with `estimate()` (share the
  module) rather than trusting totals from the browser.
- **Moving local briefs.** After sign-in, offer to upload the briefs in `localStorage` (`marque.briefs`), then clear them.
  Keep the newest 12 per account, as now.

## Contact submissions

- **Table.** `id`, `name`, `business`, `email`, `message`, `brief_id` (nullable), `created_at`, `account_id` (nullable).
- **Endpoint.** `POST /api/contact`, JSON, the same checks as `validateContact()` and `parseContact()`, a honeypot field
  and a rate limit. Email the studio inbox and send the sender a plain receipt.
- **Front end.** `app/start/contact.ts` posts instead of saying "sending isn't connected yet", and clears the form only
  after a 2xx.

## Linking by verified email

When an account's email is verified (by code or by Google), attach every contact submission and every brief stored
under that same email address, in one transaction: set `account_id`, keep the original timestamps. Never attach on an
unverified email, and never by name. Show what was attached on Your briefs ("2 earlier messages and 1 brief joined
your account").

## First-project discount

- 15% off the regular one-time prices, rounded to whole dollars per project (`firstProjectPrice()`), never on monthly
  work, one per client.
- **Eligible** when the account (and any verified email linked to it) has no paid one-time project. Record
  `first_project_discount_used_at` on the account when the deposit for that project is paid, so a second project
  can't claim it.
- The builder's "My first project with Marque" box stays as the visitor's claim; the quote checks eligibility and says
  so if it doesn't apply.

## Late-day credit

- Every one-time service is promised by day 3. Day 1 is the day the quote is approved; for a website, the day the text
  and photos are in. Days waiting on the client's replies or approvals pause the count.
- Per service on a project: `due_on`, `paused_days`, `delivered_on`. Credit = $5 × days late (`lateCredit()`), capped
  at that service's price, applied as a negative line on the final invoice.

## Managed hosting

- **Subdomain provisioning.** On a Managed order, create the site's project on the hosting platform, deploy from its
  repository, and give it a free Marque subdomain (`<site>.<marque-domain>`) with SSL. Automatic deploys from the main
  branch, daily backups, uptime monitoring with alerts to the studio.
- **Custom domains.** The client buys their own domain from any registrar; Marque never buys, sells or renews domains.
  Store the hostname, show the DNS records to add, verify them, then issue SSL. Keep the subdomain as a fallback.
- **Billing.** $39 a month, billed at the start of each month, cancel any time; the site runs to the end of the paid
  month.
- **Cancel and export.** On cancel, transfer the repository to the client's account (or send an archive), with the
  short deploy guide, then take the site down at the end of the paid month and release the subdomain.
- **Handed over** sites get the same repository transfer and guide on delivery, and no hosting from Marque.

## Newsletter

`POST /api/newsletter` with double opt-in by email and one-click unsubscribe. Store `email`, `confirmed_at`,
`unsubscribed_at`.

## Launch checklist

- [ ] Connect auth: Google OAuth client, email one-time codes, sessions, sign out.
- [ ] Email sending: a transactional provider with SPF, DKIM and DMARC on the sending domain; templates for the code,
      the contact receipt and newsletter confirmation.
- [ ] Form endpoints: contact and newsletter, with validation, rate limits and a honeypot.
- [ ] Briefs stored server-side, local briefs uploaded after sign-in, linking by verified email.
- [ ] Remove `noindex`: take `<meta name="robots" content="noindex" />` off every page (keep it on `app/work/`, the
      redirect, and the 404), and add a `sitemap.xml` and `robots.txt`.
- [ ] Real contact details: the studio's email address on the Privacy Policy, the Terms and the footer.
- [ ] Payments: card payments and invoices for the deposit and the final payment, the monthly billing for Managed
      hosting, social media and ads, with the first-project discount and late-day credits as invoice lines.
- [ ] Update the Terms, Privacy Policy and Cookie Policy: remove the "isn't connected yet" sections, list the session
      cookie, name the email and hosting providers.
- [ ] Remove the "Preview" labels and the not-connected messages from the sign-in page, the contact form and the
      newsletter.
