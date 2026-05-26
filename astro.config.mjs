import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://themasterbeatproject.com",
  output: "static",
  vite: {
    cacheDir: ".astro/vite"
  }
});
