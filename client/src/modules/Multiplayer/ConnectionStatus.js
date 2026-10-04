// A small, non-intrusive banner for network state. Deliberately NOT a Phaser
// GameObject: it needs to be visible/consistent across every scene (Home,
// Login, Game) without each one having to wire it up, and it must keep
// working even if the Phaser scene graph itself is in a weird state.
let bannerEl = null;

function ensureBanner() {
    if (bannerEl) {
        return bannerEl;
    }

    bannerEl = document.createElement("div");
    bannerEl.style.cssText = [
        "position:fixed", "top:0", "left:50%", "transform:translateX(-50%)",
        "z-index:99998", "padding:8px 22px", "border-radius:0 0 10px 10px",
        "font-family:Ubuntu, sans-serif", "font-size:14px", "font-weight:500",
        "color:#ffffff", "display:none", "box-shadow:0 2px 10px rgba(0,0,0,0.35)",
        "text-align:center",
    ].join(";");
    document.body.appendChild(bannerEl);
    return bannerEl;
}

const COLORS = {
    info: "#3d9a5a",
    warn: "#d6b43a",
    error: "#c62828",
};

// kind: "info" (e.g. connecting) | "warn" (reconnecting) | "error" (disconnected)
// onClick: optional — shown as a clickable banner (e.g. "click to retry")
export function showConnectionStatus(text, kind = "warn", onClick = null) {
    const el = ensureBanner();
    el.textContent = text;
    el.style.background = COLORS[kind] || COLORS.warn;
    el.style.cursor = onClick ? "pointer" : "default";
    el.onclick = onClick;
    el.style.display = "block";
}

export function hideConnectionStatus() {
    if (bannerEl) {
        bannerEl.style.display = "none";
        bannerEl.onclick = null;
    }
}
