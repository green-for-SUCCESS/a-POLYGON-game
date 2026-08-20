// =====================================================
// HOME SCREEN
// =====================================================

export function createHome() {

    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(0x000000);

    // =================================================
    // TITLE
    // =================================================

    const titleX = width / 2;

    // A GAME
    const titleTop = this.add.text(
        titleX,
        height * 0.5 - 256,
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

    // about
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

    // POLYGONS
    const titleBottom = this.add.text(
        titleX,
        titleMiddle.y + 96,
        "POLYGONS",
        {
            fontSize: "120px",
            fontFamily: "Ubuntu",
            color: "#000000",
            stroke: "#ffffff",
            strokeThickness: 10
        }
    );

    titleBottom.setOrigin(0.5);

    // =================================================
    // PLAY BUTTON
    // =================================================

    const btnW = 220;
    const btnH = 90;
    const btnX = width / 2 - btnW / 2;
    const btnY = titleBottom.y + 320;
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

    const btnHit = this.add
        .rectangle(btnX, btnY, btnW, btnH, 0x000000, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });

    const btnText = this.add
        .text(
            btnX + btnW / 2,
            btnY + btnH / 2,
            "PLAY",
            {
                fontSize: "42px",
                fontFamily: "Ubuntu",
                color: "#ffffff"
            }
        )
        .setOrigin(0.5);

    btnHit.on("pointerdown", () => {
        drawButton(0x1a1a1a);
    });

    btnHit.on("pointerup", () => {
        drawButton(0x222222);
        this.scene.start("Game");
    });

    btnHit.on("pointerout", () => {
        drawButton(0x222222);
    });
}