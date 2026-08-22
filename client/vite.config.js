import { defineConfig } from "vite";

export default defineConfig({
    base: "/a-POLYGON-game/",
    server: {
        headers: {
            "Cross-Origin-Opener-Policy": "same-origin-allow-popups"
        }
    },
    preview: {
        headers: {
            "Cross-Origin-Opener-Policy": "same-origin-allow-popups"
        }
    }
});