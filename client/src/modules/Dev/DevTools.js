// Developer-only admin console. Only ever imported/installed from
// dev-main.js (the separate developer entry point) — never referenced by
// main.js, Game.js, Create.js or Home.js, so this module (and the devToken
// it sends) never ships as part of a normal production build's import
// graph at all.
//
// Every command here only ever *asks* the server to do something
// (room.send(...)); the server independently re-validates everything
// (developer authorization, target resolution, amounts, ban state) and is
// the only thing that actually mutates gameplay/account state. This file
// never does either itself — it just parses input for basic shape/usage
// feedback and displays the server's reply.
import { variable } from "../GameValues/LocalVariables.js";

let installed = false;
let logEl = null;
let inputEl = null;

export function installDevTools() {
    if (installed) {
        return;
    }
    installed = true;

    _buildConsole();
    _watchRoomForDevMessages();
    _log("Dev console active. Commands:");
    _log("/ban <player> [hours]   /unban <player>");
    _log("/givexp <amount> [player]   /setxp <amount> [player]");
    _log("/togglefreezexp <player>");
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
    logEl.style.cssText = "max-height:140px;overflow-y:auto;margin-bottom:4px;white-space:pre-wrap;line-height:1.4;";

    inputEl = document.createElement("input");
    inputEl.type = "text";
    inputEl.placeholder = "/givexp 500";
    inputEl.autocomplete = "off";
    inputEl.spellcheck = false;
    inputEl.style.cssText = [
        "width:100%", "box-sizing:border-box", "background:#000", "color:#39ff88",
        "border:1px solid #39ff88", "border-radius:4px", "padding:4px",
        "font-family:monospace", "font-size:12px",
    ].join(";");

    inputEl.addEventListener("keydown", (event) => {
        // Stop ordinary game controls (WASD, slash, etc.) from firing while
        // the developer is typing a command into this field.
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

// Client-side parsing here is for usage feedback only (e.g. "you forgot the
// amount") — it is never trusted as validation. The server re-parses and
// re-validates every argument independently before doing anything.
function _runCommand(text) {
    _log("> " + text);

    if (!variable.room) {
        _log("Not connected to a game session.");
        return;
    }

    const [cmd, ...rest] = text.split(/\s+/);

    if (cmd === "/ban") {
        const [username, hours] = rest;
        if (!username) {
            _log("Usage: /ban <player> [time_in_hours]");
            return;
        }
        variable.room.send("devBan", { username, hours: hours ?? null });
    } else if (cmd === "/unban") {
        const [username] = rest;
        if (!username) {
            _log("Usage: /unban <player>");
            return;
        }
        variable.room.send("devUnban", { username });
    } else if (cmd === "/givexp") {
        const [amount, username] = rest;
        if (amount === undefined) {
            _log("Usage: /givexp <amount> [player]");
            return;
        }
        variable.room.send("devGiveXP", { amount: Number(amount), username: username ?? null });
    } else if (cmd === "/setxp") {
        const [amount, username] = rest;
        if (amount === undefined) {
            _log("Usage: /setxp <amount> [player]");
            return;
        }
        variable.room.send("devSetXP", { amount: Number(amount), username: username ?? null });
    } else if (cmd === "/togglefreezexp") {
        const [username] = rest;
        if (!username) {
            _log("Usage: /togglefreezexp <player>");
            return;
        }
        variable.room.send("devToggleFreezeXP", { username });
    } else {
        _log('Unknown command. Try "/ban", "/unban", "/givexp", "/setxp", or "/togglefreezexp".');
    }
}

// Network.js registers the actual room.onMessage(...) listeners for
// devAuthResult/devReply/devKicked the instant the room connects (it has to:
// devAuthResult can arrive within one simulation tick of joining, long
// before this UI module's own setup would notice a new room exists). It
// just pushes strings into variable.devLog; all this does is display them,
// so nothing is ever dropped waiting for this console to catch up.
function _watchRoomForDevMessages() {
    setInterval(() => {
        while (variable.devLog && variable.devLog.length) {
            _log(variable.devLog.shift());
        }
    }, 150);
}
