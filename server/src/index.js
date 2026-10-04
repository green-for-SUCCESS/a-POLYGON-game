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
import { listen } from "@colyseus/tools";
import { matchMaker } from "colyseus";

// Import Colyseus config
import app from "./app.config.js";

// Create and listen on 2567 (or PORT environment variable.)
await listen(app);

// The world must be simulating from the moment the server boots, not only
// once a player happens to show up — so create the persistent "battle" room
// here instead of waiting for the first joinOrCreate(). BattleRoom itself
// disables autoDispose, so this single room then stays alive and simulating
// for the lifetime of the process; later joins find and enter this same room.
await matchMaker.createRoom("battle", {});
