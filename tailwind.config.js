/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgba(0, 0, 0, 0.85)",
        muted: "rgba(0, 0, 0, 0.6)",
        paper: "#FFFFFF",
        surface: "#FCFCFC",
        subtle: "#F7F7F8",
        line: "rgba(0, 0, 0, 0.05)",
        cobalt: "#a855f7",
        mint: "#17BCE0",
        coral: "#FF5E14",
        skyline: "#17BCE0",
        lemon: "#FFA1B9",
        bubblegum: "#FFA1B9",
        vivid: "#FF5E14"
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0, 0, 0, 0.04)"
      },
      transitionTimingFunction: {
        bezier: "cubic-bezier(0.3, 0, 0, 1)"
      }
    }
  },
  plugins: []
};
