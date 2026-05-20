import type { Config } from "tailwindcss";

export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        "surface-muted": "var(--surface-muted)",
        "surface-elevated": "var(--surface-elevated)",
        foreground: "var(--foreground)",
        "muted-foreground": "var(--muted-foreground)",
        "subtle-foreground": "var(--subtle-foreground)",
        border: "var(--border)",
        "border-hover": "var(--border-hover)",
        primary: "var(--primary)",
        "primary-text": "var(--primary-text)",
        "primary-muted": "var(--primary-muted)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "SF Pro Text",
          "PingFang SC",
          "Microsoft YaHei UI",
          "Microsoft YaHei",
          "system-ui",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "SFMono-Regular", "Consolas", "monospace"],
      },
      borderRadius: {
        design: "8px",
      },
    },
  },
  plugins: [],
} satisfies Config;
