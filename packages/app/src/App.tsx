import { PanelLeft, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Composer } from "./components/Composer";
import { LinkDialog } from "./components/LinkDialog";
import { Logo } from "./components/Logo";
import { ModelPicker } from "./components/ModelPicker";
import { PromptLibrary } from "./components/PromptLibrary";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { TurnView } from "./components/TurnView";
import { Welcome } from "./components/Welcome";
import { buildQuickAction } from "./lib/prompts";
import { getPlatform, usePolymind } from "./store";
import type { QuickAction } from "./types";

type DialogName = "models" | "prompts" | "link" | "settings" | null;

const CANNOT_READ = "Polymind can't read this tab. Reload the page and try again.";

function useTheme() {
  const theme = usePolymind((state) => state.theme);
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

export function App() {
  const platform = getPlatform();
  const conversation = usePolymind((state) => state.conversations.find((c) => c.id === state.activeId));
  const catalogue = usePolymind((state) => state.catalogue);
  const ready = usePolymind((state) => state.catalogueStatus === "ready");
  const allowanceLeft = usePolymind((state) => state.allowanceRemaining);
  const loadError = usePolymind((state) => (state.catalogueStatus === "error" ? state.catalogueError : null));

  const [dialog, setDialog] = useState<DialogName>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [queued, setQueued] = useState<QuickAction | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const closeDialog = useCallback(() => setDialog(null), []);

  useTheme();

  useEffect(() => {
    void usePolymind.getState().loadCatalogue();
  }, []);

  // Actions from text selected on a web page arrive here (extension only).
  useEffect(() => platform.onQuickAction?.(setQueued), [platform]);
  useEffect(() => {
    if (!queued || !ready) return;
    const { prompt, instruction } = buildQuickAction(queued);
    usePolymind.getState().send(prompt, { instruction, fresh: true });
    setQueued(null);
  }, [queued, ready]);

  // Follow the answer as it streams, unless the reader has scrolled up.
  useEffect(() => {
    const element = thread.current;
    if (!element) return;
    if (!conversation?.turns.length) element.scrollTop = 0;
    else if (pinned.current) element.scrollTop = element.scrollHeight;
  }, [conversation]);
  useEffect(() => {
    pinned.current = true;
  }, [conversation?.id, conversation?.turns.length]);

  const readTab = useCallback(async (): Promise<boolean> => {
    const page = await platform.readActiveTab?.().catch(() => null);
    if (!page || page.text.trim().length < 40) {
      usePolymind.getState().setNotice(CANNOT_READ);
      return false;
    }
    usePolymind.getState().setPage(page);
    return true;
  }, [platform]);

  const summarisePage = useCallback(async () => {
    if (await readTab()) usePolymind.getState().send("Summarise this page");
  }, [readTab]);

  const hasTurns = !!conversation && conversation.turns.length > 0;

  return (
    <div className="pm-app" data-platform={platform.kind}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenPrompts={() => {
          setSidebarOpen(false);
          setDialog("prompts");
        }}
        onOpenSettings={() => {
          setSidebarOpen(false);
          setDialog("settings");
        }}
      />

      <main className="pm-main">
        <header className="pm-topbar">
          <button className="pm-icon-btn pm-topbar__menu" aria-label="Open chat list" onClick={() => setSidebarOpen(true)}>
            <PanelLeft size={18} />
          </button>
          <div className="pm-topbar__brand">
            <Logo size={22} />
            <span>Polymind</span>
          </div>
          <button
            className="pm-icon-btn pm-topbar__new"
            aria-label="New chat"
            onClick={() => usePolymind.getState().newConversation()}
          >
            <Plus size={18} />
          </button>
        </header>

        {catalogue?.mode === "demo" && (
          <p className="pm-banner" role="status">
            Demo mode. Answers are simulated until this server is given an OpenRouter key.
          </p>
        )}

        {loadError && (
          <p className="pm-banner pm-banner--error" role="alert">
            {loadError}
            <button onClick={() => void usePolymind.getState().loadCatalogue()}>Try again</button>
            {platform.kind === "extension" && <button onClick={() => setDialog("settings")}>Open settings</button>}
          </p>
        )}

        <div
          className="pm-thread"
          ref={thread}
          onScroll={(event) => {
            const element = event.currentTarget;
            pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          }}
        >
          {hasTurns ? (
            <div className="pm-turns">
              {conversation.turns.map((turn) => (
                <TurnView key={turn.id} turn={turn} />
              ))}
            </div>
          ) : (
            <Welcome onSummarisePage={platform.readActiveTab ? summarisePage : undefined} />
          )}
        </div>

        <div className="pm-dock">
          <Composer
            onOpenModels={() => setDialog("models")}
            onOpenPrompts={() => setDialog("prompts")}
            onAddLink={() => setDialog("link")}
            onReadTab={async () => void (await readTab())}
          />
          <p className="pm-dock__note">
            {catalogue?.allowance && allowanceLeft !== null
              ? `${allowanceLeft} of ${catalogue.allowance.perDay} premium answers left today. `
              : ""}
            AI models can be wrong. Check anything that matters.
          </p>
        </div>
      </main>

      {dialog === "models" && <ModelPicker onClose={closeDialog} />}
      {dialog === "prompts" && <PromptLibrary onClose={closeDialog} />}
      {dialog === "link" && <LinkDialog onClose={closeDialog} />}
      {dialog === "settings" && <SettingsDialog onClose={closeDialog} />}
    </div>
  );
}
