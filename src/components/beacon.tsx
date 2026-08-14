"use client";

import { useEffect } from "react";

// Fires once the page executes JavaScript in a real/headless browser. Visitors
// that fetch the HTML but never trigger this are pure-HTTP fetchers — a key
// signal separating browser-driven agents from script-driven ones.
export function Beacon() {
  useEffect(() => {
    const payload = JSON.stringify({
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });
    fetch("/api/beacon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }, []);
  return null;
}
