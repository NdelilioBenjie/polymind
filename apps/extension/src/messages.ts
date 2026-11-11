/** Message contract between the content script, the service worker and the side panel. */

export type ActionKind = "explain" | "summarise" | "rewrite" | "translate" | "ask";

export interface QuickActionMessage {
  type: "polymind:quick-action";
  kind: ActionKind;
  text: string;
  source: { title: string; url: string };
}

export interface ReadPageMessage {
  type: "polymind:read-page";
}

export interface PageReply {
  title: string;
  url: string;
  text: string;
  truncated: boolean;
}

/** A quick action waiting for the side panel to pick it up. */
export interface PendingAction {
  kind: ActionKind;
  text: string;
  source: { title: string; url: string };
  at: number;
}

export const PENDING_KEY = "polymind.pendingAction";
export const TOOLBAR_KEY = "polymind.selectionToolbar";
export const MAX_PAGE_CHARS = 20_000;
export const MAX_SELECTION_CHARS = 8_000;
