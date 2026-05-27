# The MasterBeat Project Label Website

Production-ready first version of the public label website for **The MasterBeat Project**.

Built with Astro, TypeScript and Tailwind CSS for Cloudflare Pages. The public frontend is static; admin, catalogue APIs and demo submissions run through Cloudflare Pages Functions with D1.

## Stack

- Astro + TypeScript
- Tailwind CSS
- Cloudflare Pages static output
- Cloudflare Pages Functions for admin, catalogue and demo submissions
- Cloudflare D1 for catalogue, demo and account metadata
- Cloudflare R2 for private demo upload files

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

Manual drag-and-drop deployment:

1. Run `npm run build`.
2. Upload only the generated `dist/` folder or a ZIP created from the contents of `dist/`.
3. Do not upload the project source folder, because Astro requires a build step.

Direct upload is static only. Use Git deployment or Wrangler so the `functions/` API routes run on Cloudflare Pages.

## Backend Plan

Planned endpoint:

- `POST /api/demo-submission`
- `/admin`
- `/api/admin/*`
- `/api/catalog`
- `/claim-artist`
- `/artist-dashboard`
- `/api/auth/claim`
- `/api/artist/profile`

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

The same Resend configuration is used for artist claim invite emails. If these values are missing, admin actions still save decisions and generate claim links, but the dashboard will show `email_not_configured` and no outbound email will be sent.

If the dashboard shows `email_failed_401_check_resend_api_key`, replace `RESEND_API_KEY` in Cloudflare Pages with a real active Resend API key. A placeholder such as `re_xxxxx` is treated as not configured. If it shows `email_failed_403_check_sender_domain`, verify the sender domain/address in Resend before sending from `demos@themasterbeatproject.com`.

Then open:

```text
https://themasterbeatproject.com/admin
```

Use the admin dashboard to:

- import FFM smartlinks in batches, for example `1` to `25`
- add artists and profiles
- add releases and playable platform links
- create artist claim links with artist or admin role
- approve or reject demos with a reason

Artist claim flow:

1. Open `/admin`.
2. In the artist list, enter the artist email and create an invite.
3. Send the generated `/claim-artist?token=...` link to the artist.
4. The artist creates an account and edits their profile at `/artist-dashboard`.

## FFM Catalogue Import

The admin can import `https://ffm.to/mbp001` style links in batches of 25. As checked on May 27, 2026, the current live FFM range is `MBP001` through `MBP185`; `MBP186` through `MBP200` returned 404.

Local helper:

```bash
npm run import:ffm
```

This writes `data/ffm-catalog.json` locally. The generated JSON is ignored by Git because it is an import artifact, not source code.

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
migrations/              Cloudflare D1 schema
functions/api/           Cloudflare Pages Functions
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
- Demo Submission
- About
- Contact
- Privacy Policy
- Admin

## Remaining TODO

- Confirm final public social URLs and contact mailboxes.
- Connect future direct file uploads to R2.
- Configure Resend or another email provider for production demo response emails.
