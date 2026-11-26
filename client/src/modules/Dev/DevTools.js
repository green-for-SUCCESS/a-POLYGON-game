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
    // Long unbroken values (e.g. a 250-digit XP amount) wrap instead of
    // stretching the panel.
    logEl.style.cssText = "max-height:140px;overflow-y:auto;margin-bottom:4px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.4;";

    // No length limit: the field accepts any amount of text and scrolls
    // horizontally (keeping the caret, i.e. the newest characters, in view)
    // as you type. Amounts are sent to the server as the exact text typed.
    inputEl = document.createElement("input");
    inputEl.type = "text";
    inputEl.placeholder = "/givexp 500";
    inputEl.autocomplete = "off";
    inputEl.spellcheck = false;
    inputEl.removeAttribute("maxlength");
    inputEl.style.cssText = [
        "width:100%", "box-sizing:border-box", "background:#000", "color:#39ff88",
        "border:1px solid #39ff88", "border-radius:4px", "padding:4px",
        "font-family:monospace", "font-size:12px",
        "overflow-x:auto", "white-space:nowrap", "text-overflow:clip",
    ].join(";");

    // Pasted text lands with the caret at the end, but some browsers leave
    // the view scrolled to the start; keep the newest characters visible.
    inputEl.addEventListener("input", () => {
        if (inputEl.selectionStart === inputEl.value.length) {
            inputEl.scrollLeft = inputEl.scrollWidth;
        }
    });

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
// The server's WebSocket rejects (and disconnects) frames over 4 KB, so an
// argument that can't possibly be valid is rejected here instead of being
// sent. 10^250 has 251 digits; anything longer (after leading zeros) or any
// player name longer than this is reported locally.
const MAX_ARG_CHARS = 300;

function _argTooLong(value) {
    const s = String(value ?? "");
    return s.replace(/^0+(?=\d)/, "").length > MAX_ARG_CHARS;
}

// Echoing a megabyte-long command into the log would only slow the page
// down; the command itself is always used in full.
function _echo(text) {
    return text.length > 300 ? `${text.slice(0, 300)}… (${text.length} characters)` : text;
}

function _runCommand(text) {
    _log("> " + _echo(text));

    if (!variable.room) {
        _log("Not connected to a game session.");
        return;
    }

    // UI-side gate only; the server ignores dev commands from unauthorized
    // connections regardless.
    if (variable.devAuthorized !== true) {
        _log(variable.devAuthorized === false
            ? "Commands are disabled: developer authorization failed (see above)."
            : "Commands are disabled until the server confirms developer authorization.");
        return;
    }

    const [cmd, ...rest] = text.split(/\s+/);

    const tooLong = rest.find(_argTooLong);
    if (tooLong !== undefined) {
        _log(/^\d/.test(tooLong)
            ? "Amount is above the maximum of 10^250 (or not a valid whole number)."
            : `Argument is too long (over ${MAX_ARG_CHARS} characters).`);
        return;
    }
    // Leading zeros carry no value; drop them so a padded but valid amount
    // still fits comfortably in one message.
    for (let i = 0; i < rest.length; i++) {
        if (/^\d+$/.test(rest[i])) {
            rest[i] = rest[i].replace(/^0+(?=\d)/, "");
        }
    }

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
        // Sent as typed: the server parses it exactly (BigInt), so long
        // values like 1e250 or 300-digit numbers aren't rounded here.
        variable.room.send("devGiveXP", { amount: String(amount), username: username ?? null });
    } else if (cmd === "/setxp") {
        const [amount, username] = rest;
        if (amount === undefined) {
            _log("Usage: /setxp <amount> [player]");
            return;
        }
        variable.room.send("devSetXP", { amount: String(amount), username: username ?? null });
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
