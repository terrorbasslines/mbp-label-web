export const siteConfig = {
  name: "The MasterBeat Project",
  domain: "themasterbeatproject.com",
  tagline: "Hardstyle and electronic label energy built for the mainstage.",
  email: "contact@themasterbeatproject.com",
  demoEmail: "demos@themasterbeatproject.com",
  socials: [
    { label: "Linktree", href: "https://linktr.ee/themasterbeatproject" },
    { label: "SoundCloud", href: "https://soundcloud.com/the-masterbeat-project" },
    { label: "Email", href: "mailto:contact@themasterbeatproject.com" }
  ]
};

export const navItems = [
  { label: "Home", href: "/" },
  { label: "Releases", href: "/releases" },
  { label: "Artists", href: "/artists" },
  { label: "Demo Submission", href: "/demo-submission" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" }
];

export const releases = [
  {
    title: "Saved My Life",
    artist: "Riax",
    catalog: "Featured release",
    format: "Single",
    sound: "Euphoric hardstyle",
    accent: "violet",
    artwork: "/assets/brand/logo-official-purple.png",
    description: "A focused hardstyle release with emotional lift, bright lead work and a polished MBP presentation."
  },
  {
    title: "Love Unraveled",
    artist: "Aerobey",
    catalog: "Featured release",
    format: "Single",
    sound: "Melodic hardstyle",
    accent: "blue",
    artwork: "/assets/brand/logo-official-asia.png",
    description: "A melodic hard dance record built around strong atmosphere, clean hooks and a direct festival pulse."
  },
  {
    title: "Better With You",
    artist: "Semitonez",
    catalog: "Featured release",
    format: "Single",
    sound: "Hardstyle / vocal energy",
    accent: "amber",
    artwork: "/assets/brand/logo-official-australia.png",
    description: "Vocal-led energy with an uplifting label fit, precise build tension and clean electronic finishing."
  },
  {
    title: "We Are The Warriors",
    artist: "Artphazers",
    catalog: "Catalogue highlight",
    format: "Single",
    sound: "Hard dance anthem",
    accent: "red",
    artwork: "/assets/brand/logo-official-america.png",
    description: "A hard electronic anthem lane with bold hooks, stacked synths and a strong visual identity fit."
  }
] as const;

export const artists = [
  {
    name: "Riax",
    origin: "Euphoric hardstyle",
    role: "Featured artist",
    accent: "violet",
    image: "/assets/brand/logo-official-purple.png",
    description: "Peak-time sound design shaped around powerful kick movement, bright leads and direct crowd connection."
  },
  {
    name: "Artphazers",
    origin: "Electronic / anthem focus",
    role: "Featured artist",
    accent: "green",
    image: "/assets/brand/logo-official-australia.png",
    description: "Energetic production language made for bold hooks, stacked synths and polished label releases."
  },
  {
    name: "Valkrize",
    origin: "Hard dance / darker club pressure",
    role: "Featured artist",
    accent: "red",
    image: "/assets/brand/logo-official-america.png",
    description: "A harder electronic profile with dramatic tension, heavy low-end decisions and late-night momentum."
  },
  {
    name: "The-Wolfs",
    origin: "Hardstyle / melodic drive",
    role: "Featured artist",
    accent: "blue",
    image: "/assets/brand/logo-official-europe.png",
    description: "Melodic hardstyle direction with emotional hooks, clean arrangements and release-ready impact."
  }
] as const;

export const labelStats = [
  { value: "Global", label: "digital release mindset" },
  { value: "Hard", label: "dance-first catalogue focus" },
  { value: "Clean", label: "metadata and artwork pipeline" }
];

export type Release = (typeof releases)[number];
export type Artist = (typeof artists)[number];
