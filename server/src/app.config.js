import {
    defineServer,
    defineRoom,
    monitor,
    playground,
    createRouter,
    createEndpoint,
} from "colyseus";

/**
 * Import your Room files
 */
import { BattleRoom } from "./rooms/BattleRoom.js";
import { FfaRoom } from "./rooms/FfaRoom.js";
import { ROOM_NAMES, GAME_MODES } from "../../shared-data/GameModes.js";
import { timingSafeEqual } from "node:crypto";
import { getHealth, isReady } from "./serverStatus.js";

// Minimal HTTP Basic auth (no extra dependency) for the monitor panel.
function requireBasicAuth(username, password) {
    const expected = Buffer.from(`${username}:${password}`);
    return (req, res, next) => {
        const header = req.headers.authorization || "";
        const supplied = header.startsWith("Basic ")
            ? Buffer.from(header.slice(6), "base64")
            : Buffer.alloc(0);
        if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
            return next();
        }
        res.set("WWW-Authenticate", 'Basic realm="monitor"');
        res.status(401).send("Authentication required.");
    };
}

console.log(">>> APP CONFIG LOADED <<<");

const server = defineServer({
    /**
     * Define your room handlers:
     */
    rooms: {
        // Main mode (unchanged name, so existing clients keep working).
        [ROOM_NAMES[GAME_MODES.MAIN]]: defineRoom(BattleRoom),
        // Free-for-All PvP: a separate room type with its own sessions.
        [ROOM_NAMES[GAME_MODES.FFA]]: defineRoom(FfaRoom),
    },

    /**
     * Experimental: Define API routes. Built-in integration with the "playground" and SDK.
     * 
     * Usage from SDK: 
     *   client.http.get("/api/hello").then((response) => {})
     * 
     */
    routes: createRouter({
        api_hello: createEndpoint("/api/hello", { method: "GET", }, async (ctx) => {
            return { message: "Hello World" }
        })
    }),

    /**
     * Bind your custom express routes here:
     * Read more: https://expressjs.com/en/starter/basic-routing.html
     */
    express: (app) => {
        app.get("/hi", (req, res) => {
            res.send("It's time to kick ass and chew bubblegum!");
        });

        // Liveness: the process is up and its event loop is answering.
        // Cheap by design (no database, no Firebase) — point Render's Health
        // Check Path here. A wedged event loop fails it, so Render restarts
        // the instance instead of routing players to it indefinitely.
        app.get("/health/live", (req, res) => {
            res.set("Cache-Control", "no-store").json({ status: "alive" });
        });

        // Readiness + diagnostics: 503 until the main world room exists.
        app.get("/health", (req, res) => {
            res.set("Cache-Control", "no-store").status(isReady() ? 200 : 503).json(getHealth());
        });

        // The Colyseus monitor can inspect and DISPOSE rooms and disconnect
        // players, and it used to be mounted publicly with no password. It
        // is now only mounted when MONITOR_PASSWORD is set (user "admin").
        const monitorPassword = process.env.MONITOR_PASSWORD;
        if (monitorPassword) {
            app.use("/monitor", requireBasicAuth("admin", monitorPassword), monitor());
        } else {
            console.log("[monitor] /monitor is disabled. Set MONITOR_PASSWORD to enable it (HTTP Basic auth, user \"admin\").");
        }

        /**
         * Use @colyseus/playground
         * (It is not recommended to expose this route in a production environment)
         */
        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground());
        }
    }

});

export default server;
