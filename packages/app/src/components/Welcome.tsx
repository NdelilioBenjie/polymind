import { FileText } from "lucide-react";
import { STARTERS } from "../lib/prompts";
import { usePolymind } from "../store";

interface WelcomeProps {
  /** Present in the extension: summarise the tab the user is on. */
  onSummarisePage?: () => void;
}

export function Welcome({ onSummarisePage }: WelcomeProps) {
  const setDraft = usePolymind((state) => state.setDraft);

  return (
    <div className="pm-welcome">
      <div className="pm-welcome__art" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <h1>
        One question.
        <br />
        Every mind.
      </h1>
      <p className="pm-welcome__lede">
        Pick up to four AI models, ask once, and read their answers side by side.
      </p>

      <div className="pm-starters">
        <h2>Try one of these</h2>
        <ul>
          {onSummarisePage && (
            <li>
              <button onClick={onSummarisePage}>
                <FileText size={16} />
                Summarise the page I'm on
              </button>
            </li>
          )}
          {STARTERS.map((starter) => (
            <li key={starter}>
              <button
                onClick={() => {
                  setDraft(starter);
                  document.querySelector<HTMLTextAreaElement>("#pm-composer-input")?.focus();
                }}
              >
                {starter}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
