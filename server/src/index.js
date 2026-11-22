/**
 * IMPORTANT:
 * ---------
 * Do not manually edit this file if you'd like to host your server on Colyseus Cloud
 *
 * If you're self-hosting (without Colyseus Cloud), you can manually
 * instantiate a Colyseus Server as documented here:
 *
 * See: https://docs.colyseus.io/server/api/#constructor-options
 */
// Must be the very first import: loads server/.env.* reliably regardless of
// the process's working directory, before anything below reads process.env
// (see loadEnv.js for why this is necessary and not redundant with
// @colyseus/tools's own env loading).
import "./loadEnv.js";

import { listen } from "@colyseus/tools";
import { matchMaker } from "colyseus";

// Import Colyseus config
import app from "./app.config.js";
import { markReady } from "./serverStatus.js";
import { ROOM_NAMES, GAME_MODES } from "../../shared-data/GameModes.js";

// A stray rejected promise (e.g. a failed Firebase Admin call somewhere
// nobody awaited) used to terminate the whole process under Node's default
// policy, dropping every player. Log it and keep serving.
process.on("unhandledRejection", (reason) => {
    console.error("[process] Unhandled promise rejection:", reason instanceof Error ? reason.stack : reason);
});

// Colyseus already handles a genuinely uncaught exception: it shuts the
// server down gracefully and exits non-zero, and Render restarts it. This
// only adds a clear log line; it must not exit itself, or it would cut that
// graceful shutdown short. (Room code no longer gets here at all:
// BattleRoom.onUncaughtException contains errors in ticks, message handlers
// and lifecycle hooks and keeps the room running.)
process.on("uncaughtException", (error) => {
    console.error("[process] Uncaught exception:", error?.stack || error);
});

// Listens on PORT (set by Render) or 2567 locally.
await listen(app);

// The world must be simulating from the moment the server boots, not only
// once a player happens to show up — so create the persistent main room here
// instead of waiting for the first joinOrCreate(). BattleRoom disables
// autoDispose, so this single room stays alive for the lifetime of the
// process. listen() already accepts connections, so a join that arrived in
// the meantime may have created it; don't create a second main world then.
try {
    const mainRoomName = ROOM_NAMES[GAME_MODES.MAIN];
    const existing = await matchMaker.query({ name: mainRoomName });
    if (existing.length === 0) {
        await matchMaker.createRoom(mainRoomName, {});
    }
    markReady();
    console.log("[startup] Ready: main world room is running.");
} catch (error) {
    console.error("[startup] Could not create the main world room:", error?.stack || error);
    process.exit(1);
}
