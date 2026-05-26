/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#050508",
        graphite: "#0d0e14",
        carbon: "#141621",
        steel: "#9da3b4",
        haze: "#d7d9e2",
        neon: {
          violet: "#b100ff",
          blue: "#1e4dff",
          cyan: "#29f3ff",
          red: "#ff2a1f",
          amber: "#ffc400",
          green: "#26e21a"
        }
      },
      fontFamily: {
        display: ["Bahnschrift", "Arial Narrow", "Roboto Condensed", "Impact", "sans-serif"],
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["Cascadia Mono", "Consolas", "monospace"]
      },
      boxShadow: {
        glow: "0 0 32px rgba(177, 0, 255, 0.25)",
        line: "0 0 18px rgba(41, 243, 255, 0.22)"
      },
      backgroundImage: {
        "rail-grid":
          "linear-gradient(115deg, transparent 0 22%, rgba(177,0,255,.16) 22.2% 22.8%, transparent 23% 49%, rgba(30,77,255,.14) 49.2% 49.7%, transparent 50%), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};
