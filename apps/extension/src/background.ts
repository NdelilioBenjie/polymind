import { MAX_SELECTION_CHARS, PENDING_KEY, type PendingAction, type QuickActionMessage } from "./messages";

const MENU_ID = "polymind-ask";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Ask Polymind about “%s”",
    contexts: ["selection"],
  });
});

/** Opens the side panel and leaves the action where the panel will find it.
 *  `sidePanel.open` must run inside the user gesture, so it is called first
 *  and never awaited behind other work. */
function hand(tabId: number, action: Omit<PendingAction, "at">) {
  void chrome.sidePanel.open({ tabId }).catch(() => undefined);
  const pending: PendingAction = { ...action, text: action.text.slice(0, MAX_SELECTION_CHARS), at: Date.now() };
  void chrome.storage.session.set({ [PENDING_KEY]: pending });
}

chrome.runtime.onMessage.addListener((message: QuickActionMessage, sender) => {
  if (message?.type !== "polymind:quick-action" || sender.tab?.id === undefined) return;
  hand(sender.tab.id, { kind: message.kind, text: message.text, source: message.source });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText || tab?.id === undefined) return;
  hand(tab.id, {
    kind: "ask",
    text: info.selectionText,
    source: { title: tab.title ?? "", url: info.pageUrl ?? tab.url ?? "" },
  });
});
