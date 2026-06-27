export type ReleasePlatformLinkInput = {
  release_id?: unknown;
  platform?: unknown;
  label?: unknown;
  url?: unknown;
  is_playable?: unknown;
  sort_order?: unknown;
};

export type NormalizedReleasePlatformLink = {
  release_id?: unknown;
  platform: string;
  label: string;
  url: string;
  is_playable: boolean;
  sort_order: number;
};

const PLATFORM_META: Record<string, { label: string; rank: number }> = {
  spotify: { label: "Spotify", rank: 10 },
  apple_music: { label: "Apple Music", rank: 20 },
  youtube_music: { label: "YouTube Music", rank: 30 },
  tidal: { label: "Tidal", rank: 40 },
  deezer: { label: "Deezer", rank: 50 },
  amazon_music: { label: "Amazon Music", rank: 60 },
  soundcloud: { label: "SoundCloud", rank: 70 },
  beatport: { label: "Beatport", rank: 80 },
  bandcamp: { label: "Bandcamp", rank: 90 },
  youtube: { label: "YouTube", rank: 100 },
  smart_link: { label: "Smart Link", rank: 900 },
  email_subscribe: { label: "Email Subscribe", rank: 990 }
};

function safeUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function textKey(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function canonicalReleasePlatform(value: unknown, label: unknown, urlValue: unknown) {
  const joined = `${textKey(value)} ${textKey(label)}`;
  const url = safeUrl(urlValue);
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    host = "";
  }

  if (host.includes("open.spotify.com") || host.includes("spotify.com") || /\bspotify\b/.test(joined)) return "spotify";
  if (host.includes("music.apple.com") || host.includes("itunes.apple.com") || /\b(apple music|apple|itunes)\b/.test(joined)) return "apple_music";
  if (host.includes("music.youtube.com") || /\b(youtube music|yt music|ytmusic)\b/.test(joined)) return "youtube_music";
  if (host.includes("tidal.com") || /\btidal\b/.test(joined)) return "tidal";
  if (host.includes("deezer.com") || /\bdeezer\b/.test(joined)) return "deezer";
  if (host.includes("music.amazon.") || host.includes("amazon.com") || /\bamazon\b/.test(joined)) return "amazon_music";
  if (host.includes("soundcloud.com") || /\bsoundcloud\b/.test(joined)) return "soundcloud";
  if (host.includes("beatport.com") || /\bbeatport\b/.test(joined)) return "beatport";
  if (host.includes("bandcamp.com") || /\bbandcamp\b/.test(joined)) return "bandcamp";
  if (host.includes("youtube.com") || host.includes("youtu.be") || /\byoutube\b/.test(joined)) return "youtube";
  if (/\b(email|subscribe|mailing list)\b/.test(joined)) return "email_subscribe";
  if (host.includes("ffm.to") || /\b(smart link|ffm|feature fm)\b/.test(joined)) return "smart_link";

  return textKey(value || label).replace(/\s+/g, "_") || "platform";
}

export function releasePlatformLabel(platform: string, fallback?: unknown) {
  return PLATFORM_META[platform]?.label || String(fallback ?? platform).replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isPlayableReleaseLink(link: Pick<NormalizedReleasePlatformLink, "platform" | "label">) {
  return !/email|subscribe/i.test(`${link.platform} ${link.label}`);
}

function linkRank(link: NormalizedReleasePlatformLink) {
  return PLATFORM_META[link.platform]?.rank ?? 500;
}

function releaseSearchUrl(artistDisplay: string, title: string) {
  const query = [artistDisplay, title].filter(Boolean).join(" ").trim();
  return query ? `https://open.spotify.com/search/${encodeURIComponent(query)}` : "";
}

export function normalizeReleasePlatformLinks(
  input: ReleasePlatformLinkInput[],
  options: { artistDisplay?: string; title?: string; addSpotifyFallback?: boolean } = {}
) {
  const byPlatform = new Map<string, NormalizedReleasePlatformLink>();

  input.forEach((raw, index) => {
    const url = safeUrl(raw.url);
    if (!url) return;
    const platform = canonicalReleasePlatform(raw.platform, raw.label, url);
    const label = releasePlatformLabel(platform, raw.label || raw.platform);
    const link: NormalizedReleasePlatformLink = {
      release_id: raw.release_id,
      platform,
      label,
      url,
      is_playable: raw.is_playable === false || raw.is_playable === 0 ? false : true,
      sort_order: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : index
    };
    const existing = byPlatform.get(platform);
    if (!existing || linkRank(link) < linkRank(existing) || (existing.url.includes("ffm.to") && !link.url.includes("ffm.to"))) {
      byPlatform.set(platform, link);
    }
  });

  const hasPlayable = [...byPlatform.values()].some(isPlayableReleaseLink);
  if (options.addSpotifyFallback && hasPlayable && !byPlatform.has("spotify")) {
    const spotifyUrl = releaseSearchUrl(options.artistDisplay || "", options.title || "");
    if (spotifyUrl) {
      byPlatform.set("spotify", {
        platform: "spotify",
        label: "Spotify",
        url: spotifyUrl,
        is_playable: true,
        sort_order: PLATFORM_META.spotify.rank
      });
    }
  }

  return [...byPlatform.values()].sort((left, right) => linkRank(left) - linkRank(right) || left.sort_order - right.sort_order || left.label.localeCompare(right.label));
}
