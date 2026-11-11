import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { fillPrompt, promptVariables } from "../lib/prompts";
import { allPrompts, usePolymind } from "../store";
import type { SavedPrompt } from "../types";
import { Dialog } from "./Dialog";

type View = { name: "list" } | { name: "edit"; prompt?: SavedPrompt } | { name: "fill"; prompt: SavedPrompt };

export function PromptLibrary({ onClose }: { onClose: () => void }) {
  const customPrompts = usePolymind((state) => state.customPrompts);
  const prompts = useMemo(() => allPrompts({ customPrompts }), [customPrompts]);
  const { savePrompt, deletePrompt, setDraft } = usePolymind.getState();
  const [view, setView] = useState<View>({ name: "list" });

  const insert = (text: string) => {
    setDraft(text);
    onClose();
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("#pm-composer-input")?.focus());
  };

  const use = (prompt: SavedPrompt) => {
    if (promptVariables(prompt.body).length === 0) insert(prompt.body);
    else setView({ name: "fill", prompt });
  };

  if (view.name === "edit") {
    return (
      <Dialog key="edit" title={view.prompt ? "Edit prompt" : "New prompt"} onClose={onClose}>
        <PromptForm
          prompt={view.prompt}
          onCancel={() => setView({ name: "list" })}
          onSave={(title, body) => {
            savePrompt({ id: view.prompt?.id, title, body });
            setView({ name: "list" });
          }}
        />
      </Dialog>
    );
  }

  if (view.name === "fill") {
    return (
      <Dialog key="fill" title={view.prompt.title} description="Fill in the blanks, then add it to your question." onClose={onClose}>
        <FillForm prompt={view.prompt} onCancel={() => setView({ name: "list" })} onInsert={insert} />
      </Dialog>
    );
  }

  return (
    <Dialog key="list" title="Prompt library" description="Reusable prompts. Pick one to place it in the question box." onClose={onClose}>
      <div className="pm-library">
        <button className="pm-btn pm-btn--quiet pm-library__new" onClick={() => setView({ name: "edit" })}>
          <Plus size={16} />
          New prompt
        </button>
        <ul>
          {prompts.map((prompt) => (
            <li key={prompt.id}>
              <button className="pm-library__use" onClick={() => use(prompt)}>
                <strong>{prompt.title}</strong>
                <small>{prompt.body}</small>
              </button>
              {!prompt.builtin && (
                <span className="pm-library__actions">
                  <button
                    className="pm-icon-btn"
                    aria-label={`Edit ${prompt.title}`}
                    onClick={() => setView({ name: "edit", prompt })}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="pm-icon-btn"
                    aria-label={`Delete ${prompt.title}`}
                    onClick={() => deletePrompt(prompt.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

function PromptForm({
  prompt,
  onSave,
  onCancel,
}: {
  prompt?: SavedPrompt;
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(prompt?.title ?? "");
  const [body, setBody] = useState(prompt?.body ?? "");
  const valid = title.trim() && body.trim();

  return (
    <form
      className="pm-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSave(title.trim(), body.trim());
      }}
    >
      <label>
        Name
        <input data-autofocus value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Prompt
        <textarea rows={7} value={body} onChange={(event) => setBody(event.target.value)} />
        <small>
          Wrap a word in double braces, like {"{{topic}}"}, to make a blank you fill in each time.
        </small>
      </label>
      <footer className="pm-dialog__foot">
        <button type="button" className="pm-btn pm-btn--quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="pm-btn pm-btn--primary" disabled={!valid}>
          Save prompt
        </button>
      </footer>
    </form>
  );
}

function FillForm({
  prompt,
  onInsert,
  onCancel,
}: {
  prompt: SavedPrompt;
  onInsert: (text: string) => void;
  onCancel: () => void;
}) {
  const names = promptVariables(prompt.body);
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <form
      className="pm-form"
      onSubmit={(event) => {
        event.preventDefault();
        onInsert(fillPrompt(prompt.body, values));
      }}
    >
      {names.map((name, index) => {
        const long = /code|message|text|passage/i.test(name);
        const shared = {
          value: values[name] ?? "",
          "data-autofocus": index === 0 ? true : undefined,
          onChange: (event: { target: { value: string } }) => setValues({ ...values, [name]: event.target.value }),
        };
        return (
          <label key={name}>
            {name.charAt(0).toUpperCase() + name.slice(1)}
            {long ? <textarea rows={5} {...shared} /> : <input {...shared} />}
          </label>
        );
      })}
      <footer className="pm-dialog__foot">
        <button type="button" className="pm-btn pm-btn--quiet" onClick={onCancel}>
          Back
        </button>
        <button type="submit" className="pm-btn pm-btn--primary">
          Add to question
        </button>
      </footer>
    </form>
  );
}
