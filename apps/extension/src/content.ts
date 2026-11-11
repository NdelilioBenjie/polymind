/** Runs on every page. Two jobs: hand the page's text to the side panel when
 *  asked, and show a small toolbar next to selected text. Kept dependency-free
 *  and inside a closed shadow root so it cannot clash with the host page. */
import type { ActionKind, PageReply, QuickActionMessage, ReadPageMessage } from "./messages";

(() => {
  const MAX_PAGE_CHARS = 20_000;
  const TOOLBAR_KEY = "polymind.selectionToolbar";
  const ACTIONS: Array<[ActionKind, string]> = [
    ["explain", "Explain"],
    ["summarise", "Summarise"],
    ["rewrite", "Rewrite"],
    ["translate", "Translate"],
  ];

  // ── Page reader ──────────────────────────────────────────────────────────
  function readPage(): PageReply {
    const root =
      document.querySelector<HTMLElement>("article, main, [role='main']") ?? document.body ?? document.documentElement;
    const text = (root.innerText || document.body?.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
    return {
      title: document.title || location.hostname,
      url: location.href,
      text: text.slice(0, MAX_PAGE_CHARS),
      truncated: text.length > MAX_PAGE_CHARS,
    };
  }

  chrome.runtime.onMessage.addListener((message: ReadPageMessage, _sender, reply) => {
    if (message?.type !== "polymind:read-page") return;
    reply(readPage());
  });

  // Only the top frame gets a toolbar.
  if (window.top !== window) return;

  // ── Selection toolbar ────────────────────────────────────────────────────
  let enabled = true;
  let host: HTMLElement | null = null;
  let bar: HTMLElement | null = null;

  chrome.storage.local.get(TOOLBAR_KEY).then((stored) => {
    enabled = stored[TOOLBAR_KEY] !== false;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(TOOLBAR_KEY in changes)) return;
    enabled = changes[TOOLBAR_KEY].newValue !== false;
    if (!enabled) hide();
  });

  function build(): HTMLElement {
    host = document.createElement("polymind-toolbar");
    host.style.cssText = "all: initial; position: absolute; top: 0; left: 0; z-index: 2147483647;";
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      .bar {
        position: absolute; display: none; align-items: center; gap: 2px;
        padding: 4px; border-radius: 999px; white-space: nowrap;
        background: #161a30; color: #eef0fb;
        font: 500 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
        box-shadow: 0 1px 2px rgb(0 0 0 / .2), 0 12px 28px -10px rgb(10 12 31 / .55);
      }
      .bar[data-open] { display: flex; animation: in .14s ease-out; }
      @keyframes in { from { opacity: 0; transform: translateY(4px); } }
      @media (prefers-reduced-motion: reduce) { .bar[data-open] { animation: none; } }
      .mark { display: flex; padding: 0 4px 0 6px; }
      button {
        all: unset; cursor: pointer; padding: 7px 10px; border-radius: 999px;
        font: inherit; color: inherit;
      }
      button:hover { background: rgb(255 255 255 / .14); }
      button:focus-visible { outline: 2px solid #8792ff; outline-offset: 1px; }
    `;

    bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Polymind actions for the selected text");

    const mark = document.createElement("span");
    mark.className = "mark";
    mark.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true" style="isolation:isolate">' +
      '<circle cx="11.5" cy="12" r="8.5" fill="#ff6b8e"/>' +
      '<circle cx="20.5" cy="12" r="8.5" fill="#5cb3ff" style="mix-blend-mode:screen"/>' +
      '<circle cx="16" cy="20" r="8.5" fill="#f5b638" style="mix-blend-mode:screen"/></svg>';
    bar.append(mark);

    for (const [kind, label] of ACTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      // mousedown would clear the selection before the click lands.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => run(kind));
      bar.append(button);
    }

    shadow.append(style, bar);
    document.documentElement.append(host);
    return bar;
  }

  function selectedText(): string {
    return window.getSelection()?.toString().trim() ?? "";
  }

  function isEditable(node: Node | null): boolean {
    const element = node instanceof Element ? node : node?.parentElement;
    return !!element?.closest("input, textarea, [contenteditable=''], [contenteditable='true']");
  }

  function show() {
    const selection = window.getSelection();
    if (!enabled || !selection || selection.rangeCount === 0 || selection.isCollapsed) return hide();
    if (selectedText().length < 3 || isEditable(selection.anchorNode)) return hide();

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return hide();

    const element = bar ?? build();
    element.setAttribute("data-open", "");
    const { width, height } = element.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, margin),
      document.documentElement.clientWidth - width - margin,
    );
    const above = rect.top - height - margin;
    const top = above > margin ? above : rect.bottom + margin;
    element.style.left = `${left + window.scrollX}px`;
    element.style.top = `${top + window.scrollY}px`;
  }

  function hide() {
    bar?.removeAttribute("data-open");
  }

  function run(kind: ActionKind) {
    const text = selectedText();
    if (!text) return hide();
    const message: QuickActionMessage = {
      type: "polymind:quick-action",
      kind,
      text,
      source: { title: document.title, url: location.href },
    };
    // After an extension update the old content script loses its connection.
    chrome.runtime.sendMessage(message).catch(() => undefined);
    hide();
  }

  document.addEventListener("mouseup", (event) => {
    if (host && event.composedPath().includes(host)) return;
    setTimeout(show, 10);
  });
  document.addEventListener("keyup", (event) => {
    if (event.shiftKey || event.key === "Shift") setTimeout(show, 10);
  });
  document.addEventListener("mousedown", (event) => {
    if (host && event.composedPath().includes(host)) return;
    hide();
  });
  document.addEventListener("scroll", hide, { passive: true, capture: true });
  document.addEventListener("keydown", (event) => event.key === "Escape" && hide());
})();
