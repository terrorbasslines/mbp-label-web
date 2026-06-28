# The MasterBeat Project Label Website

Production-ready public label platform for **The MasterBeat Project**, including the MBP catalogue, News, demo review, artist dashboards, release agreements and separate label lanes for **The MasterBeat Horizon** and **Section 7**.

Built with Astro, TypeScript and Tailwind CSS for Cloudflare Pages. The public frontend is static; admin, catalogue APIs, demo submissions, agreement review and News workflows run through Cloudflare Pages Functions with D1.

Current PageSpeed target status after the latest optimization pass: `100` performance, `100` accessibility, `100` best practices and `100` SEO on the tested homepage mobile and desktop report.

## Stack

- Astro + TypeScript
- Tailwind CSS
- Cloudflare Pages static output
- Cloudflare Pages Functions for admin, catalogue and demo submissions
- Cloudflare D1 for catalogue, demo and account metadata
- Cloudflare R2 for private demo upload files
- Resend-compatible outbound email for demo decisions, artist invites, agreements and News notifications

## Local Setup

```bash
npm install
npm run dev
```

Open the local URL printed by Astro.

## Build

```bash
npm run build
npm run preview
```

The production output is generated in `dist/`.

If this machine has Node but no global npm, this project was also tested with a portable npm unpacked into `.tools/npm`:

```powershell
$env:PATH="C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;$env:PATH"
& "C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" ".tools\npm\bin\npm-cli.js" install --cache ".tools\npm-cache" --prefer-online
& "C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" ".tools\npm\bin\npm-cli.js" run build
```

## Cloudflare Pages Deployment

Cloudflare Pages settings:

- Build command: `npm run build`
- Build output directory: `dist`
- Production branch: `main`
- Root directory: leave empty if this folder is the repository root; set `mbp-label-web` if deploying from a parent workspace.

CLI deployment:

```bash
npm run cf:deploy
```

GitHub deployment:

```bash
git add functions src public scripts migrations package.json README.md
git commit -m "Update site documentation"
git push origin main
```

Cloudflare Pages is expected to deploy automatically from the `main` branch.

Manual drag-and-drop deployment:

1. Run `npm run build`.
2. Upload only the generated `dist/` folder or a ZIP created from the contents of `dist/`.
3. Do not upload the project source folder, because Astro requires a build step.

Direct upload is static only. Use Git deployment or Wrangler so the `functions/` API routes run on Cloudflare Pages.

## Backend/API Surface

Implemented endpoint areas:

- `POST /api/demo-submission`
- `/admin`
- `/api/admin/*`
- `/api/catalog`
- `/admin/release-calendar`
- `/api/admin/calendar-import`
- `/news`
- `/api/news`
- `/api/admin/news`
- `/claim-artist`
- `/artist-dashboard`
- `/api/auth/claim`
- `/api/artist/profile`
- `/agreement-review`
- `/api/admin/agreements`
- `/api/agreement-review/*`

Planned Cloudflare resources:

- D1 binding: `DB`
- Environment secret: `ADMIN_PASSWORD`
- Environment secret: `SESSION_SECRET`
- Optional email secret: `RESEND_API_KEY`
- Optional email variable: `DEMO_FROM_EMAIL`
- Optional email variable: `DEMO_REPLY_TO_EMAIL`
- R2 binding: `DEMO_BUCKET`

Current status:

- Admin login and CRUD API are implemented through Cloudflare Pages Functions.
- Frontend demo validation and D1 submission storage are implemented.
- Optional demo file uploads are stored privately in Cloudflare R2 when `DEMO_BUCKET` is bound.
- Demo approval/rejection is implemented in admin. Email sending is active only when Resend env variables are configured.
- Artist claim invitations and artist profile editing are implemented with email/password login. Google OAuth can be added after OAuth credentials are created.
- News articles are implemented with admin publishing, public article pages, generated Open Graph and Instagram assets, artist reactions, artist comments and account email notifications.
- Release calendar import is implemented from admin with MBP, MBH and S7 label separation.
- Agreement workflow is implemented for approved demos and calendar slots with artist review tokens and signature capture.
- MBH and Section 7 have separate public label pages, catalogues, artist lists and smartlink import logic.

## D1 Setup

Create a D1 database:

```bash
npx wrangler d1 create mbp_label_web
```

Copy the returned `database_id` into `wrangler.toml`, then uncomment the `[[d1_databases]]` block:

```toml
[[d1_databases]]
binding = "DB"
database_name = "mbp_label_web"
database_id = "your-database-id"
```

Apply migrations:

```bash
npx wrangler d1 migrations apply mbp_label_web --remote
```

If Cloudflare dashboard migration was used manually before, apply the News schema and default News categories directly:

```bash
npx wrangler d1 execute mbp_label_web --remote --file=./migrations/0011_news_articles.sql
npx wrangler d1 execute mbp_label_web --remote --file=./migrations/0012_news_editor_seo_categories.sql
npx wrangler d1 execute mbp_label_web --remote --file=./migrations/0013_news_categories_and_draft_seed.sql
```

In Cloudflare Pages dashboard, confirm the binding:

- Settings > Bindings
- Add D1 database binding
- Variable name: `DB`
- D1 database: `mbp_label_web`

Redeploy after adding the binding.

## Admin Setup

Add these Cloudflare Pages production secrets/variables:

```text
ADMIN_PASSWORD=choose-a-strong-password
SESSION_SECRET=generate-a-long-random-secret
```

For demo decision emails:

```text
RESEND_API_KEY=re_xxxxx
DEMO_FROM_EMAIL=The MasterBeat Project <demos@themasterbeatproject.com>
DEMO_REPLY_TO_EMAIL=demos@themasterbeatproject.com
```

The same Resend configuration is used for artist claim invite emails. If these values are missing, admin actions still save decisions and generate claim links, but the dashboard will show a specific email status such as `email_missing_resend_api_key`, `email_placeholder_resend_api_key` or `email_missing_from_email` and no outbound email will be sent.

If the dashboard shows `email_failed_401_check_resend_api_key`, replace `RESEND_API_KEY` in Cloudflare Pages with a real active Resend API key. A placeholder such as `re_xxxxx` is treated as not configured. If it shows `email_failed_403_check_sender_domain`, verify the sender domain/address in Resend before sending from `demos@themasterbeatproject.com`.

Then open:

```text
https://themasterbeatproject.com/admin
```

Use the admin dashboard to:

- import FFM smartlinks in batches, for example `1` to `25`
- import MBP, MBH and Section 7 catalogue ranges
- add artists and profiles
- add releases and playable platform links
- import release calendar rows and filter calendar slots by label
- publish News articles with generated Open Graph, Instagram post and Instagram story thumbnails
- create artist claim links with artist or admin role
- approve or reject demos with a reason
- create release agreements after demo approval and slot selection

Artist claim flow:

1. Open `/admin`.
2. In the artist list, enter the artist email and create an invite.
3. Send the generated `/claim-artist?token=...` link to the artist.
4. The artist creates an account and edits their profile at `/artist-dashboard`.

## FFM Catalogue Import

The admin can import FFM smartlinks in batches.

Supported catalogue patterns:

- MBP base releases: `https://ffm.to/mbp001`
- MBP remixes: `https://ffm.to/mbp001r`
- MBH base releases: `https://ffm.to/mbh001`
- MBH single remix: `https://ffm.to/mbh001r`
- MBH multi-remix slots: `https://ffm.to/mbh001-r1` through `https://ffm.to/mbh001-r10`
- Section 7 base releases: `https://ffm.to/s7-001`
- Section 7 remixes: `https://ffm.to/s7-001r` and `https://ffm.to/s7-001-r1` through `https://ffm.to/s7-001-r10`

Local helper:

```bash
npm run import:ffm
```

This writes `data/ffm-catalog.json` locally. The generated JSON is ignored by Git because it is an import artifact, not source code.

Refresh existing remote D1 artwork URLs from FFM original cover images:

```bash
npm run refresh:ffm-artwork -- --from=1 --to=241
```

The refresh helper prefers the real FFM cover image (`imagestore.ffm.to`) instead of the horizontal social share image (`og:image`), so release artwork stays square in the public catalogue.

## Cache Notes

The public catalogue is loaded dynamically and most `/api/*` responses are sent with `Cache-Control: no-store`. Static HTML uses `Cache-Control: public, max-age=0, must-revalidate`, while Astro output and optimized static assets are served as immutable.

Performance notes:

- Homepage and label heroes use generated AVIF/WebP responsive images.
- Navigation logo uses small generated assets instead of the full-resolution brand PNG.
- Google Analytics is delayed until interaction or late idle fallback.
- Below-the-fold catalogue, News and management sections lazy-load their API data.
- `npm run optimize:assets` regenerates optimized image variants from source PNG files.

## Environment Notes

Create local secrets in `.dev.vars` when testing the backend locally:

```text
ADMIN_PASSWORD=local-password
SESSION_SECRET=local-long-random-secret
RESEND_API_KEY=re_xxxxx
DEMO_FROM_EMAIL=The MasterBeat Project <demos@themasterbeatproject.com>
DEMO_REPLY_TO_EMAIL=demos@themasterbeatproject.com
```

When D1 and R2 resources exist, add the bindings in Cloudflare Pages settings or uncomment and complete the examples in `wrangler.toml`.

## Project Structure

```text
public/
  assets/brand/          Brand images used by the site
  assets/labels/         MBH and Section 7 brand images
migrations/              Cloudflare D1 schema
functions/api/           Cloudflare Pages Functions
scripts/                 Local import and asset optimization helpers
src/components/          Reusable Astro UI components
src/data/                Static site content and typed data
src/layouts/             Base page layout
src/pages/               Public routes
src/styles/              Tailwind and global design tokens
```

## Pages

- Home
- Releases
- Artists
- Labels
- The MasterBeat Horizon
- Section 7
- Demo Submission
- About
- Contact
- Privacy Policy
- Admin
- Admin Release Calendar
- Agreement Review

## Remaining TODO

- Confirm final public social URLs and contact mailboxes.
- Keep release artwork refreshed from FFM when new catalogue numbers are imported.
- Configure a verified outbound email provider domain so demo responses and claim invites avoid spam.
- Proxy or store third-party FFM artwork thumbnails through Cloudflare/R2 for even tighter long-term performance control.
