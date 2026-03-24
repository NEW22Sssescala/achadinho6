import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

declare global {
  interface Window {
    __ANTI_COPY_ALLOW_RENDER__?: boolean;
  }
}

if (typeof window !== "undefined") {
  window.__ANTI_COPY_ALLOW_RENDER__ = true;

  const hostname = window.location.hostname;
  const isInIframe = window.self !== window.top;
  const isAdminRoute = window.location.pathname.startsWith("/admin");
  const isLovablePreview =
    hostname.includes("id-preview--") &&
    (hostname.includes("lovable.app") || hostname.includes("lovableproject.com"));
  const shouldBypassProtection = isInIframe || isAdminRoute || isLovablePreview;

  const matchesQuery = (query: string) => {
    try {
      return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
    } catch {
      return false;
    }
  };

  const applyLightProtections = () => {
    document.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("keydown", (e) => {
      const key = e.key.toLowerCase();
      const isBlockedShortcut =
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) && key === "u") ||
        ((e.ctrlKey || e.metaKey) && key === "s") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(key));

      if (isBlockedShortcut) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    const style = document.createElement("style");
    style.textContent = `
      * {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
        -webkit-user-drag: none !important;
      }
      input, textarea, [contenteditable="true"] {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
      img {
        pointer-events: none !important;
        -webkit-user-drag: none !important;
      }
    `;
    document.head.appendChild(style);

    document.addEventListener("dragstart", (e) => {
      if (e.target instanceof HTMLImageElement) {
        e.preventDefault();
      }
    });
  };

  if (!shouldBypassProtection) {
    applyLightProtections();

    const userAgent = navigator.userAgent || "";
    const platform = navigator.platform || "";
    const maxTouchPoints = navigator.maxTouchPoints || 0;
    const coarsePointer = matchesQuery("(pointer: coarse)");
    const finePointerOnly = matchesQuery("(pointer: fine)") && !matchesQuery("(any-pointer: coarse)");
    const hoverOnly = matchesQuery("(hover: hover)") && !matchesQuery("(any-hover: none)");

    const mobileOrTabletUA =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|CriOS|FxiOS|Windows Phone|Tablet|Silk|Kindle|PlayBook|BB10|SamsungBrowser|Samsung|Xiaomi|Redmi|POCO|Mi |Huawei|Honor|OPPO|Realme|Vivo|OnePlus|Motorola|Nokia|LG|Sony|Asus|ZTE|Meizu|Lenovo|Alcatel|Infinix|Tecno|HTC|Pixel|Nothing|Fairphone/i.test(userAgent);
    const ipadOsDevice = platform === "MacIntel" && maxTouchPoints > 1;

    let uaDataMobile = false;
    try {
      uaDataMobile = Boolean((navigator as any).userAgentData?.mobile);
    } catch { uaDataMobile = false; }

    // Desktop = NO mobile UA + NO touch + fine pointer only + hover capable
    const isDefinitelyDesktop =
      !mobileOrTabletUA &&
      !ipadOsDevice &&
      !uaDataMobile &&
      maxTouchPoints === 0 &&
      !coarsePointer &&
      finePointerOnly &&
      hoverOnly;

    const deviceType = isDefinitelyDesktop ? "desktop" : "mobile";

    // Log access attempt to database
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (supabaseUrl && supabaseKey) {
        fetch(`${supabaseUrl}/rest/v1/access_logs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            device_type: deviceType,
            user_agent: userAgent.slice(0, 500),
            platform,
            screen_width: window.screen.width,
            screen_height: window.screen.height,
            max_touch_points: maxTouchPoints,
            blocked: false,
            page_url: window.location.pathname,
          }),
        }).catch(() => {});
      }
    } catch {}
  }

  console.log("%c⚠️ PARE!", "color:red;font-size:60px;font-weight:bold;");
  console.log(
    "%cEste site é protegido por direitos autorais. Copiar, reproduzir ou distribuir qualquer conteúdo sem autorização é crime previsto na Lei 9.610/98.",
    "color:red;font-size:16px;",
  );
}

const rootElement = document.getElementById("root");

if (rootElement && window.__ANTI_COPY_ALLOW_RENDER__ !== false) {
  createRoot(rootElement).render(<App />);
}
