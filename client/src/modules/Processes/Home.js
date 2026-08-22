import { getSession, signOut } from "../Multiplayer/FirebaseInit.js";

// =====================================================
// HOME SCREEN
// =====================================================

export function createHome(session) {

    const isLoggedIn = Boolean(session?.username);
    const { width, height } = this.scale;
    const scene = this;

    this.cameras.main.setBackgroundColor(0x000000);

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
        height * 0.345,
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
        height * 0.405,
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

    if (isLoggedIn) {

        const pad = 24;
        const logoutW = 140;
        const logoutH = 40;
        const logoutX = width - pad - logoutW;
        const logoutY = pad;

        const usernameText = this.add.text(
            logoutX - 16,
            logoutY + logoutH / 2,
            session.username,
            {
                fontSize: "22px",
                fontFamily: "Ubuntu",
                color: "#ffffff"
            }
        );

        usernameText.setOrigin(1, 0.5);

        const logoutBg = this.add.graphics();

        function drawLogout(color) {
            logoutBg.clear();
            logoutBg.fillStyle(color, 0.95);
            logoutBg.fillRoundedRect(logoutX, logoutY, logoutW, logoutH, 14);
            logoutBg.lineStyle(2, 0xffffff, 1);
            logoutBg.strokeRoundedRect(logoutX, logoutY, logoutW, logoutH, 14);
        }

        drawLogout(0x222222);

        const logoutHit = this.add.rectangle(
            logoutX,
            logoutY,
            logoutW,
            logoutH,
            0x000000,
            0
        );

        logoutHit
            .setOrigin(0)
            .setInteractive({ useHandCursor: true });

        const logoutText = this.add.text(
            logoutX + logoutW / 2,
            logoutY + logoutH / 2,
            "LOG OUT",
            {
                fontSize: "18px",
                fontFamily: "Ubuntu",
                color: "#ffffff"
            }
        );

        logoutText.setOrigin(0.5);

        logoutHit.on("pointerdown", () => {
            drawLogout(0x1a1a1a);
        });

        logoutHit.on("pointerout", () => {
            drawLogout(0x222222);
        });

        logoutHit.on("pointerup", async () => {
            drawLogout(0x222222);
            await signOut();
            scene.scene.restart();
        });
    }

    // =================================================
    // PLAY / LOGIN BUTTON
    // =================================================

    const btnW = 300;
    const btnH = 70;
    const btnX = width / 2 - btnW / 2;
    const btnY = height * 0.55;
    const btnRadius = 20;

    const btnBg = this.add.graphics();

    function drawButton(color) {

        btnBg.clear();

        btnBg.fillStyle(color, 0.95);

        btnBg.fillRoundedRect(
            btnX,
            btnY,
            btnW,
            btnH,
            btnRadius
        );

        btnBg.lineStyle(3, 0xffffff, 1);

        btnBg.strokeRoundedRect(
            btnX,
            btnY,
            btnW,
            btnH,
            btnRadius
        );
    }

    drawButton(0x222222);

    const btnHit = this.add.rectangle(
        btnX,
        btnY,
        btnW,
        btnH,
        0x000000,
        0
    );

    btnHit
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });

    const btnText = this.add.text(
        btnX + btnW / 2,
        btnY + btnH / 2,
        isLoggedIn ? "PLAY" : "LOGIN TO PLAY",
        {
            fontSize: "28px",
            fontFamily: "Ubuntu",
            color: "#ffffff"
        }
    );

    btnText.setOrigin(0.5);

    btnHit.on("pointerdown", () => {
        drawButton(0x1a1a1a);
    });

    btnHit.on("pointerout", () => {
        drawButton(0x222222);
    });

    btnHit.on("pointerup", () => {

        drawButton(0x222222);

        if (isLoggedIn) {
            this.scene.start("Game");
        } else {
            this.scene.start("LoginScene");
        }
    });
}

export async function loadHome() {
    let session = { user: null, username: null };

    try {
        session = await getSession();
    } catch (error) {
        console.error(error);
    }

    createHome.call(this, session);
}
