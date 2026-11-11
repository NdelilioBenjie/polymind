import { App, setPlatform, type PageContext, type QuickAction } from "@polymind/app";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PENDING_KEY, TOOLBAR_KEY, type PageReply, type PendingAction, type ReadPageMessage } from "./messages";

/** Address of the deployed Polymind site, set at build time (see .env.example). */
const API_BASE = (import.meta.env.VITE_POLYMIND_API ?? "").replace(/\/+$/, "");

async function readActiveTab(): Promise<PageContext | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) return null;
  try {
    const message: ReadPageMessage = { type: "polymind:read-page" };
    const reply = (await chrome.tabs.sendMessage(tab.id, message, { frameId: 0 })) as PageReply | undefined;
    return reply ?? null;
  } catch {
    // No content script there: a browser page, the Web Store, or a tab opened before install.
    return null;
  }
}

function onQuickAction(listener: (action: QuickAction) => void): () => void {
  const deliver = (pending: PendingAction | undefined) => {
    if (!pending || Date.now() - pending.at > 30_000) return;
    void chrome.storage.session.remove(PENDING_KEY);
    listener({ kind: pending.kind, text: pending.text, source: pending.source });
  };

  // An action may already be waiting if it was what opened the panel.
  void chrome.storage.session.get(PENDING_KEY).then((stored) => deliver(stored[PENDING_KEY] as PendingAction));

  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "session" && changes[PENDING_KEY]?.newValue) deliver(changes[PENDING_KEY].newValue as PendingAction);
  };
  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
}

setPlatform({
  kind: "extension",
  apiBase: API_BASE,
  readActiveTab,
  onQuickAction,
  selectionToolbar: {
    get: async () => (await chrome.storage.local.get(TOOLBAR_KEY))[TOOLBAR_KEY] !== false,
    set: (enabled) => chrome.storage.local.set({ [TOOLBAR_KEY]: enabled }),
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
