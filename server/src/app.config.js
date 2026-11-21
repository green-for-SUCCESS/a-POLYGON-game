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

        /**
         * Use @colyseus/monitor
         * It is recommended to protect this route with a password
         * Read more: https://docs.colyseus.io/tools/monitoring/#restrict-access-to-the-panel-using-a-password
         */
        app.use("/monitor", monitor());

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
