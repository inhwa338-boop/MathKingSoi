/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#24313f",
        paper: "#E9FAFD",
        mint: "#17BCE0",
        coral: "#FF5E14",
        skyline: "#17BCE0",
        lemon: "#FFA1B9",
        bubblegum: "#FFA1B9",
        vivid: "#FF5E14"
      },
      boxShadow: {
        soft: "0 16px 42px rgba(23, 188, 224, 0.22)"
      }
    }
  },
  plugins: []
};
