# Marque

Marque is a small brand and website studio for founders starting or running a business, wherever they are. It designs
identities, builds websites, hosts them if you like, and runs social media and ads. This is its website: every service
with its price, a project builder that adds those prices up into a brief, the three projects it made, and a sign-in
where saved briefs wait.

![Marque's home page on a desktop, above the thumbnails of Usual, Bayline and Enamel.](docs/screenshots/cover.png)

![The project builder on a desktop: brand identity and a six-page website ticked, with the estimate beside them.](docs/screenshots/desktop.png)

<p>
  <img src="docs/screenshots/phone-builder.png" width="150" alt="The project builder on a phone, with the running totals in a bar at the bottom.">
  <img src="docs/screenshots/phone-work.png" width="150" alt="Usual’s project page on a phone: its mark, the line, the stamp card and what Marque made.">
</p>

## Pages

- **Home** (`/marque/`): the studio in one line, the three projects, the launch set (identity and a six-page website,
  $1,080, or $918 as a first project, ready in 1 to 3 days, then $39 a month if the studio hosts the site) with what
  Managed hosting includes, what you can count on, services with their regular and first-project prices, how a project
  runs, monthly work after launch, and a closing call to start a project.
- **Works** (`/marque/works/`): the three projects, sortable by newest, oldest or name (a radio group that announces the
  new order; without JavaScript the list stays newest first). Each card has the project's thumbnail, mark, type, what
  Marque made and the launch date.
- **Usual**, **Bayline** and **Enamel** (`/marque/works/usual/` and so on): one page each, led by the project's own colour
  and mark: the brief, what the studio did and made, the timeline, desktop and phone screens, a link to the live site,
  and the previous and next project. All three are Marque's own studio projects, and say so.
- **Services** (`/marque/services/`): the six services with their price, first-project price, time and the late-day
  credit, what's included and what isn't (for the website, Managed hosting or a handover of the code), how the prices
  work, and the FAQ.
- **Studio** (`/marque/studio/`): who works there (by role), what they hold to, the five steps of a project with the
  days they take, where and when, and what the studio doesn't do. The footer's "About".
- **Start a project** (`/marque/start/`): the project builder and the contact form. The footer's "Contact".
- **Sign in** (`/marque/account/`): Continue with Google or an email and a one-time code, with Create account a link
  away (`#create`); signed in, it lists the saved briefs.
- **Terms of Service**, **Privacy Policy**, **Cookie Policy** and **Accessibility**, linked from the footer, and a 404.
  The old `/marque/work/` address redirects to Works (and `/work/#usual` to Usual's page).

## What you can do

- Price a project: tick services, set pages, platforms, posts, shoots and print pieces, choose whether the website is
  managed or handed over, and watch the one-time total, the monthly total and the timeline change. Every one-time
  service is ready in 1 to 3 days (a website's days start once the text and photos are in); if the studio delivers after
  day 3, $5 comes off for each day late, up to the price of that service. Brand identity is $390; a website $690 for up
  to six pages plus $60 a page after that, up to twelve. Managed hosting is $39 a month, which is where a website starts
  when ticked: a free Marque subdomain or the client's own domain, SSL, a CDN, deploys, backups, monitoring, updates,
  SEO setup and up to an hour of edits a month, cancellable any time. Handed over has no monthly fee: the code and a
  deploy guide, with hosting left to the client. Domains are never sold. Social media is from $290 a month (one
  platform, which is where it starts when ticked; two are $390); ads $250 a month plus ad spend paid to the platforms; a
  half-day shoot with a booked local photographer $290; a print piece $90.
- Keep "My first project with Marque" ticked (it starts ticked) for 15% off the one-time work, rounded to whole dollars
  ($690 is $587); monthly work is never discounted. The discount shows as its own line in the estimate, the brief and
  saved briefs. Briefs saved before the discount existed open without it.
- Press "Use this brief" to drop the priced brief into the contact form's message. The form checks each field, then says
  plainly that sending isn't connected yet, keeps what you typed, and points to "Save brief".
- Press "Save brief" to keep it on this device (pressing it again for the same brief says it's already saved, and at
  twelve briefs the oldest makes room), then sign in. Signing in with email shows the four-digit code on the page,
  labelled as a preview until emails are sent; Create account also asks for a first name. Continue with Google says it
  isn't connected yet. There is no password. Your briefs list each saved brief with its lines, totals and timeline;
  open one back in the builder or remove it.
- Follow "Price the launch set" on Home or "Add to a brief" on any service to open the builder with those services
  already picked.
- Sort the works and open each project's page and its live site.

## What's real, and what isn't connected yet

Marque presents itself as a working studio. The site names no author; this README may. The builder, the contact form,
the newsletter and the sign-in run in the browser only, and each says so where it matters: the sign-in and the saved
briefs live in localStorage (`marque.account`, `marque.briefs`), behind try/catch, so the site works with storage
blocked. There are no server accounts, analytics, cookies or payments yet, and every page carries `noindex` until the
backend is live. [BACKEND.md](BACKEND.md) is the plan for what comes next, with the launch checklist.

The three projects on Works, Usual, Bayline and Enamel, are Marque's own studio projects: briefs the studio set itself,
made end to end, with no client results claimed.

## Design

Marque's design system, "Margin", uses paper, ink and graphite with no accent colour,
so the screenshots of the work bring the only colour; Bricolage Grotesque as the only family; a visible 12-column grid
with section numbers in the margin; square corners and fine rules; short, precise motion. It was shaped by reading the
published design notes of Vercel, Apple, Stripe and Framer.

## License

The code is released under the [MIT License](LICENSE). Bricolage Grotesque is under the SIL Open Font License 1.1;
Phosphor icons and Tailwind CSS are MIT. The screenshots are of the studio's own sites.

Running it locally or changing it? See [DEVELOPMENT.md](DEVELOPMENT.md).
