// Explicit, cwd-independent environment loading.
//
// @colyseus/tools already loads an .env file as a side effect of importing
// it (see its loadenv.mjs), but it resolves paths off `require.main.filename`
// falling back to `process.cwd()` — and in this project's pure-ESM server
// (package.json "type": "module"), `require` doesn't exist as a global at
// all, so that fallback is what actually runs every time. That makes env
// loading depend entirely on the directory the process happens to be
// launched from: `npm run start` from inside server/ finds server/.env.*
// correctly, but launching the exact same `node src/index.js` from the repo
// root (or from an IDE run config, a process manager, etc. with a different
// working directory) silently finds nothing, and DEV_SECRET (and anything
// else env-based) just never gets set — no error, just silence.
//
// This resolves relative to *this file's own location* instead, so it finds
// server/.env.* regardless of the process's current working directory, and
// runs before anything else (see index.js) so every later `process.env`
// read — including BattleRoom's DEV_SECRET check — sees it.
import dotenv from "dotenv";
import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.env.NODE_ENV || "development";

// Most specific first: dotenv.config() never overrides a var that's already
// in process.env, so whichever file sets a key first wins.
const candidates = [
    `.env.${mode}.local`,
    `.env.${mode}`,
    `.env.local`,
    `.env`,
];

let loadedFrom = null;
for (const name of candidates) {
    const path = resolve(serverRoot, name);
    if (existsSync(path)) {
        dotenv.config({ path });
        loadedFrom = loadedFrom ?? path;
    }
}

if (mode !== "production") {
    console.log(loadedFrom
        ? `[env] Loaded ${loadedFrom}`
        : `[env] No .env file found in ${serverRoot} for mode "${mode}".`);

    if (!process.env.DEV_SECRET) {
        console.log(
            "[env] DEV_SECRET is not set. Developer-build commands (K/L/R, /kick, /ban) " +
            "will be safely rejected by the server until it is. Set DEV_SECRET in " +
            "server/.env.development to the same value as client/.env.devtools's " +
            "VITE_DEV_SECRET, then restart this server process (env vars are only " +
            "read at process startup)."
        );
    }
}
