import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#14171A",
        paper: "#F7F5F0",
        navy: "#101826",
        navy2: "#1B2637",
        signal: "#F4650B", // hazard-orange accent: the "call the repairman" color
        signalDark: "#D6540A",
        teal: "#0FA3A3", // multimeter-LED accent for progress/confirm states
        tealDark: "#0C8484",
        line: "#E4DFD4",
        success: "#2E7D32",
        danger: "#C0392B",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        ticket: "6px",
      },
      boxShadow: {
        ticket: "0 1px 0 rgba(16,24,38,0.04), 0 12px 24px -12px rgba(16,24,38,0.25)",
      },
    },
  },
  plugins: [],
};
export default config;
