import { RotateCw, Square } from "lucide-react";
import { memo } from "react";
import { countWords, formatDuration, voiceOf } from "../lib/format";
import { usePolymind } from "../store";
import type { Answer, Turn } from "../types";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";

function answerMeta(answer: Answer): string {
  if (answer.status === "waiting") return "Thinking";
  if (answer.status === "streaming") return "Writing";
  if (answer.status === "error") return "Failed";
  const parts = [formatDuration(answer.totalMs), `${countWords(answer.content)} words`];
  if (answer.status === "stopped") parts.unshift("Stopped");
  return parts.filter(Boolean).join(", ");
}

const AnswerColumn = memo(function AnswerColumn({
  answer,
  turnId,
  voice,
}: {
  answer: Answer;
  turnId: string;
  voice: string;
}) {
  const { retry, stop } = usePolymind.getState();
  const live = answer.status === "waiting" || answer.status === "streaming";

  return (
    <article className="pm-answer" data-voice={voice} data-status={answer.status}>
      <header className="pm-answer__head">
        <i className="pm-dot" aria-hidden />
        <h3 title={answer.modelId}>{answer.modelName}</h3>
        {answer.simulated && <span className="pm-tag">Simulated</span>}
      </header>

      <div className="pm-answer__body">
        {answer.status === "waiting" && (
          <div className="pm-thinking" aria-label="Waiting for the first words">
            <i />
            <i />
            <i />
          </div>
        )}
        {answer.content && <Markdown text={answer.content} />}
        {answer.status === "error" && <p className="pm-answer__error">{answer.error}</p>}
        {answer.status === "stopped" && !answer.content && (
          <p className="pm-answer__muted">Stopped before any text arrived.</p>
        )}
      </div>

      <footer className="pm-answer__foot">
        {live ? (
          <button className="pm-text-btn" onClick={() => stop(answer.id)}>
            <Square size={12} />
            Stop
          </button>
        ) : (
          <>
            {answer.content && <CopyButton text={answer.content} />}
            <button className="pm-text-btn" onClick={() => retry(turnId, answer.id)}>
              <RotateCw size={14} />
              {answer.status === "done" ? "Ask again" : "Retry"}
            </button>
          </>
        )}
        <span className="pm-answer__meta">{answerMeta(answer)}</span>
      </footer>
    </article>
  );
});

export const TurnView = memo(function TurnView({ turn }: { turn: Turn }) {
  return (
    <section className="pm-turn">
      <h2 className="pm-turn__prompt">{turn.prompt}</h2>
      <div className="pm-answers" data-count={turn.answers.length}>
        {turn.answers.map((answer, index) => (
          <AnswerColumn key={answer.id} answer={answer} turnId={turn.id} voice={voiceOf(index)} />
        ))}
      </div>
    </section>
  );
});
