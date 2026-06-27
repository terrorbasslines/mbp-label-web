import type { Env } from "./api/_shared";

export const SITE_URL = "https://themasterbeatproject.com";
export const SITE_NAME = "The MasterBeat Project";
export const SITE_DESCRIPTION =
  "The MasterBeat Project is a hardstyle, hard dance and electronic music label releasing high-energy tracks, artist profiles and official MBP catalogue links.";
export const DEFAULT_IMAGE = `${SITE_URL}/assets/brand/stage-hero.png`;
export const LOGO_IMAGE = `${SITE_URL}/assets/brand/logo-official-purple.png`;

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function absoluteUrl(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) return SITE_URL;
  try {
    return new URL(pathOrUrl, SITE_URL).toString();
  } catch {
    return SITE_URL;
  }
}

export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function htmlResponse(html: string, init: ResponseInit = {}) {
  return new Response(html, {
    ...init,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "public, max-age=300",
      ...(init.headers ?? {})
    }
  });
}

export function notFoundPage(title = "Page not found") {
  return htmlResponse(
    pageShell({
      title,
      description: "The requested The MasterBeat Project page was not found.",
      canonicalPath: "/404",
      noindex: true,
      content: `
        <section class="hero">
          <p class="eyebrow">404</p>
          <h1>Page not found</h1>
          <p>The page is not available. Return to the official MBP catalogue or artist roster.</p>
          <div class="actions">
            <a href="/releases/">Releases</a>
            <a href="/artists/">Artists</a>
          </div>
        </section>
      `
    }),
    { status: 404 }
  );
}

export function pageShell(input: {
  title: string;
  description: string;
  canonicalPath: string;
  image?: string | null;
  ogType?: string;
  noindex?: boolean;
  jsonLd?: unknown[];
  content: string;
}) {
  const canonical = absoluteUrl(input.canonicalPath);
  const image = absoluteUrl(input.image || DEFAULT_IMAGE);
  const title = `${input.title} | ${SITE_NAME}`;
  const robots = input.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large";
  const path = input.canonicalPath.replace(/\/$/, "") || "/";
  const navItems = [
    { href: "/", label: "Home", active: path === "/" },
    { href: "/news/", label: "News", active: path === "/news" || path.startsWith("/news/") },
    { href: "/releases/", label: "Releases", active: path === "/releases" || path.startsWith("/release/") },
    { href: "/artists/", label: "Artists", active: path === "/artists" || path.startsWith("/artist/") },
    { href: "/demo-submission/", label: "Demo Submission", active: path === "/demo-submission" },
    { href: "/about/", label: "About", active: path === "/about" },
    { href: "/contact/", label: "Contact", active: path === "/contact" }
  ];
  const labelNavItems = [
    { href: "/horizon/", label: "MBH", active: path === "/horizon" },
    { href: "/section7/", label: "Section 7", active: path === "/section7" }
  ];
  const labelsActive = labelNavItems.some((item) => item.active);
  const labelNavMarkup = `<span class="labels-menu"><span class="labels-trigger ${labelsActive ? "active" : ""}" tabindex="0">Labels</span><span class="labels-panel">${labelNavItems
    .map((item) => `<a class="${item.active ? "active" : ""}" href="${item.href}">${item.label}</a>`)
    .join("")}</span></span>`;
  const navMarkup = navItems
    .map((item) => {
      const link = `<a class="${item.active ? "active" : ""}" href="${item.href}">${item.label}</a>`;
      return item.label === "Releases" ? `${link}${labelNavMarkup}` : link;
    })
    .join("");
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: LOGO_IMAGE,
      image: DEFAULT_IMAGE,
      description: SITE_DESCRIPTION,
      sameAs: ["https://linktr.ee/themasterbeatproject", "https://soundcloud.com/the-masterbeat-project"]
    },
    ...(input.jsonLd ?? [])
  ];

  return `<!doctype html>
<html lang="en">
  <head>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P3CVW360V0"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-P3CVW360V0');
    </script>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(input.description)}" />
    <meta name="robots" content="${robots}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <link rel="icon" type="image/png" href="/assets/brand/logo-official-purple.png" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:type" content="${escapeHtml(input.ogType || "website")}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(input.description)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(input.title)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(input.description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(input.title)}" />
    ${jsonLd.map((item) => `<script type="application/ld+json">${safeJsonLd(item)}</script>`).join("\n    ")}
    <style>
      :root{color-scheme:dark;--bg:#050508;--panel:#11121a;--line:rgba(255,255,255,.12);--text:#fff;--muted:#b8bdd1;--cyan:#22f7ff;--violet:#8f35ff}
      *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 12% 0%,rgba(143,53,255,.2),transparent 34%),var(--bg);color:var(--text);font-family:Inter,Arial,sans-serif}
      a{color:inherit}.wrap{width:min(1280px,calc(100% - 40px));margin:0 auto}.top{border-bottom:1px solid var(--line);background:rgba(5,5,8,.82);position:sticky;top:0;backdrop-filter:blur(16px);z-index:10}.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:12px 0}.brand{display:flex;align-items:center;gap:12px;text-decoration:none}.brand .mark{display:grid;width:44px;height:44px;place-items:center;overflow:hidden;border:1px solid var(--line);border-radius:6px;background:#000}.brand img{width:40px;height:40px;object-fit:cover}.brand strong{display:block;font-size:18px;line-height:1;font-weight:1000;text-transform:uppercase;letter-spacing:0}.brand .sub{display:block;margin-top:5px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.28em;color:#8f94a8}.nav{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.nav a,.labels-trigger{border-radius:6px;padding:10px 12px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;text-decoration:none;color:#d6d8e2}.nav a:hover,.labels-trigger:hover{background:rgba(255,255,255,.1);color:#fff}.nav a.active,.labels-trigger.active{background:#fff;color:#000}.labels-menu{position:relative;display:inline-block}.labels-trigger{display:inline-block;cursor:default}.labels-panel{display:none;position:absolute;right:0;top:100%;z-index:20;margin-top:8px;min-width:170px;border:1px solid var(--line);border-radius:6px;background:rgba(17,18,26,.98);padding:8px;box-shadow:0 20px 40px rgba(0,0,0,.45)}.labels-menu:hover .labels-panel,.labels-menu:focus-within .labels-panel{display:grid;gap:4px}.contents{display:contents}
      .hero{padding:82px 0 52px}.eyebrow{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.22em;color:var(--cyan)}h1{margin:14px 0 0;font-size:clamp(42px,8vw,86px);line-height:.88;text-transform:uppercase;letter-spacing:0;font-weight:1000}p{color:var(--muted);line-height:1.7}.grid{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:32px;padding-bottom:72px}.art{width:100%;border:1px solid var(--line);border-radius:8px;background:#000;object-fit:cover;aspect-ratio:1}.card{border:1px solid var(--line);border-radius:8px;background:rgba(17,18,26,.82);padding:24px}.meta{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}.pill{border:1px solid var(--line);border-radius:6px;padding:8px 10px;color:var(--cyan);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}.links{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.links a,.actions a{border:1px solid var(--line);border-radius:6px;padding:10px 13px;text-decoration:none;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.1em}.links a:hover,.actions a:hover{border-color:var(--cyan);color:var(--cyan)}.list{display:grid;gap:12px;margin-top:20px}.list a{display:block;border:1px solid var(--line);border-radius:6px;padding:14px;text-decoration:none;background:rgba(255,255,255,.03)}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px}.footer{border-top:1px solid var(--line);padding:30px 0;color:var(--muted);font-size:13px}
      @media (max-width: 760px){.top .wrap,.grid{display:block}.nav{margin-top:14px}.grid{padding-bottom:48px}.card{margin-top:18px}}
    </style>
  </head>
  <body>
    <header class="top"><div class="wrap"><a class="brand" href="/" aria-label="${SITE_NAME} home"><span class="mark"><img src="/assets/brand/logo-official-purple.png" alt="" /></span><span><strong>The MasterBeat</strong><span class="sub">Project</span></span></a><nav class="nav" aria-label="Primary navigation">${navMarkup}<span class="contents" data-auth-nav><a class="${path === "/artist-dashboard" ? "active" : ""}" href="/artist-dashboard/" data-nav-login>Login</a><a class="${path === "/artist-dashboard" ? "active" : ""}" href="/artist-dashboard/" data-nav-dashboard hidden>Artist Dashboard</a><a class="${path === "/admin" ? "active" : ""}" href="/admin/" data-nav-admin hidden>Admin</a></span></nav></div></header>
    <main class="wrap">${input.content}</main>
    <footer class="footer"><div class="wrap">${SITE_NAME} - Hardstyle, hard dance and electronic music label.</div></footer>
    <script>
      (function () {
        var authNav = document.querySelector("[data-auth-nav]");
        var loginLink = authNav && authNav.querySelector("[data-nav-login]");
        var dashboardLink = authNav && authNav.querySelector("[data-nav-dashboard]");
        var adminLink = authNav && authNav.querySelector("[data-nav-admin]");
        function applyAuthNav(data) {
          var authenticated = Boolean(data && (data.authenticated || data.role));
          var role = (data && data.session && data.session.role) || (data && data.role);
          if (loginLink) loginLink.hidden = authenticated;
          if (dashboardLink) dashboardLink.hidden = !authenticated;
          if (adminLink) adminLink.hidden = !(authenticated && role === "admin");
        }
        fetch("/api/auth/me", { cache: "no-store", headers: { "cache-control": "no-cache" } })
          .then(function (response) { return response.json(); })
          .then(applyAuthNav)
          .catch(function () {});
      })();
    </script>
  </body>
</html>`;
}

export function dbMissing(env: Env) {
  return !env.DB;
}
