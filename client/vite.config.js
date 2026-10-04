import { defineConfig } from "vite";
import { resolve } from "path";

// `npm run build` (mode "production", the default) builds ONLY index.html
// into dist/ — the normal, player-facing game. `npm run build:devtools`
// (mode "devtools") builds ONLY dev.html into dist-dev/ instead, so the
// developer build is a genuinely separate artifact: dist/ never contains
// dev.html, dev-main.js, or anything under modules/Dev/.
export default defineConfig(({ mode }) => {
    const isDevtools = mode === "devtools";

    return {
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
        },
        build: isDevtools
            ? {
                outDir: "dist-dev",
                rollupOptions: {
                    input: resolve(process.cwd(), "dev.html"),
                },
            }
            : undefined,
    };
});
