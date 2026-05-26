# The MasterBeat Project Label Website

Production-ready first version of the public label website for **The MasterBeat Project**.

Built with Astro, TypeScript and Tailwind CSS for Cloudflare Pages. The frontend is static and deployable now; the demo submission API is scaffolded for future Cloudflare Pages Functions, D1 metadata storage and R2 file uploads.

## Stack

- Astro + TypeScript
- Tailwind CSS
- Cloudflare Pages static output
- Cloudflare Pages Functions placeholder at `/api/demo-submission`

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

Direct upload is static only. Use Git deployment or Wrangler when the future `functions/api/demo-submission.ts` backend should run on Cloudflare Pages.

## Backend Plan

Planned endpoint:

- `POST /api/demo-submission`

Planned Cloudflare resources:

- D1 binding: `DB`
- R2 binding: `DEMO_BUCKET`
- Environment variable: `DEMO_NOTIFICATION_EMAIL`

Current status:

- Frontend validation is implemented.
- File upload is intentionally disabled until R2 is connected.
- The Pages Function returns `501` and contains TODO comments for production implementation.

## Environment Notes

Create local secrets in `.dev.vars` when the backend is implemented:

```text
DEMO_NOTIFICATION_EMAIL=demos@themasterbeatproject.com
```

When D1 and R2 resources exist, add the bindings in Cloudflare Pages settings or uncomment and complete the examples in `wrangler.toml`.

## Project Structure

```text
public/
  assets/brand/          Brand images used by the site
functions/api/           Future Cloudflare Pages Functions
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

## Remaining TODO

- Confirm final public social URLs and contact mailboxes.
- Connect `/api/demo-submission` to D1 and R2.
- Add notification email provider or Cloudflare email workflow.
- Replace static release and artist data with a CMS, D1-backed admin tool or repository-managed content when the catalogue grows.
# mbp-label-web
