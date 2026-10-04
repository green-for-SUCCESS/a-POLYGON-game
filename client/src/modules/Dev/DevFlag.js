// Set to true only by dev-main.js (the separate developer entry point).
// main.js (the normal production entry) never imports this module at all —
// nothing in the production bundle ever calls setDevBuild(true).
let devBuild = false;

export function setDevBuild(value) {
    devBuild = Boolean(value);
}

export function isDevBuild() {
    return devBuild;
}
