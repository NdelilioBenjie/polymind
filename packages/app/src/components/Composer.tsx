import { ArrowUp, BookOpen, FileText, Link2, Plus, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { hostOf, voiceOf } from "../lib/format";
import { displayName } from "../lib/popular";
import { getPlatform, isBusy, usePolymind } from "../store";

interface ComposerProps {
  onOpenModels: () => void;
  onOpenPrompts: () => void;
  onAddLink: () => void;
  onReadTab: () => Promise<void>;
}

export function Composer({ onOpenModels, onOpenPrompts, onAddLink, onReadTab }: ComposerProps) {
  const draft = usePolymind((state) => state.draft);
  const selected = usePolymind((state) => state.selectedModelIds);
  const catalogue = usePolymind((state) => state.catalogue);
  const conversation = usePolymind((state) => state.conversations.find((c) => c.id === state.activeId));
  const notice = usePolymind((state) => state.notice);
  const { setDraft, setNotice, send, stop, removeModel, setPage } = usePolymind.getState();

  const input = useRef<HTMLTextAreaElement>(null);
  const [reading, setReading] = useState(false);
  const platform = getPlatform();
  const busy = isBusy(conversation);
  const page = conversation?.page;
  const limit = catalogue?.maxModelsPerPrompt ?? 4;

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [draft]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);

  const names = new Map(catalogue?.models.map((model) => [model.id, displayName(model)]));
  const canSend = draft.trim().length > 0 && selected.length > 0;
  const submit = () => {
    if (canSend) send(draft);
  };

  const readTab = async () => {
    setReading(true);
    await onReadTab();
    setReading(false);
  };

  return (
    <form
      className="pm-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="pm-voices" aria-label="Models answering">
        {selected.map((id, index) => (
          <span key={id} className="pm-voice" data-voice={voiceOf(index)}>
            <i className="pm-dot" aria-hidden />
            <span className="pm-voice__name">{names.get(id) ?? id}</span>
            <button type="button" aria-label={`Remove ${names.get(id) ?? id}`} onClick={() => removeModel(id)}>
              <X size={12} />
            </button>
          </span>
        ))}
        <button type="button" className="pm-voice-add" onClick={onOpenModels}>
          <Plus size={14} />
          {selected.length === 0 ? "Choose models" : selected.length < limit ? "Add model" : "Change"}
        </button>
      </div>

      {page && (
        <div className="pm-page-chip">
          <FileText size={14} />
          <span>
            Reading <a href={page.url} target="_blank" rel="noreferrer noopener">{page.title}</a>
            <em>{hostOf(page.url)}</em>
          </span>
          <button type="button" className="pm-icon-btn" aria-label="Stop reading this page" onClick={() => setPage(undefined)}>
            <X size={14} />
          </button>
        </div>
      )}

      <textarea
        id="pm-composer-input"
        ref={input}
        rows={1}
        value={draft}
        placeholder={page ? "Ask about this page" : "Ask anything"}
        aria-label="Your question"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
      />

      <div className="pm-composer__bar">
        <div className="pm-composer__tools">
          <button type="button" className="pm-text-btn" onClick={onOpenPrompts}>
            <BookOpen size={15} />
            Prompts
          </button>
          {platform.kind === "extension" ? (
            <button type="button" className="pm-text-btn" onClick={readTab} disabled={reading}>
              <FileText size={15} />
              {reading ? "Reading" : "Read this page"}
            </button>
          ) : (
            <button type="button" className="pm-text-btn" onClick={onAddLink}>
              <Link2 size={15} />
              Add a link
            </button>
          )}
        </div>

        {busy ? (
          <button type="button" className="pm-btn pm-btn--quiet" onClick={() => stop()}>
            <Square size={13} />
            Stop
          </button>
        ) : (
          <button type="submit" className="pm-btn pm-btn--primary" disabled={!canSend}>
            {selected.length > 1 ? `Ask ${selected.length} models` : "Ask"}
            <ArrowUp size={16} />
          </button>
        )}
      </div>

      {notice && (
        <p className="pm-composer__notice" role="status">
          {notice}
        </p>
      )}
    </form>
  );
}
