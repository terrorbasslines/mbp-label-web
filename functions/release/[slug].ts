import type { Env } from "../api/_shared";
import { parseArtistCredits, syncReleaseArtistCredits } from "../api/_shared";
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
  role?: string;
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

  if (/[&,]|feat\.?|ft\.?|featuring/i.test(release.artist_display)) {
    const credits = await syncReleaseArtistCredits(env.DB, release.id, release.artist_display, null, release.ffm_url ?? null);
    await env.DB.prepare("UPDATE releases SET primary_artist_id = ? WHERE id = ?").bind(credits.primaryArtistId, release.id).run();
    release.primary_artist_id = credits.primaryArtistId;
  }

  const linkedArtists = await env.DB.prepare(
    `SELECT DISTINCT a.id, a.slug, a.name, ra.role
     FROM release_artists ra
     INNER JOIN artists a ON a.id = ra.artist_id
     WHERE ra.release_id = ?
     ORDER BY CASE ra.role WHEN 'primary' THEN 0 WHEN 'collaborator' THEN 1 WHEN 'featured' THEN 2 ELSE 3 END, a.name ASC`
  )
    .bind(release.id)
    .all<ArtistRow>();

  let artists = linkedArtists.results ?? [];
  if (artists.length === 0) {
    const fallbackArtists: ArtistRow[] = [];
    for (const credit of parseArtistCredits(release.artist_display)) {
      const artist = await env.DB.prepare("SELECT id, slug, name FROM artists WHERE lower(name) = lower(?) LIMIT 1").bind(credit.name).first<ArtistRow>();
      if (artist) fallbackArtists.push({ ...artist, role: credit.role });
    }
    artists = fallbackArtists;
  }

  const artistReleaseSections = await Promise.all(
    artists.map(async (artist) => {
      const artistReleases = await env.DB!.prepare(
        `SELECT DISTINCT r.slug, r.catalog_number, r.title
         FROM releases r
         LEFT JOIN release_artists ra ON ra.release_id = r.id
         WHERE (ra.artist_id = ?
           OR lower(r.artist_display) = lower(?)
           OR lower(r.artist_display) LIKE lower(?)
           OR lower(r.artist_display) LIKE lower(?)
           OR lower(r.artist_display) LIKE lower(?)
           OR lower(r.artist_display) LIKE lower(?)
           OR lower(r.artist_display) LIKE lower(?)
           OR lower(r.artist_display) LIKE lower(?)
           OR lower(r.artist_display) LIKE lower(?)
           OR lower(r.artist_display) LIKE lower(?)
           OR lower(r.artist_display) LIKE lower(?))
           AND r.status IN ('published', 'presave')
         ORDER BY r.catalog_number DESC
         LIMIT 12`
      )
        .bind(
          artist.id,
          artist.name,
          `${artist.name} & %`,
          `% & ${artist.name} & %`,
          `% & ${artist.name}`,
          `${artist.name}, %`,
          `%, ${artist.name}, %`,
          `%, ${artist.name}`,
          `% feat. ${artist.name}%`,
          `% ft. ${artist.name}%`,
          `% featuring ${artist.name}%`
        )
        .all<ArtistReleaseRow>();

      return { artist, releases: artistReleases.results ?? [] };
    })
  );

  const platformLinks = links.results ?? [];
  const playablePlatformLinks = platformLinks.filter((link) => !/email|subscribe/i.test(`${link.platform} ${link.label}`));
  const isPresave = playablePlatformLinks.length === 0;
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
      byArtist: artists.length
        ? artists.map((artist) => ({
            "@type": "MusicGroup",
            name: artist.name,
            url: `${SITE_URL}/artist/${artist.slug}`
          }))
        : { "@type": "MusicGroup", name: release.artist_display },
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
        { "@type": "ListItem", position: 2, name: "Releases", item: `${SITE_URL}/releases/` },
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
            ${artistReleaseSections
              .map(
                (section) => `<h2>More from ${escapeHtml(section.artist.name)}</h2>
                  <div class="list">
                    ${
                      section.releases.length
                        ? section.releases
                            .map(
                              (item) =>
                                `<a href="/release/${escapeHtml(item.slug)}"><strong>${escapeHtml(item.catalog_number)}</strong> - ${escapeHtml(item.title)}</a>`
                            )
                            .join("")
                        : `<p>No other connected releases are listed yet.</p>`
                    }
                  </div>`
              )
              .join("")}
            <div class="actions">
              <a href="/releases/">All releases</a>
              ${
                artists.length
                  ? artists.map((artist) => `<a href="/artist/${escapeHtml(artist.slug)}">All releases by ${escapeHtml(artist.name)}</a>`).join("")
                  : `<a href="/artists/">Artists</a>`
              }
            </div>
          </article>
        </section>
      `
    })
  );
};
