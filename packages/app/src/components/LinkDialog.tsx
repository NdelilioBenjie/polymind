import { useState } from "react";
import { ApiError, fetchPage } from "../api";
import { apiBase, usePolymind } from "../store";
import { Dialog } from "./Dialog";

export function LinkDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const page = await fetchPage(apiBase(usePolymind.getState()), url.trim());
      usePolymind.getState().setPage(page);
      onClose();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "That page could not be read.");
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Add a link"
      description="Polymind reads the page so every model can answer questions about it."
      onClose={onClose}
    >
      <form
        className="pm-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (url.trim() && !busy) void read();
        }}
      >
        <label>
          Web address
          <input
            data-autofocus
            type="text"
            inputMode="url"
            value={url}
            placeholder="https://example.com/article"
            onChange={(event) => setUrl(event.target.value)}
          />
          {error && <small className="pm-form__error">{error}</small>}
        </label>
        <footer className="pm-dialog__foot">
          <button type="button" className="pm-btn pm-btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="pm-btn pm-btn--primary" disabled={!url.trim() || busy}>
            {busy ? "Reading page" : "Read page"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
