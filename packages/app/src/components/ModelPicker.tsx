import { Check, Lock, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatContext, formatPrice, voiceOf } from "../lib/format";
import { displayMaker, displayName, popularModels } from "../lib/popular";
import { usePolymind } from "../store";
import type { ModelInfo } from "../types";
import { Dialog } from "./Dialog";

type Scope = "popular" | "free" | "all";
const SCOPES: Array<[Scope, string]> = [
  ["popular", "Popular"],
  ["free", "Free"],
  ["all", "All"],
];
const PAGE = 80;

export function ModelPicker({ onClose }: { onClose: () => void }) {
  const catalogue = usePolymind((state) => state.catalogue);
  const status = usePolymind((state) => state.catalogueStatus);
  const error = usePolymind((state) => state.catalogueError);
  const selected = usePolymind((state) => state.selectedModelIds);
  const allowanceRemaining = usePolymind((state) => state.allowanceRemaining);
  const { toggleModel, loadCatalogue } = usePolymind.getState();

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("popular");
  const [shown, setShown] = useState(PAGE);

  const models = useMemo(() => catalogue?.models ?? [], [catalogue]);
  const metered = catalogue?.mode === "live" && catalogue.access === "allowance";
  const perDay = catalogue?.allowance?.perDay ?? 0;
  const limit = catalogue?.maxModelsPerPrompt ?? 4;
  const full = selected.length >= limit;

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    // Searching always looks through every model, whichever tab is open.
    const pool =
      terms.length > 0
        ? [...models].sort((a, b) => b.created - a.created)
        : scope === "popular"
          ? popularModels(models)
          : [...models].filter((model) => scope === "all" || model.free).sort((a, b) => b.created - a.created);
    return pool.filter((model) => {
      const haystack = `${displayName(model)} ${model.name} ${model.providerName} ${model.id}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [models, query, scope]);

  const allowanceNote = !metered
    ? null
    : allowanceRemaining === null
      ? `${perDay} free premium answers a day`
      : `${allowanceRemaining} of ${perDay} premium answers left today`;

  const row = (model: ModelInfo) => {
    const index = selected.indexOf(model.id);
    const isSelected = index !== -1;
    const disabled = !model.available || (!isSelected && full);
    const premium = metered && model.tier === "premium";
    const details = [
      displayMaker(model),
      formatContext(model.contextLength),
      premium ? "" : formatPrice(model),
    ].filter(Boolean);
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
            <strong>
              {displayName(model)}
              {premium && <span className="pm-tag pm-tag--premium">Premium</span>}
            </strong>
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
        <div className="pm-segmented" role="group" aria-label="Which models to list">
          {SCOPES.map(([value, label]) => (
            <button
              key={value}
              aria-pressed={scope === value && !query}
              onClick={() => {
                setScope(value);
                setQuery("");
                setShown(PAGE);
              }}
            >
              {label}
            </button>
          ))}
        </div>
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
          {allowanceNote ?? `${results.length} of ${models.length} models`}
          {catalogue?.source === "sample" ? " (offline sample list)" : ""}
        </span>
        <button className="pm-btn pm-btn--primary" onClick={onClose}>
          Done
        </button>
      </footer>
    </Dialog>
  );
}
