// =========================================================
// ALL THE BORING STUFF
// =========================================================
import "./modules/Multiplayer/FirebaseInit.js";
import { connect } from "./modules/Multiplayer/Network.js";

window.addEventListener('load', async () => {
    await document.fonts.load("72px Ubuntu");
    await document.fonts.load("38px Ubuntu");
    await document.fonts.load("32px Ubuntu");
    await document.fonts.load("110px Ubuntu");
    await document.fonts.load("42px Ubuntu");
    await document.fonts.load("120px Ubuntu");

    await import("./modules/Game.js");

});