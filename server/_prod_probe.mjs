import { Client } from "@colyseus/sdk";

const client = new Client("wss://a-polygon-game.onrender.com");

async function main() {
    const room = await client.joinOrCreate("battle", { username: "prodprobe", xp: 0 });
    console.log("joined production room", room.sessionId);

    await new Promise(r => setTimeout(r, 300));

    for (let x = 100; x <= 600; x += 50) {
        room.send("updatePosition", { x, y: 1800, isFastFalling: false });
        await new Promise(r => setTimeout(r, 60));
    }

    await new Promise(r => setTimeout(r, 500));
    const before = room.state.players.get(room.sessionId);
    console.log("player state before slash:", JSON.stringify(before?.toJSON?.() ?? before));
    console.log("does schema even have slashSeq field?:", before && 'slashSeq' in before);

    room.send("slash", { dx: 1, dy: 0 });
    await new Promise(r => setTimeout(r, 500));

    const after = room.state.players.get(room.sessionId);
    console.log("player state after slash:", JSON.stringify(after?.toJSON?.() ?? after));

    room.leave();
    process.exit(0);
}

main().catch((err) => {
    console.error("PROD PROBE FAILED:", err?.message || err);
    process.exit(1);
});
