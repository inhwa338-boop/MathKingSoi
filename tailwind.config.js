/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgba(0, 0, 0, 0.85)",
        muted: "rgba(0, 0, 0, 0.6)",
        surface: "#FCFCFC",
        subtle: "#F7F7F8",
        divider: "#EFEFF0",
        line: "rgba(0, 0, 0, 0.08)",
        cobalt: "#a855f7",
        success: "#31A552",
        error: "#E94E58",
        warning: "#EDBC40",
      },
      boxShadow: {
        soft: "0 1px 3px rgba(0, 0, 0, 0.06)",
      },
      transitionTimingFunction: {
        bezier: "cubic-bezier(0.3, 0, 0, 1)",
      },
    },
  },
  plugins: [],
};
