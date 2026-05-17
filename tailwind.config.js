/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#24313f",
        paper: "#fffaf0",
        mint: "#2f9d7e",
        coral: "#e46f5a",
        skyline: "#2374ab",
        lemon: "#f3c84b"
      },
      boxShadow: {
        soft: "0 16px 42px rgba(36, 49, 63, 0.12)"
      }
    }
  },
  plugins: []
};
