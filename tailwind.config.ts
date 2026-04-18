import type { Config } from "tailwindcss";

const config: Config = {
  future: {
    // Avoid :hover “sticking” after tap on touch devices (e.g. pass/curate circles).
    hoverOnlyWhenSupported: true,
  },
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
