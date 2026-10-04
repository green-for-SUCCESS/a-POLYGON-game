// =========================================================
// DEVELOPER BUILD ENTRY POINT
// =========================================================
// This file (and dev.html) is a separate entry point from the normal game
// (index.html -> main.js). It is never referenced by main.js/Game.js/
// Create.js/Home.js — those stay exactly as they are for normal players.
// Build it on its own with `npm run build:dev` (see package.json), which
// emits a separate dist-dev/ output; never ship dist-dev/ to the public URL.
import "./modules/Multiplayer/FirebaseConfig.js";
import { setDevBuild } from "./modules/Dev/DevFlag.js";

setDevBuild(true);

window.addEventListener('load', async () => {
    await document.fonts.load("72px Ubuntu");
    await document.fonts.load("38px Ubuntu");
    await document.fonts.load("32px Ubuntu");
    await document.fonts.load("110px Ubuntu");
    await document.fonts.load("42px Ubuntu");
    await document.fonts.load("120px Ubuntu");

    await import("./modules/Game.js");

    // The dev console/K-L-R shortcuts are global (not tied to one Phaser
    // scene), so they work identically on the Home screen and in-game.
    const { installDevTools } = await import("./modules/Dev/DevTools.js");
    installDevTools();
});
