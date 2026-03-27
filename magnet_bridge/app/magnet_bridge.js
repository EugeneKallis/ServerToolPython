// ==UserScript==
// @name         Magnet Bridge
// @namespace    http://tampermonkey.net/
// @version      104
// @description  Submit magnet links and torrent files to the Magnet Bridge API
// @author       Eugene Kallis
// @match        *://*/*
// @grant        none
// @updateURL    https://{{host}}/api/userscript
// @downloadURL  https://{{host}}/api/userscript
// ==/UserScript==

(function () {
  "use strict";
  const Config = {
    apiBase: "https://{{host}}/api",
    endpoints: { submit: "/{arr}/add" },
    colors: { dl: "#e91e63", dlc: "#2196f3", success: "#4caf50", error: "#f44336", loading: "#9e9e9e" },
    styles: {
      button: `cursor: pointer; margin-left: 8px; font-size: 12px; font-weight: bold; padding: 2px 6px; border-radius: 4px; border: 1px solid currentColor; display: inline-block; text-decoration: none; transition: all 0.2s ease; font-family: sans-serif;`,
      toast: `position: fixed; top: 20px; right: 20px; background: #333; color: #fff; padding: 12px 20px; border-radius: 8px; z-index: 2147483647; box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 350px; word-break: break-word; font-family: sans-serif; font-size: 14px; opacity: 0; transform: translateY(-10px); transition: opacity 0.3s, transform 0.3s;`,
    },
  };

  class Toast {
    static show(message, type = "info", duration = 3000) {
      const el = document.createElement("div");
      el.style.cssText = Config.styles.toast;
      if (type === "success") el.style.borderLeft = `4px solid ${Config.colors.success}`;
      if (type === "error") el.style.borderLeft = `4px solid ${Config.colors.error}`;
      el.innerHTML = message.replace(/\n/g, "<br>");
      document.body.appendChild(el);
      requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translateY(0)"; });
      setTimeout(() => {
        el.style.opacity = "0"; el.style.transform = "translateY(-10px)";
        setTimeout(() => el.remove(), 300);
      }, duration);
    }
  }

  async function submitData(url, arrName, downloadUncached, isFile = false) {
    const endpoint = Config.apiBase + Config.endpoints.submit.replace("{arr}", arrName.toLowerCase());
    const formData = new FormData();
    formData.append("arr", arrName.toLowerCase());
    formData.append("downloadUncached", downloadUncached.toString());
    try {
      if (isFile) {
        Toast.show("Downloading .torrent file...", "info", 2000);
        const fileResp = await fetch(url);
        if (!fileResp.ok) throw new Error("Failed to download torrent file from source");
        const blob = await fileResp.blob();
        const filename = url.split("/").pop().split("?")[0] || "file.torrent";
        formData.append("files", new File([blob], filename));
      } else {
        formData.append("urls", url);
      }
      Toast.show("Sending to Magnet Bridge...", "info", 2000);
      const response = await fetch(endpoint, { method: "POST", body: formData });
      const text = await response.text();
      if (response.ok) { Toast.show(`Successfully submitted to ${arrName}!`, "success"); return true; }
      else { throw new Error(text || "Unknown server error"); }
    } catch (err) { Toast.show(`Failed: ${err.message}`, "error", 5000); return false; }
  }

  function createButton(label, color, onClick) {
    const btn = document.createElement("span");
    btn.textContent = label;
    btn.style.cssText = Config.styles.button;
    btn.style.color = color;
    btn.style.borderColor = color;
    btn.addEventListener("mouseenter", () => { btn.style.backgroundColor = color; btn.style.color = "#fff"; });
    btn.addEventListener("mouseleave", () => { btn.style.backgroundColor = "transparent"; btn.style.color = color; });
    btn.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (btn.dataset.loading === "true") return;
      const originalText = btn.textContent;
      btn.textContent = "..."; btn.style.opacity = "0.7"; btn.style.cursor = "wait"; btn.dataset.loading = "true";
      const success = await onClick();
      btn.dataset.loading = "false"; btn.style.opacity = "1"; btn.style.cursor = "pointer"; btn.textContent = success ? "\u2713" : "\u2717";
      setTimeout(() => { btn.textContent = originalText; }, 2000);
    });
    return btn;
  }

  function injectButtons(containerOrSibling, url, isTorrent) {
      if (containerOrSibling.nextSibling && containerOrSibling.nextSibling.dataset?.tmContainer === "true") return;
      const container = document.createElement("span");
      container.style.whiteSpace = "nowrap";
      container.dataset.tmContainer = "true";
      container.appendChild(createButton("[DL]", Config.colors.dl, () => submitData(url, "special", false, isTorrent)));
      container.appendChild(createButton("[DL-C]", Config.colors.dlc, () => submitData(url, "special", true, isTorrent)));
      if (containerOrSibling.parentNode) containerOrSibling.parentNode.insertBefore(container, containerOrSibling.nextSibling);
  }

  function processLink(link) {
    if (link.dataset.tmProcessed) return;
    link.dataset.tmProcessed = "true";
    const isMagnet = link.href.startsWith("magnet:");
    const isTorrent = link.href.endsWith(".torrent") || link.href.includes(".torrent?");
    if (isMagnet || isTorrent) injectButtons(link, link.href, isTorrent);
  }

  function scanForLinks() { document.querySelectorAll('a[href^="magnet:"], a[href*=".torrent"]').forEach(processLink); }
  scanForLinks();
  const observer = new MutationObserver((m) => { if (m.some(mu => mu.addedNodes.length > 0)) scanForLinks(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();
