import { useEffect, useState } from "react";
import { getPlatform, usePolymind } from "../store";
import type { ThemeChoice } from "../types";
import { Dialog } from "./Dialog";

const THEMES: Array<[ThemeChoice, string]> = [
  ["system", "Match device"],
  ["light", "Light"],
  ["dark", "Dark"],
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const theme = usePolymind((state) => state.theme);
  const override = usePolymind((state) => state.apiBaseOverride);
  const count = usePolymind((state) => state.conversations.length);
  const { setTheme, setApiBaseOverride, clearConversations, loadCatalogue } = usePolymind.getState();
  const platform = getPlatform();

  const [server, setServer] = useState(override);
  const [toolbar, setToolbar] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void platform.selectionToolbar?.get().then(setToolbar);
  }, [platform]);

  const saveServer = () => {
    if (server.trim() === override) return;
    setApiBaseOverride(server.trim());
    void loadCatalogue();
  };

  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="pm-settings">
        <section>
          <h3>Appearance</h3>
          <div className="pm-segmented" role="group" aria-label="Theme">
            {THEMES.map(([value, label]) => (
              <button key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}>
                {label}
              </button>
            ))}
          </div>
        </section>

        {platform.selectionToolbar && toolbar !== null && (
          <section>
            <h3>Selected text</h3>
            <label className="pm-check">
              <input
                type="checkbox"
                checked={toolbar}
                onChange={(event) => {
                  setToolbar(event.target.checked);
                  void platform.selectionToolbar?.set(event.target.checked);
                }}
              />
              Show Polymind actions when I select text on a page
            </label>
          </section>
        )}

        {platform.kind === "extension" && (
          <section>
            <h3>Server</h3>
            <label className="pm-field">
              Polymind server address
              <input
                value={server}
                placeholder={platform.apiBase || "https://your-site.netlify.app"}
                onChange={(event) => setServer(event.target.value)}
                onBlur={saveServer}
              />
              <small>Leave empty to use the address this extension was built with.</small>
            </label>
          </section>
        )}

        <section>
          <h3>Your chats</h3>
          <p>Chats and prompts are stored in this browser only. Nothing is kept on Polymind's server.</p>
          {confirming ? (
            <div className="pm-settings__confirm">
              <button
                className="pm-btn pm-btn--danger"
                onClick={() => {
                  clearConversations();
                  setConfirming(false);
                }}
              >
                Delete {count} {count === 1 ? "chat" : "chats"}
              </button>
              <button className="pm-btn pm-btn--quiet" onClick={() => setConfirming(false)}>
                Keep them
              </button>
            </div>
          ) : (
            <button className="pm-btn pm-btn--quiet" disabled={count === 0} onClick={() => setConfirming(true)}>
              Delete all chats
            </button>
          )}
        </section>
      </div>
    </Dialog>
  );
}
