import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const heroJobs = [
  {
    src: "public/assets/brand/stage-hero.png",
    base: "public/assets/brand/stage-hero",
    widths: [640, 960, 1440, 1920]
  },
  {
    src: "public/assets/brand/season4-banner.png",
    base: "public/assets/brand/season4-banner",
    widths: [640, 960, 1440]
  },
  {
    src: "public/assets/labels/horizon-hero.png",
    base: "public/assets/labels/horizon-hero",
    widths: [640, 960, 1440, 1920]
  },
  {
    src: "public/assets/labels/section7-hero.png",
    base: "public/assets/labels/section7-hero",
    widths: [640, 960, 1440, 1920]
  }
];

const logoJobs = [
  {
    src: "public/assets/brand/logo-official-purple.png",
    base: "public/assets/brand/logo-nav",
    widths: [96, 192]
  },
  {
    src: "public/assets/labels/horizon-logo.png",
    base: "public/assets/labels/horizon-logo",
    widths: [96, 192]
  },
  {
    src: "public/assets/labels/section7-logo.png",
    base: "public/assets/labels/section7-logo",
    widths: [96, 192]
  }
];

function absolute(relativePath) {
  return path.join(repoRoot, relativePath);
}

async function writeResponsiveSet(job) {
  await Promise.all(
    job.widths.flatMap((width) => {
      const input = sharp(absolute(job.src)).resize({ width, withoutEnlargement: true });
      return [
        input.clone().webp({ quality: width >= 1440 ? 72 : 76, effort: 5 }).toFile(absolute(`${job.base}-${width}.webp`)),
        input.clone().avif({ quality: width >= 1440 ? 44 : 48, effort: 5 }).toFile(absolute(`${job.base}-${width}.avif`))
      ];
    })
  );
}

async function writeLogoSet(job) {
  await Promise.all(
    job.widths.flatMap((width) => {
      const input = sharp(absolute(job.src)).resize({ width, height: width, fit: "cover", withoutEnlargement: true });
      return [
        input.clone().webp({ quality: 82, effort: 5 }).toFile(absolute(`${job.base}-${width}.webp`)),
        input.clone().avif({ quality: 56, effort: 5 }).toFile(absolute(`${job.base}-${width}.avif`))
      ];
    })
  );
}

async function writeFallbacks() {
  await sharp(absolute("public/assets/brand/logo-official-purple.png"))
    .resize({ width: 96, height: 96, fit: "cover", withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toFile(absolute("public/assets/brand/logo-nav.png"));

  await sharp(absolute("public/assets/brand/stage-hero.png"))
    .resize({ width: 1200, height: 630, fit: "cover", withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(absolute("public/assets/brand/stage-hero-og.jpg"));
}

await Promise.all([...heroJobs.map(writeResponsiveSet), ...logoJobs.map(writeLogoSet)]);
await writeFallbacks();

console.log("Optimized static assets written.");
