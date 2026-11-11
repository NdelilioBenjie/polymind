import { Check, Lock, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatContext, formatPrice, voiceOf } from "../lib/format";
import { usePolymind } from "../store";
import type { ModelInfo } from "../types";
import { Dialog } from "./Dialog";

type Scope = "available" | "all";
const PAGE = 80;

export function ModelPicker({ onClose }: { onClose: () => void }) {
  const catalogue = usePolymind((state) => state.catalogue);
  const status = usePolymind((state) => state.catalogueStatus);
  const error = usePolymind((state) => state.catalogueError);
  const selected = usePolymind((state) => state.selectedModelIds);
  const { toggleModel, loadCatalogue } = usePolymind.getState();

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("available");
  const [shown, setShown] = useState(PAGE);

  const models = useMemo(() => catalogue?.models ?? [], [catalogue]);
  const hasLocked = models.some((model) => !model.available);
  const limit = catalogue?.maxModelsPerPrompt ?? 4;
  const full = selected.length >= limit;

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return models
      .filter((model) => scope === "all" || model.available)
      .filter((model) => {
        const haystack = `${model.name} ${model.providerName} ${model.id}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
      .sort((a, b) => b.created - a.created);
  }, [models, query, scope]);

  const row = (model: ModelInfo) => {
    const index = selected.indexOf(model.id);
    const isSelected = index !== -1;
    const disabled = !model.available || (!isSelected && full);
    const details = [model.providerName, formatContext(model.contextLength), formatPrice(model)].filter(Boolean);
    return (
      <li key={model.id}>
        <button
          className="pm-model"
          data-selected={isSelected}
          data-voice={isSelected ? voiceOf(index) : undefined}
          disabled={disabled}
          aria-pressed={isSelected}
          title={
            !model.available
              ? "Not enabled on this server"
              : disabled
                ? `Remove a model first. ${limit} can answer at once.`
                : model.description || model.id
          }
          onClick={() => toggleModel(model.id)}
        >
          <i className="pm-dot" aria-hidden />
          <span className="pm-model__text">
            <strong>{model.name}</strong>
            <small>{details.join(", ")}</small>
          </span>
          {isSelected ? <Check size={16} /> : !model.available ? <Lock size={14} /> : null}
        </button>
      </li>
    );
  };

  return (
    <Dialog
      title="Choose models"
      description={`Up to ${limit} can answer each question. ${selected.length} selected.`}
      size="wide"
      onClose={onClose}
    >
      <div className="pm-picker__controls">
        <label className="pm-search">
          <Search size={16} />
          <input
            data-autofocus
            type="search"
            value={query}
            placeholder="Search by name or maker"
            aria-label="Search models"
            onChange={(event) => {
              setQuery(event.target.value);
              setShown(PAGE);
            }}
          />
        </label>
        {hasLocked && (
          <div className="pm-segmented" role="group" aria-label="Which models to list">
            <button aria-pressed={scope === "available"} onClick={() => setScope("available")}>
              Ready to use
            </button>
            <button aria-pressed={scope === "all"} onClick={() => setScope("all")}>
              Everything
            </button>
          </div>
        )}
      </div>

      <div className="pm-picker__list">
        {status === "loading" && !catalogue && <p className="pm-picker__note">Loading the model list.</p>}
        {status === "error" && !catalogue && (
          <div className="pm-picker__note">
            <p>{error}</p>
            <button className="pm-btn pm-btn--quiet" onClick={() => loadCatalogue()}>
              Try again
            </button>
          </div>
        )}
        {catalogue && results.length === 0 && (
          <p className="pm-picker__note">No model matches “{query}”. Try a maker name, such as Google.</p>
        )}
        <ul>{results.slice(0, shown).map(row)}</ul>
        {results.length > shown && (
          <button className="pm-btn pm-btn--quiet pm-picker__more" onClick={() => setShown(shown + PAGE)}>
            Show {Math.min(PAGE, results.length - shown)} more
          </button>
        )}
      </div>

      <footer className="pm-dialog__foot">
        <span>
          {results.length} of {models.length} models
          {catalogue?.source === "sample" ? " (offline sample list)" : ""}
        </span>
        <button className="pm-btn pm-btn--primary" onClick={onClose}>
          Done
        </button>
      </footer>
    </Dialog>
  );
}
