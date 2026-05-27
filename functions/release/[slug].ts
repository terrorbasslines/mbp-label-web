import type { Env } from "../api/_shared";
import { absoluteUrl, escapeHtml, htmlResponse, notFoundPage, pageShell, SITE_NAME, SITE_URL } from "../_seo";

type ReleaseRow = {
  id: string;
  slug: string;
  catalog_number: string;
  title: string;
  artist_display: string;
  primary_artist_id?: string | null;
  release_date?: string | null;
  release_type?: string | null;
  genre?: string | null;
  artwork_url?: string | null;
  ffm_url?: string | null;
  presave_url?: string | null;
  status?: string | null;
  description?: string | null;
};

type PlatformLinkRow = {
  platform: string;
  label: string;
  url: string;
  sort_order: number;
};

type ArtistRow = {
  id: string;
  slug: string;
  name: string;
};

type ArtistReleaseRow = {
  slug: string;
  catalog_number: string;
  title: string;
};

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  if (!env.DB) return notFoundPage("Release not available");

  const slug = String(params.slug ?? "").toLowerCase();
  const release = await env.DB.prepare(
    "SELECT * FROM releases WHERE slug = ? AND status IN ('published', 'presave') LIMIT 1"
  )
    .bind(slug)
    .first<ReleaseRow>();

  if (!release) return notFoundPage("Release not found");

  const links = await env.DB.prepare(
    "SELECT platform, label, url, sort_order FROM release_platform_links WHERE release_id = ? ORDER BY sort_order ASC"
  )
    .bind(release.id)
    .all<PlatformLinkRow>();

  const artist = release.primary_artist_id
    ? await env.DB.prepare("SELECT id, slug, name FROM artists WHERE id = ? LIMIT 1").bind(release.primary_artist_id).first<ArtistRow>()
    : null;

  const artistReleases = artist
    ? await env.DB.prepare(
        `SELECT r.slug, r.catalog_number, r.title
         FROM releases r
         INNER JOIN release_artists ra ON ra.release_id = r.id
         WHERE ra.artist_id = ? AND r.status IN ('published', 'presave')
         ORDER BY r.catalog_number DESC
         LIMIT 12`
      )
        .bind(artist.id)
        .all<ArtistReleaseRow>()
    : { results: [] as ArtistReleaseRow[] };

  const platformLinks = links.results ?? [];
  const isPresave = release.status === "presave" || platformLinks.length === 0;
  const canonicalPath = `/release/${release.slug}`;
  const description =
    release.description ||
    `${release.artist_display} - ${release.title} is an official ${SITE_NAME} ${release.catalog_number} release in the hardstyle, hard dance and electronic music catalogue.`;
  const image = release.artwork_url || "/assets/brand/stage-hero.png";
  const title = `${release.artist_display} - ${release.title} (${release.catalog_number})`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "MusicRelease",
      "@id": `${SITE_URL}${canonicalPath}#release`,
      name: `${release.artist_display} - ${release.title}`,
      url: `${SITE_URL}${canonicalPath}`,
      image: absoluteUrl(image),
      description,
      catalogNumber: release.catalog_number,
      genre: release.genre || "Hardstyle, hard dance, electronic music",
      byArtist: {
        "@type": "MusicGroup",
        name: release.artist_display
      },
      recordLabel: {
        "@id": `${SITE_URL}/#organization`
      },
      sameAs: platformLinks.map((link) => link.url)
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Releases", item: `${SITE_URL}/releases` },
        { "@type": "ListItem", position: 3, name: release.title, item: `${SITE_URL}${canonicalPath}` }
      ]
    }
  ];

  return htmlResponse(
    pageShell({
      title,
      description,
      canonicalPath,
      image,
      ogType: "music.song",
      jsonLd,
      content: `
        <section class="hero">
          <p class="eyebrow">Official release</p>
          <h1>${escapeHtml(release.title)}</h1>
          <p>${escapeHtml(release.artist_display)}</p>
          <div class="meta">
            <span class="pill">${escapeHtml(release.catalog_number)}</span>
            <span class="pill">${isPresave ? "Pre-save" : escapeHtml(release.status || "published")}</span>
            ${release.genre ? `<span class="pill">${escapeHtml(release.genre)}</span>` : ""}
          </div>
        </section>
        <section class="grid">
          <div>
            <img class="art" src="${escapeHtml(absoluteUrl(image))}" alt="${escapeHtml(release.title)} artwork" />
          </div>
          <article class="card">
            <p>${escapeHtml(isPresave ? "Pre-save is open. Platform links update from FFM when the release goes live." : description)}</p>
            <div class="links">
              ${platformLinks
                .map(
                  (link) =>
                    `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label || link.platform)}</a>`
                )
                .join("")}
              ${release.ffm_url ? `<a href="${escapeHtml(release.ffm_url)}" target="_blank" rel="noreferrer">${isPresave ? "Pre-save" : "Smart Link"}</a>` : ""}
            </div>
            ${
              artist
                ? `<h2>More from ${escapeHtml(artist.name)}</h2>
                  <div class="list">
                    ${(artistReleases.results ?? [])
                      .map(
                        (item) =>
                          `<a href="/release/${escapeHtml(item.slug)}"><strong>${escapeHtml(item.catalog_number)}</strong> - ${escapeHtml(item.title)}</a>`
                      )
                      .join("")}
                  </div>`
                : ""
            }
            <div class="actions">
              <a href="/releases">All releases</a>
              ${artist ? `<a href="/artist/${escapeHtml(artist.slug)}">All releases by ${escapeHtml(artist.name)}</a>` : `<a href="/artists">Artists</a>`}
            </div>
          </article>
        </section>
      `
    })
  );
};
