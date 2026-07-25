import type { Config } from "tailwindcss";

// Intentionally no custom theme, palette, or fonts here. The skeleton uses
// neutral Tailwind utilities so the visual identity is a clean surface for
// the polish pass. Add the design tokens (colors, display/body faces, radii)
// here when you take the aesthetic direction.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
