import { defineConfig } from "vite";
import { resolve } from "path";

// `npm run build` (mode "production", the default) builds ONLY index.html
// into dist/ — the normal, player-facing game. `npm run build:devtools`
// (mode "devtools") builds ONLY dev.html into dist-dev/ instead, so the
// developer build is a genuinely separate artifact: dist/ never contains
// dev.html, dev-main.js, or anything under modules/Dev/.
export default defineConfig(({ mode }) => {
    const isDevtools = mode === "devtools";
    const base = "/a-POLYGON-game/";

    return {
        base,
        server: {
            headers: {
                "Cross-Origin-Opener-Policy": "same-origin-allow-popups"
            },
            // `--mode devtools` only changes env vars / import.meta.env.MODE —
            // the dev SERVER (unlike `vite build`) ignores rollupOptions.input
            // entirely and serves index.html at `/` by default regardless of
            // mode. Without this, `npm run dev:devtools` silently opens the
            // normal production entry (main.js), not the dev build at all —
            // this is what made the dev console "disappear".
            open: isDevtools ? `${base}dev.html` : undefined,
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
