import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        elev: "var(--bg-elev)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        line: "var(--border)",
        ink: "var(--text)",
        mute: "var(--muted)",
        accent: "var(--accent)",
      },
      borderRadius: {
        xl: "1rem",
      },
      boxShadow: {
        glow: "0 0 80px rgba(124, 92, 255, 0.28)",
      },
    },
  },
  plugins: [],
};

export default config;
