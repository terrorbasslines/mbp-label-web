import type { Env } from "../api/_shared";
import { mbpRegionDetails, normalizeMbpRegion } from "../api/_shared";
import { absoluteUrl, escapeHtml, htmlResponse, notFoundPage, pageShell, SITE_NAME, SITE_URL } from "../_seo";

type ArtistRow = {
  id: string;
  slug: string;
  name: string;
  country?: string | null;
  profile?: string | null;
  image_url?: string | null;
  links_json?: string | null;
  mbp_region?: string | null;
};

type ReleaseRow = {
  slug: string;
  catalog_number: string;
  title: string;
  artist_display: string;
  status?: string | null;
};

function parseLinks(value: string | null | undefined): Array<{ label: string; url: string }> {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((item) => item?.url && item?.label) : [];
  } catch {
    return [];
  }
}

const MANAGEMENT_PROFILES = new Map([
  ["terror basslines", "CEO of The MasterBeat Project, leading label strategy, catalogue direction and MBP brand development."],
  ["romee storm", "A&R for The MasterBeat Project, focused on artist relations, demo review and release development."],
  ["alexair", "A&R for The MasterBeat Project, focused on roster scouting, music feedback and catalogue quality control."],
  ["rodrigo stadt", "MBP Ambassador representing The MasterBeat Project community, label presence and artist support."]
]);

function publicProfile(artist: ArtistRow) {
  const profile = artist.profile || "";
  if (profile && !profile.toLowerCase().startsWith("imported from ")) return profile;
  return MANAGEMENT_PROFILES.get(artist.name.toLowerCase()) || null;
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  if (!env.DB) return notFoundPage("Artist not available");

  const slug = String(params.slug ?? "").toLowerCase();
  const artist = await env.DB.prepare("SELECT * FROM artists WHERE slug = ? LIMIT 1").bind(slug).first<ArtistRow>();
  if (!artist) return notFoundPage("Artist not found");

  const releases = await env.DB.prepare(
    `SELECT DISTINCT r.slug, r.catalog_number, r.title, r.artist_display, r.status
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
     ORDER BY r.catalog_number DESC`
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
    .all<ReleaseRow>();

  const artistLinks = parseLinks(artist.links_json);
  const region = normalizeMbpRegion(artist.mbp_region);
  const regionInfo = mbpRegionDetails(region);
  const canonicalPath = `/artist/${artist.slug}`;
  const description =
    publicProfile(artist) ||
    `${artist.name} is an artist connected to ${SITE_NAME}, a hardstyle, hard dance and electronic music label.`;
  const image = artist.image_url || "/assets/brand/logo-official-purple.png";
  const title = `${artist.name} - ${SITE_NAME} artist`;
  const releaseRows = releases.results ?? [];
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "MusicGroup",
      "@id": `${SITE_URL}${canonicalPath}#artist`,
      name: artist.name,
      url: `${SITE_URL}${canonicalPath}`,
      image: absoluteUrl(image),
      description,
      genre: ["Hardstyle", "Hard Dance", "Electronic Music"],
      sameAs: artistLinks.map((link) => link.url),
      memberOf: {
        "@id": `${SITE_URL}/#organization`
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Artists", item: `${SITE_URL}/artists/` },
        { "@type": "ListItem", position: 3, name: artist.name, item: `${SITE_URL}${canonicalPath}` }
      ]
    }
  ];

  return htmlResponse(
    pageShell({
      title,
      description,
      canonicalPath,
      image,
      ogType: "profile",
      jsonLd,
      content: `
        <section class="hero">
          <p class="eyebrow">Label artist</p>
          <h1>${escapeHtml(artist.name)}</h1>
          <p>${escapeHtml(artist.country || SITE_NAME)}</p>
          <div class="meta">
            <span class="pill" style="border-color:${escapeHtml(regionInfo.color)}66;color:${escapeHtml(regionInfo.color)}">${escapeHtml(regionInfo.label)}</span>
          </div>
        </section>
        <section class="grid">
          <div>
            <img class="art" style="border-color:${escapeHtml(regionInfo.color)}66;box-shadow:0 0 34px ${escapeHtml(regionInfo.color)}24" src="${escapeHtml(absoluteUrl(image))}" alt="${escapeHtml(artist.name)} artist profile image" />
          </div>
          <article class="card" style="border-color:${escapeHtml(regionInfo.color)}55;box-shadow:0 0 28px ${escapeHtml(regionInfo.color)}14">
            <p>${escapeHtml(description)}</p>
            <div class="links">
              ${artistLinks
                .map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`)
                .join("")}
            </div>
            <h2>Releases</h2>
            <div class="list">
              ${
                releaseRows.length
                  ? releaseRows
                      .map(
                        (release) =>
                          `<a href="/release/${escapeHtml(release.slug)}"><strong>${escapeHtml(release.catalog_number)}</strong> - ${escapeHtml(release.title)}</a>`
                      )
                      .join("")
                  : `<p>Release history is being prepared for this artist profile.</p>`
              }
            </div>
            <div class="actions">
              <a href="/artists/">All artists</a>
              <a href="/releases/">All releases</a>
            </div>
          </article>
        </section>
      `
    })
  );
};
