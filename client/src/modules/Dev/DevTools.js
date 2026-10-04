// Developer-only playtesting tools: level shortcuts + a tiny admin console.
// Only ever imported/installed from dev-main.js (the separate developer
// entry point) — never referenced by main.js, Game.js, Create.js or Home.js,
// so this module (and the devToken it sends) never ships as part of a
// normal production build's import graph at all.
//
// Every command here only ever *asks* the server to do something
// (room.send(...)); the server is the one that actually verifies developer
// authorization (via the devToken checked at join time) and performs the
// level change / kick / ban. This file never mutates gameplay state itself.
import { variable } from "../GameValues/LocalVariables.js";

const REPEAT_INTERVAL_MS = 120; // controlled interval, independent of render framerate

let installed = false;
let logEl = null;
let inputEl = null;
const holdTimers = { K: null, L: null };

export function installDevTools() {
    if (installed) {
        return;
    }
    installed = true;

    _buildConsole();
    _installKeyboardShortcuts();
    _watchRoomForDevMessages();
    _log("Dev tools active — K: level down (hold), L: level up (hold), R: reset level.");
    _log("Commands: /kick <username>, /ban <username>");
}

function _buildConsole() {
    const panel = document.createElement("div");
    panel.style.cssText = [
        "position:fixed", "left:8px", "bottom:8px", "z-index:99999",
        "width:340px", "font-family:monospace", "font-size:12px",
        "background:rgba(15,15,15,0.88)", "border:1px solid #39ff88",
        "border-radius:6px", "padding:6px", "color:#39ff88",
        "pointer-events:auto",
    ].join(";");

    const title = document.createElement("div");
    title.textContent = "DEV CONSOLE";
    title.style.cssText = "font-weight:bold;margin-bottom:4px;opacity:0.8;letter-spacing:1px;";

    logEl = document.createElement("div");
    logEl.style.cssText = "max-height:120px;overflow-y:auto;margin-bottom:4px;white-space:pre-wrap;line-height:1.4;";

    inputEl = document.createElement("input");
    inputEl.type = "text";
    inputEl.placeholder = "/kick username";
    inputEl.autocomplete = "off";
    inputEl.spellcheck = false;
    inputEl.style.cssText = [
        "width:100%", "box-sizing:border-box", "background:#000", "color:#39ff88",
        "border:1px solid #39ff88", "border-radius:4px", "padding:4px",
        "font-family:monospace", "font-size:12px",
    ].join(";");

    inputEl.addEventListener("keydown", (event) => {
        // Stop the game's own key handlers (and our K/L/R shortcuts) from
        // firing while the developer is typing a command.
        event.stopPropagation();

        if (event.key === "Enter") {
            const value = inputEl.value;
            inputEl.value = "";
            if (value.trim()) {
                _runCommand(value.trim());
            }
        }
    });

    panel.appendChild(title);
    panel.appendChild(logEl);
    panel.appendChild(inputEl);
    document.body.appendChild(panel);
}

function _log(message) {
    if (!logEl) {
        return;
    }

    const line = document.createElement("div");
    line.textContent = message;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
}

function _runCommand(text) {
    _log("> " + text);

    if (!variable.room) {
        _log("Not connected to a game session.");
        return;
    }

    const [cmd, ...rest] = text.split(/\s+/);
    const username = rest.join(" ");

    if (cmd === "/kick" && username) {
        variable.room.send("devKick", { username });
    } else if (cmd === "/ban" && username) {
        variable.room.send("devBan", { username });
    } else {
        _log('Unknown command. Try "/kick <username>" or "/ban <username>".');
    }
}

// The room connects/disconnects as the player moves between scenes and
// reconnects; this attaches the dev-reply listeners to whichever room
// instance is currently live, without depending on Network.js internals.
function _watchRoomForDevMessages() {
    let lastRoom = null;

    setInterval(() => {
        if (variable.room && variable.room !== lastRoom) {
            lastRoom = variable.room;
            variable.room.onMessage("devReply", (data) => _log(String(data?.message ?? "")));
            variable.room.onMessage("devKicked", (data) => _log("You were kicked: " + (data?.reason || "no reason given")));
        }
    }, 500);
}

function _isTypingInTextField() {
    const el = document.activeElement;
    return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA"));
}

function _installKeyboardShortcuts() {
    function sendLevelDelta(delta) {
        if (variable.room) {
            variable.room.send("devAdjustLevel", { delta });
        }
    }

    function startRepeat(key, action) {
        if (holdTimers[key]) {
            return;
        }
        action();
        holdTimers[key] = setInterval(action, REPEAT_INTERVAL_MS);
    }

    function stopRepeat(key) {
        if (holdTimers[key]) {
            clearInterval(holdTimers[key]);
            holdTimers[key] = null;
        }
    }

    window.addEventListener("keydown", (event) => {
        if (_isTypingInTextField()) {
            return;
        }

        const key = event.key.toLowerCase();

        if (key === "k") {
            startRepeat("K", () => sendLevelDelta(-1));
        } else if (key === "l") {
            startRepeat("L", () => sendLevelDelta(1));
        } else if (key === "r") {
            if (variable.room) {
                variable.room.send("devResetLevel");
                _log("Reset level requested.");
            }
        }
    });

    window.addEventListener("keyup", (event) => {
        const key = event.key.toLowerCase();
        if (key === "k") stopRepeat("K");
        if (key === "l") stopRepeat("L");
    });

    window.addEventListener("blur", () => {
        stopRepeat("K");
        stopRepeat("L");
    });
}
