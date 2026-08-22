import {
    signInWithGoogle,
    getSession,
    claimUsername,
    validateUsername
} from "../Multiplayer/FirebaseConfig.js";

// =====================================================
// LOGIN SCREEN
// =====================================================

export function createLogin() {

    const { width, height } = this.scale;
    const scene = this;

    this.cameras.main.setBackgroundColor(0x000000);

    // =================================================
    // TITLE
    // =================================================

    const title = this.add.text(
        width / 2,
        height * 0.22,
        "LOGIN",
        {
            fontSize: "72px",
            fontFamily: "Ubuntu",
            color: "#000000",
            stroke: "#ffffff",
            strokeThickness: 6
        }
    );

    title.setOrigin(0.5);

    // =================================================
    // BUTTON SETTINGS
    // =================================================

    const btnW = 360;
    const btnH = 70;
    const btnRadius = 20;
    const btnGap = 20;

    const btnX = width / 2 - btnW / 2;
    const firstY = height * 0.38;

    const ui = [];
    const htmlCleanup = [];

    function clearUi() {
        ui.forEach((obj) => {
            if (obj && obj.destroy) {
                obj.destroy();
            }
        });

        ui.length = 0;

        htmlCleanup.forEach((fn) => fn());
        htmlCleanup.length = 0;
    }

    function setStatus(message, color = "#ff6666") {
        const status = scene.add.text(
            width / 2,
            height * 0.84,
            message,
            {
                fontSize: "20px",
                fontFamily: "Ubuntu",
                color
            }
        );

        status.setOrigin(0.5);
        ui.push(status);

        return status;
    }

    // =================================================
    // BUTTON CREATOR
    // =================================================

    function createButton(y, text, callback) {

        const bg = scene.add.graphics();

        function drawButton(color) {

            bg.clear();

            bg.fillStyle(color, 0.95);

            bg.fillRoundedRect(
                btnX,
                y,
                btnW,
                btnH,
                btnRadius
            );

            bg.lineStyle(3, 0xffffff, 1);

            bg.strokeRoundedRect(
                btnX,
                y,
                btnW,
                btnH,
                btnRadius
            );
        }

        drawButton(0x222222);

        const hit = scene.add.rectangle(
            btnX,
            y,
            btnW,
            btnH,
            0x000000,
            0
        );

        hit
            .setOrigin(0)
            .setInteractive({ useHandCursor: true });

        const label = scene.add.text(
            btnX + btnW / 2,
            y + btnH / 2,
            text,
            {
                fontSize: "28px",
                fontFamily: "Ubuntu",
                color: "#ffffff"
            }
        );

        label.setOrigin(0.5);

        hit.on("pointerdown", () => {
            drawButton(0x1a1a1a);
        });

        hit.on("pointerout", () => {
            drawButton(0x222222);
        });

        hit.on("pointerup", () => {
            drawButton(0x222222);
            callback();
        });

        ui.push(bg, hit, label);

        return {
            bg,
            hit,
            label
        };
    }

    // =================================================
    // USERNAME (NEW ACCOUNTS)
    // =================================================

    function showUsernameForm(user) {

        clearUi();

        title.setText("CHOOSE A USERNAME");

        const wrap = document.createElement("div");
        wrap.style.cssText = [
            "position:fixed",
            "left:50%",
            `top:${height * 0.42}px`,
            "transform:translate(-50%,-50%)",
            "z-index:30"
        ].join(";");

        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 16;
        input.placeholder = "Enter a username";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.style.cssText = [
            "width:360px",
            "height:56px",
            "box-sizing:border-box",
            "font-size:24px",
            "font-family:Ubuntu,sans-serif",
            "text-align:center",
            "background:#222222",
            "color:#ffffff",
            "border:3px solid #ffffff",
            "border-radius:20px",
            "outline:none",
            "padding:0 16px"
        ].join(";");

        wrap.appendChild(input);
        document.body.appendChild(wrap);
        htmlCleanup.push(() => wrap.remove());
        input.focus();

        let busy = false;
        let status = setStatus("");

        async function submitUsername() {
            if (busy) {
                return;
            }

            const username = input.value.trim();
            const invalid = validateUsername(username);

            if (invalid) {
                status.setText(invalid);
                return;
            }

            busy = true;
            status.setColor("#ffffff");
            status.setText("Saving...");

            try {
                await claimUsername(user.uid, username);
                clearUi();
                scene.scene.start("Home");
            } catch (error) {
                busy = false;
                status.setColor("#ff6666");
                status.setText(error.message || "Could not save username.");
            }
        }

        createButton(
            firstY + btnH + btnGap,
            "CONFIRM",
            () => {
                submitUsername();
            }
        );

        createButton(
            firstY + (btnH + btnGap) * 2,
            "BACK",
            () => {
                clearUi();
                scene.scene.start("Home");
            }
        );

        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                submitUsername();
            }
        });
    }

    // =================================================
    // PROVIDERS
    // =================================================

    function showProviders() {

        clearUi();

        title.setText("LOGIN");

        let busy = false;
        const status = setStatus("");

        createButton(
            firstY,
            "LOGIN WITH GOOGLE",
            async () => {
                if (busy) {
                    return;
                }

                busy = true;
                status.setColor("#ffffff");
                status.setText("Signing in...");

                try {
                    const session = await signInWithGoogle();

                    if (session.redirecting) {
                        return;
                    }

                    if (!session.username) {
                        showUsernameForm(session.user);
                        return;
                    }

                    clearUi();
                    scene.scene.start("Home");
                } catch (error) {
                    busy = false;
                    status.setColor("#ff6666");
                    if (error.code === "auth/popup-closed-by-user") {
                        status.setText("Login cancelled.");
                    } else {
                        status.setText(error.message || "Google sign-in failed.");
                    }
                }
            }
        );

        createButton(
            firstY + btnH + btnGap,
            "LOGIN WITH FACEBOOK",
            () => {
                status.setColor("#ff6666");
                status.setText("Facebook login is not set up yet.");
            }
        );

        createButton(
            firstY + (btnH + btnGap) * 2,
            "LOGIN WITH DISCORD",
            () => {
                status.setColor("#ff6666");
                status.setText("Discord login is not set up yet.");
            }
        );

        createButton(
            firstY + (btnH + btnGap) * 3,
            "BACK",
            () => {
                scene.scene.start("Home");
            }
        );
    }

    showProviders();

    getSession()
        .then((session) => {
            if (session.user && !session.username) {
                showUsernameForm(session.user);
            }
        })
        .catch((error) => {
            console.error(error);
        });

    this.events.once("shutdown", clearUi);
    this.events.once("destroy", clearUi);
}
