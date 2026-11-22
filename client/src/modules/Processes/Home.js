import { getSession, signOut } from "../Multiplayer/FirebaseConfig.js";
import { loadGuestProfile } from "../Multiplayer/GuestStore.js";
import { getLevelProgress } from "../../../../shared-data/Progression.js";
import { GAME_MODES } from "../../../../shared-data/GameModes.js";
import { variable } from "../GameValues/LocalVariables.js";

// =====================================================
// HOME SCREEN
// =====================================================
//
// Three states:
//   account  - signed in with Firebase: progression is the account's.
//   guest    - "Continue as Guest" chosen: progression is this browser's
//              local guest save (GuestStore.js). Firebase is never written.
//   choose   - signed out: pick LOGIN or CONTINUE AS GUEST.
// Account and guest progression are never mixed; signing in while a guest
// save exists just loads the account and leaves the guest save untouched.
// Both game modes (PLAY and FREE-FOR-ALL) use and add to that progression.

export function createHome(session) {

    const isLoggedIn = Boolean(session?.username);

    // A Firebase sign-in always wins: the guest view is only offered while
    // signed out, so one session can never have both providers.
    if (isLoggedIn) {
        variable.identity = "account";
    }

    const isGuest = !isLoggedIn && variable.identity === "guest";
    const guest = isGuest ? loadGuestProfile() : null;

    const { width, height } = this.scale;
    const scene = this;

    this.cameras.main.setBackgroundColor(0x000000);

    // =================================================
    // BUTTON HELPER
    // =================================================

    function addButton(x, y, w, h, label, fontSize, onClick, radius = 20) {
        const bg = scene.add.graphics();

        function draw(color) {
            bg.clear();
            bg.fillStyle(color, 0.95);
            bg.fillRoundedRect(x, y, w, h, radius);
            bg.lineStyle(3, 0xffffff, 1);
            bg.strokeRoundedRect(x, y, w, h, radius);
        }

        draw(0x222222);

        const hit = scene.add.rectangle(x, y, w, h, 0x000000, 0);
        hit.setOrigin(0).setInteractive({ useHandCursor: true });

        const text = scene.add.text(x + w / 2, y + h / 2, label, {
            fontSize,
            fontFamily: "Ubuntu",
            color: "#ffffff"
        });
        text.setOrigin(0.5);

        hit.on("pointerdown", () => draw(0x1a1a1a));
        hit.on("pointerout", () => draw(0x222222));
        hit.on("pointerup", () => {
            draw(0x222222);
            onClick();
        });

        return { bg, hit, text };
    }

    // =================================================
    // TITLE
    // =================================================

    const titleX = width / 2;

    const titleTop = this.add.text(
        titleX,
        height * 0.28,
        "A GAME",
        {
            fontSize: "72px",
            fontFamily: "Ubuntu",
            color: "#000000",
            stroke: "#ffffff",
            strokeThickness: 6
        }
    );

    titleTop.setOrigin(0.5);

    const titleMiddle = this.add.text(
        titleX,
        titleTop.y + 64,
        "about",
        {
            fontSize: "38px",
            fontFamily: "Ubuntu",
            color: "#000000",
            stroke: "#ffffff",
            strokeThickness: 4
        }
    );

    titleMiddle.setOrigin(0.5);

    const titleBottom = this.add.text(
        titleX,
        titleMiddle.y + 72,
        "POLYGONS",
        {
            fontSize: "110px",
            fontFamily: "Ubuntu",
            color: "#000000",
            stroke: "#ffffff",
            strokeThickness: 10
        }
    );

    titleBottom.setOrigin(0.5);

    // =================================================
    // ACCOUNT (CORNER)
    // =================================================

    const pad = 24;
    const cornerW = 140;
    const cornerH = 40;
    const cornerX = width - pad - cornerW;
    const cornerY = pad;
    const hasCornerButton = isLoggedIn || isGuest;

    const statusLabel = isLoggedIn
        ? `Signed in as: ${session.username}`
        : isGuest
            ? `Guest: ${guest.profile.name}`
            : "Signed out";

    const statusText = this.add.text(
        hasCornerButton ? cornerX - 16 : width - pad,
        cornerY + cornerH / 2,
        statusLabel,
        {
            fontSize: "22px",
            fontFamily: "Ubuntu",
            color: "#ffffff"
        }
    );

    statusText.setOrigin(1, 0.5);

    if (isLoggedIn) {
        addButton(cornerX, cornerY, cornerW, cornerH, "LOGOUT", "18px", async () => {
            await signOut();
            scene.scene.restart();
        }, 14);
    } else if (isGuest) {
        // Leaves Guest Mode for the normal sign-in flow. The guest save is
        // kept as it is; signing in loads the account's own progression.
        addButton(cornerX, cornerY, cornerW, cornerH, "SIGN IN", "18px", () => {
            variable.identity = "account";
            scene.scene.start("LoginScene");
        }, 14);
    }

    // =================================================
    // LEVEL / XP PROGRESS (same progression logic as in-game, derived from
    // the player's persistent XP — no gameplay/server needed)
    // =================================================

    const barW = 320;
    const barH = 22;
    const barX = width / 2 - barW / 2;
    const barY = height * 0.56;

    const shownXP = isLoggedIn ? session.xp : isGuest ? guest.profile.xp : null;

    if (shownXP != null) {
        const { level, intoLevel, span, progress } = getLevelProgress(shownXP);

        const levelLabel = this.add.text(
            width / 2,
            barY - 30,
            `Level ${level}`,
            {
                fontSize: "28px",
                fontFamily: "Ubuntu",
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 4
            }
        );
        levelLabel.setOrigin(0.5);

        const barBg = this.add.rectangle(barX, barY, barW, barH, 0x222222);
        barBg.setOrigin(0, 0.5);
        barBg.setStrokeStyle(2, 0xffffff, 0.8);

        const barFillW = Math.max(0, Math.min(barW, barW * progress));
        const barFill = this.add.rectangle(barX, barY, barFillW, barH, 0x4a9dff);
        barFill.setOrigin(0, 0.5);

        const xpLabel = this.add.text(
            width / 2,
            barY + 24,
            `${Math.floor(intoLevel)} / ${Math.floor(span)} XP`,
            {
                fontSize: "16px",
                fontFamily: "Ubuntu",
                color: "#cccccc"
            }
        );
        xpLabel.setOrigin(0.5);

        if (isGuest) {
            const notes = {
                unavailable: "This browser can't store data: guest progress will be lost when you close the page.",
                recovered: "Your guest save couldn't be read, so a new one was started (the old data was kept as a backup).",
            };
            const guestNote = this.add.text(
                width / 2,
                barY + 50,
                notes[guest.status] || "Guest progress is saved on this device only.",
                {
                    fontSize: "15px",
                    fontFamily: "Ubuntu",
                    align: "center",
                    wordWrap: { width: Math.min(width - 48, 720) },
                    color: guest.status in notes ? "#ffcc66" : "#999999"
                }
            );
            guestNote.setOrigin(0.5);
        }
    } else {
        const hint = this.add.text(
            width / 2,
            barY,
            "Sign in to save your level to your account, or play as a guest (saved on this device).",
            {
                fontSize: "18px",
                fontFamily: "Ubuntu",
                color: "#999999",
                align: "center",
                wordWrap: { width: Math.min(width - 48, 720) }
            }
        );
        hint.setOrigin(0.5);
    }

    // =================================================
    // BUTTONS
    // =================================================

    const btnH = 70;
    const btnY = height * 0.7;
    const btnGap = 24;

    if (isLoggedIn || isGuest) {
        // Mode choice. PLAY is the existing main mode; FFA is the separate
        // PvP room; XP earned there is added to the same progression.
        const playW = 200;
        const ffaW = 300;
        const rowX = width / 2 - (playW + btnGap + ffaW) / 2;

        const start = (mode) => {
            const identity = isGuest ? "guest" : "account";
            const username = isGuest ? guest.profile.name : session.username;
            const xp = isGuest ? guest.profile.xp : (session.xp || 0);

            variable.identity = identity;
            variable.username = username;
            variable.persistentXP = xp;
            this.scene.start("Game", { mode, identity, username, xp });
        };

        addButton(rowX, btnY, playW, btnH, "PLAY", "42px", () => start(GAME_MODES.MAIN));
        addButton(rowX + playW + btnGap, btnY, ffaW, btnH, "FREE-FOR-ALL", "34px", () => start(GAME_MODES.FFA));

        const ffaHint = this.add.text(
            width / 2,
            btnY + btnH + 18,
            "Free-for-All: fight other players. XP you earn there is added to your level.",
            {
                fontSize: "15px",
                fontFamily: "Ubuntu",
                align: "center",
                wordWrap: { width: Math.min(width - 48, 720) },
                color: "#999999"
            }
        );
        ffaHint.setOrigin(0.5);
    } else {
        const loginW = 250;
        const guestW = 330;
        const rowX = width / 2 - (loginW + btnGap + guestW) / 2;

        addButton(rowX, btnY, loginW, btnH, "LOGIN TO PLAY", "28px", () => {
            this.scene.start("LoginScene");
        });

        addButton(rowX + loginW + btnGap, btnY, guestW, btnH, "CONTINUE AS GUEST", "28px", () => {
            variable.identity = "guest";
            scene.scene.restart();
        });
    }
}

export async function loadHome() {
    let session = { user: null, username: null };

    try {
        session = await getSession();
    } catch (error) {
    }

    if (session.user && !session.username) {
        this.scene.start("LoginScene");
        return;
    }

    createHome.call(this, session);
}
