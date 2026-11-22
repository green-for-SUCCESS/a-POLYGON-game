// Process health for the /health endpoints and startup logging.
//
// Deliberately cheap: no database or Firebase calls, no room inspection
// beyond counters, so a health probe can never be what slows the server down.
// It also measures event-loop delay, because the failure mode this server
// has actually had is a busy event loop (the process is up and the port is
// open, but requests are never serviced), not a crash.
import { monitorEventLoopDelay } from "node:perf_hooks";

const startedAt = Date.now();
let ready = false;

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

let lastWindow = { meanMs: 0, p99Ms: 0, maxMs: 0 };

function sampleLoopDelay() {
    lastWindow = {
        meanMs: Math.round(loopDelay.mean / 1e6),
        p99Ms: Math.round(loopDelay.percentile(99) / 1e6),
        maxMs: Math.round(loopDelay.max / 1e6),
    };
    loopDelay.reset();

    if (lastWindow.p99Ms > 1000) {
        console.warn(
            `[health] Event loop is overloaded: p99 delay ${lastWindow.p99Ms}ms, max ${lastWindow.maxMs}ms over the last minute.`
        );
    }
}

// Once a minute; unref'd so it never keeps the process alive on its own.
setInterval(sampleLoopDelay, 60_000).unref();

export function markReady() {
    ready = true;
}

export function isReady() {
    return ready;
}

export function getHealth() {
    const memory = process.memoryUsage();
    return {
        status: ready ? "ok" : "starting",
        ready,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        eventLoopDelayLastMinute: lastWindow,
        memoryMB: {
            rss: Math.round(memory.rss / 1048576),
            heapUsed: Math.round(memory.heapUsed / 1048576),
        },
    };
}
