// Exact XP arithmetic, shared by client and server.
//
// XP can be pushed far past what a JavaScript Number holds exactly
// (Number.MAX_SAFE_INTEGER is about 9.007e15) by developer commands, which
// may set it as high as 10^250. So:
//   - in memory, XP is a BigInt (exact at any size);
//   - over the wire (Colyseus state, messages, XP events) it is a decimal
//     string, which every transport carries exactly;
//   - in saves (Firestore, guest localStorage) it stays a plain number while
//     it fits exactly (every existing account), and becomes a decimal string
//     only above Number.MAX_SAFE_INTEGER.
// Nothing here rounds, truncates or wraps: values are clamped to the caps
// below, never altered otherwise.
//
// Two caps:
//   XP_REGULAR_CAP (10^15): ordinary gameplay (enemy kills, FFA kills, boss
//     rewards) never raises XP beyond this. 10^15 < 2^53, so regular XP is
//     always exactly representable as a Number too.
//   XP_DEV_CAP (10^250): the hard ceiling for any XP value, reachable only
//     through developer commands.

import { SETTINGS } from "./Constants.js";

export const XP_REGULAR_CAP = 10n ** BigInt(SETTINGS.XP_REGULAR_CAP_EXPONENT);
export const XP_DEV_CAP = 10n ** BigInt(SETTINGS.XP_DEV_CAP_EXPONENT);

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const INTEGER_PATTERN = /^\d+$/;
// Plain integers ("1500"), or exact scientific notation with an integer
// value ("1e250", "1.5e3"). Decimals that aren't whole numbers are rejected.
const SCI_PATTERN = /^(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/;

function clamp(value, cap) {
    if (value < 0n) {
        return 0n;
    }
    return value > cap ? cap : value;
}

// More significant digits than this is certainly above XP_DEV_CAP (which
// has XP_DEV_CAP_EXPONENT + 1 digits); such input is reported as "above the
// cap" WITHOUT converting it, because BigInt parsing is superlinear and join
// options come from unauthenticated clients (a multi-megabyte digit string
// would otherwise stall the server's event loop for seconds).
const MAX_SIGNIFICANT_DIGITS = SETTINGS.XP_DEV_CAP_EXPONENT + 10;

// Parses a decimal integer or exact integer-valued scientific notation.
// Returns a BigInt, or null if the text isn't a non-negative whole number.
function parseDecimalText(text) {
    const s = String(text).trim();
    if (INTEGER_PATTERN.test(s)) {
        const significant = s.replace(/^0+/, "");
        if (significant.length > MAX_SIGNIFICANT_DIGITS) {
            return XP_DEV_CAP + 1n;
        }
        return BigInt(significant || "0");
    }
    const m = SCI_PATTERN.exec(s);
    if (!m) {
        return null;
    }
    const [, whole, fraction = "", expText] = m;
    if (whole.length + fraction.length > MAX_SIGNIFICANT_DIGITS * 2) {
        return /[1-9]/.test(whole) || /[1-9]/.test(fraction) ? XP_DEV_CAP + 1n : 0n;
    }
    const exponent = Number(expText);
    // Far beyond any cap: report "above the cap" without building an
    // enormous BigInt (callers clamp or reject it).
    if (!Number.isSafeInteger(exponent) || exponent > 1000) {
        return /[1-9]/.test(whole + fraction) ? XP_DEV_CAP + 1n : 0n;
    }
    // value = (whole followed by fraction digits) * 10^(exponent - fraction.length)
    if (exponent >= fraction.length) {
        return BigInt(whole + fraction) * 10n ** BigInt(exponent - fraction.length);
    }
    if (/[1-9]/.test(fraction.slice(exponent))) {
        return null; // e.g. "1.25e1" = 12.5, not a whole number
    }
    return BigInt(whole + fraction.slice(0, exponent));
}

// Lenient conversion for values that come from saves, the server or the
// schema: anything invalid (NaN, negative, garbage) becomes 0, anything above
// the dev cap is clamped to it. Accepts BigInt, number or decimal string.
export function toXP(value, cap = XP_DEV_CAP) {
    if (typeof value === "bigint") {
        return clamp(value, cap);
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            return value > 0 ? cap : 0n;
        }
        if (value <= 0) {
            return 0n;
        }
        // BigInt(double) is exact for the double's own value.
        return clamp(BigInt(Math.floor(value)), cap);
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = parseDecimalText(value);
        if (parsed !== null) {
            return clamp(parsed, cap);
        }
        // Legacy saves may hold a Number written as text (e.g. "1.5e+300").
        return toXP(Number(value), cap);
    }
    return 0n;
}

// Strict parsing for developer-command arguments: rejects negatives,
// non-numbers, non-whole numbers and anything above XP_DEV_CAP instead of
// silently clamping. Returns { ok: true, value } or { ok: false, error }.
export function parseXPInput(text) {
    const s = typeof text === "number" ? String(text) : String(text ?? "").trim();
    if (s === "") {
        return { ok: false, error: "Missing amount." };
    }
    if (s.startsWith("-")) {
        return { ok: false, error: "Amount cannot be negative." };
    }
    const value = parseDecimalText(s);
    if (value === null) {
        return { ok: false, error: `"${s.length > 40 ? s.slice(0, 40) + "…" : s}" is not a whole number.` };
    }
    if (value > XP_DEV_CAP) {
        return { ok: false, error: "Amount is above the maximum of 10^" + SETTINGS.XP_DEV_CAP_EXPONENT + "." };
    }
    return { ok: true, value };
}

export function xpToString(value) {
    return toXP(value).toString();
}

// The form used in saves: a Number while it is exact, a decimal string above.
export function xpToStorage(value) {
    const xp = toXP(value);
    return xp <= MAX_SAFE ? Number(xp) : xp.toString();
}

// Adds an ordinary gameplay reward. XP already at or above XP_REGULAR_CAP
// gains nothing; otherwise the result is clamped to the cap. Returns the new
// XP and how much was actually added (both BigInt).
export function addRegularXP(current, reward) {
    const xp = toXP(current);
    const amount = toXP(reward);
    if (xp >= XP_REGULAR_CAP || amount === 0n) {
        return { xp, added: 0n };
    }
    const next = xp + amount > XP_REGULAR_CAP ? XP_REGULAR_CAP : xp + amount;
    return { xp: next, added: next - xp };
}

// Display formatting: exact digits up to 15 of them, then compact scientific
// notation ("1.23e+249") so a huge value can't blow up the HUD.
export function formatXP(value) {
    const s = toXP(value).toString();
    if (s.length <= 15) {
        return s;
    }
    return `${s[0]}.${s.slice(1, 3)}e+${s.length - 1}`;
}

// a / b as a Number in [0, 1] (for progress bars), exact enough for display.
export function xpRatio(a, b) {
    const num = toXP(a);
    const den = toXP(b);
    if (den === 0n) {
        return 1;
    }
    if (num >= den) {
        return 1;
    }
    return Number((num * 1_000_000n) / den) / 1_000_000;
}
