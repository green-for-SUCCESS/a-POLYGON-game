import { Client } from "@colyseus/sdk";

const client = new Client("ws://localhost:2567");

async function main() {
    const room = await client.joinOrCreate("battle", { username: "probe", xp: 0 });
    console.log("joined", room.sessionId);

    room.onMessage("*", (type, data) => {
        console.log("MSG <-", type, JSON.stringify(data));
    });

    await new Promise(r => setTimeout(r, 300));

    // Walk out of the spawn zone (SPAWN_ZONE_WIDTH = 500) so spawnExited flips true,
    // exactly like the real client's Update.js "updatePosition" loop does every frame.
    for (let x = 100; x <= 600; x += 50) {
        room.send("updatePosition", { x, y: 1800, isFastFalling: false });
        await new Promise(r => setTimeout(r, 60));
    }

    await new Promise(r => setTimeout(r, 300));
    console.log("player state before slash:", JSON.stringify(room.state.players.get(room.sessionId)?.toJSON?.() ?? room.state.players.get(room.sessionId)));
    console.log("enemy count:", room.state.enemies.length);

    // Send a slash straight to the right, exactly the shape the real client sends.
    console.log(">>> sending slash dx=1 dy=0");
    room.send("slash", { dx: 1, dy: 0 });

    await new Promise(r => setTimeout(r, 200));
    const p1 = room.state.players.get(room.sessionId);
    console.log("slashSeq after click 1:", p1?.slashSeq, "cooldownActive expected true");

    console.log(">>> sending second slash immediately (should be rejected by cooldown)");
    room.send("slash", { dx: 0, dy: -1 });
    await new Promise(r => setTimeout(r, 200));
    const p2 = room.state.players.get(room.sessionId);
    console.log("slashSeq after click 2 (expect unchanged if cooldown active):", p2?.slashSeq);

    room.leave();
    process.exit(0);
}

main().catch((err) => {
    console.error("PROBE FAILED:", err);
    process.exit(1);
});
