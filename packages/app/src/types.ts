export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  description: string;
  contextLength: number;
  promptPrice: number;
  completionPrice: number;
  free: boolean;
  vision: boolean;
  created: number;
  available: boolean;
  tier: "free" | "premium" | "locked";
}

export interface Catalogue {
  mode: "live" | "demo";
  access: "free" | "allowance" | "all";
  allowance?: { perDay: number };
  source: "openrouter" | "sample";
  maxModelsPerPrompt: number;
  models: ModelInfo[];
}

export interface PageContext {
  title: string;
  url: string;
  text: string;
  truncated?: boolean;
}

export type AnswerStatus = "waiting" | "streaming" | "done" | "error" | "stopped";

export interface Answer {
  id: string;
  modelId: string;
  /** Display name captured when the answer was requested. */
  modelName: string;
  content: string;
  status: AnswerStatus;
  error?: string;
  /** Milliseconds until the first token, and until the answer finished. */
  firstTokenMs?: number;
  totalMs?: number;
  simulated?: boolean;
}

export interface Turn {
  id: string;
  /** What the user sees as their question. */
  prompt: string;
  /** What is sent to the models when it differs from the visible prompt. */
  instruction?: string;
  answers: Answer[];
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  turns: Turn[];
  page?: PageContext;
  createdAt: number;
  updatedAt: number;
}

export interface SavedPrompt {
  id: string;
  title: string;
  body: string;
  builtin?: boolean;
}

export type QuickActionKind = "explain" | "summarise" | "rewrite" | "translate" | "ask";

export interface QuickAction {
  kind: QuickActionKind;
  text: string;
  source?: { title: string; url: string };
}

export type ThemeChoice = "system" | "light" | "dark";

/** Everything that differs between the web app and the browser extension. */
export interface Platform {
  kind: "web" | "extension";
  /** Origin of the Polymind API, without a trailing slash. Empty means same origin. */
  apiBase: string;
  /** Extension only: read the tab the user is looking at. */
  readActiveTab?: () => Promise<PageContext | null>;
  /** Extension only: receive actions triggered from text selected on a page. */
  onQuickAction?: (listener: (action: QuickAction) => void) => () => void;
  /** Extension only: the floating toolbar shown next to selected text. */
  selectionToolbar?: { get: () => Promise<boolean>; set: (enabled: boolean) => Promise<void> };
}
