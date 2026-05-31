import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://themasterbeatproject.com",
  output: "static",
  trailingSlash: "always",
  vite: {
    cacheDir: ".astro/vite"
  }
});
