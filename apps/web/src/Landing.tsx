import { ArrowRight, BookOpen, Columns3, FileText, GitBranch, MousePointerClick } from "lucide-react";
import { useEffect, useState } from "react";
import "./landing.css";

const REPO = "https://github.com/NdelilioBenjie/polymind";

/** A real exchange captured on this site, replayed in the hero. */
const DEMO = {
  prompt: "Say hello in Swahili in one short sentence.",
  answers: [
    { voice: "rose", model: "GPT-6.1 Terra Pro", text: "Habari!", meta: "4.9 s, 1 word" },
    {
      voice: "amber",
      model: "Claude Haiku 5.5",
      text: "Jambo! (Hello!) Habari yako? is also a common greeting.",
      meta: "2.2 s, 9 words",
    },
  ],
};

function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="pm-logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="11.5" cy="12" r="8.5" fill="var(--rose)" />
      <circle cx="20.5" cy="12" r="8.5" fill="var(--azure)" />
      <circle cx="16" cy="20" r="8.5" fill="var(--amber)" />
    </svg>
  );
}

/** Types the question, then lets both answers arrive at their own pace. Plays once. */
function HeroDemo() {
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const total = DEMO.prompt.length + Math.max(...DEMO.answers.map((answer) => answer.text.length)) + 14;
  const [tick, setTick] = useState(still ? total : 0);

  useEffect(() => {
    if (tick >= total) return;
    const timer = setTimeout(() => setTick(tick + 1), tick < DEMO.prompt.length ? 34 : 46);
    return () => clearTimeout(timer);
  }, [tick, total]);

  const asked = tick >= DEMO.prompt.length;
  const answerTick = tick - DEMO.prompt.length - 6;

  return (
    <figure className="lp-demo">
      <div className="lp-demo__frame">
        <p className="lp-demo__prompt">
          {DEMO.prompt.slice(0, tick)}
          {!asked && <i className="lp-caret" aria-hidden />}
        </p>
        <div className="lp-demo__answers">
          {DEMO.answers.map((answer, index) => {
            // The second model starts a beat later, as it would in a real comparison.
            const shown = Math.max(0, answerTick - index * 4);
            const done = shown >= answer.text.length;
            return (
              <article key={answer.model} className="pm-answer" data-voice={answer.voice}>
                <header className="pm-answer__head">
                  <i className="pm-dot" aria-hidden />
                  <h3>{answer.model}</h3>
                </header>
                <div className="pm-answer__body">
                  {asked && shown === 0 ? (
                    <div className="pm-thinking" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </div>
                  ) : (
                    <p>{answer.text.slice(0, shown)}</p>
                  )}
                </div>
                <footer className="pm-answer__foot">
                  <span className="pm-answer__meta">{done ? answer.meta : " "}</span>
                </footer>
              </article>
            );
          })}
        </div>
      </div>
      <figcaption>A real exchange from this site, replayed.</figcaption>
    </figure>
  );
}

function useCatalogue() {
  const [facts, setFacts] = useState<{ models: number; makers: number; perDay: number | null } | null>(null);
  useEffect(() => {
    fetch("/api/models")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.models?.length || data.source !== "openrouter") return;
        const makers = new Set(data.models.map((model: { provider: string }) => model.provider));
        setFacts({ models: data.models.length, makers: makers.size, perDay: data.allowance?.perDay ?? null });
      })
      .catch(() => undefined);
  }, []);
  return facts;
}

export function Landing() {
  const facts = useCatalogue();

  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="/">
          <Mark />
          Polymind
        </a>
        <nav aria-label="Sections">
          <a href="#features">Features</a>
          <a href="#engineering">How it's built</a>
          <a href="#author">Who built it</a>
        </nav>
        <a className="pm-btn pm-btn--primary" href="/app">
          Open Polymind
        </a>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero__copy">
            <h1>
              One question.
              <br />
              Every mind.
            </h1>
            <p className="lp-lede">
              Ask once and read GPT, Claude, Gemini and hundreds of other AI models answer side by side. No
              account, no API key, nothing to install.
            </p>
            <div className="lp-actions">
              <a className="pm-btn pm-btn--primary lp-btn-big" href="/app">
                Start asking
                <ArrowRight size={18} />
              </a>
              <a className="pm-btn pm-btn--quiet lp-btn-big" href={REPO} target="_blank" rel="noreferrer noopener">
                <GitBranch size={18} />
                Read the source
              </a>
            </div>
            <p className="lp-facts">
              {facts
                ? `${facts.models} models from ${facts.makers} makers, live right now.`
                : "Hundreds of models, loaded live."}
              {facts?.perDay ? ` ${facts.perDay} free premium answers a day, free models unlimited.` : ""}
            </p>
          </div>
          <HeroDemo />
        </section>

        <section className="lp-section" id="features">
          <h2>Four things it does well</h2>
          <div className="lp-features">
            <article>
              <Columns3 size={22} />
              <h3>Compare answers side by side</h3>
              <p>
                Pick up to four models. Each answer streams into its own column with its response time and
                length, so you can see who was right, who was fast and who rambled.
              </p>
              <div className="lp-chips" aria-hidden>
                <span className="pm-voice" data-voice="rose"><i className="pm-dot" />GPT</span>
                <span className="pm-voice" data-voice="amber"><i className="pm-dot" />Claude</span>
                <span className="pm-voice" data-voice="jade"><i className="pm-dot" />Gemini</span>
                <span className="pm-voice" data-voice="azure"><i className="pm-dot" />Polymind Auto</span>
              </div>
            </article>
            <article>
              <FileText size={22} />
              <h3>Chat with any page</h3>
              <p>
                Paste a link, or let the Chrome side panel read the tab you're on. Every model you picked can
                then summarise it or answer questions about it.
              </p>
              <div className="pm-page-chip lp-sample" aria-hidden>
                <FileText size={14} />
                <span>Reading the article you have open</span>
              </div>
            </article>
            <article>
              <MousePointerClick size={22} />
              <h3>Act on selected text</h3>
              <p>
                In the Chrome extension, select text on any site and a small toolbar offers to explain,
                summarise, rewrite or translate it.
              </p>
              <div className="lp-toolbar" aria-hidden>
                <Mark size={16} />
                <span>Explain</span>
                <span>Summarise</span>
                <span>Rewrite</span>
                <span>Translate</span>
              </div>
            </article>
            <article>
              <BookOpen size={22} />
              <h3>Keep your best prompts</h3>
              <p>
                Save prompts with blanks to fill in each time. Your chats and prompts stay in your browser;
                the server stores nothing.
              </p>
              <p className="lp-prompt" aria-hidden>
                Explain <mark>{"{{topic}}"}</mark> to someone new to the subject.
              </p>
            </article>
          </div>
        </section>

        <section className="lp-section" id="engineering">
          <h2>How it's built</h2>
          <p className="lp-section__lede">
            Polymind is one TypeScript codebase that ships as two products. The web app and the Chrome
            extension share every screen; a thin server keeps the API key and the bill under control.
          </p>

          <div className="lp-arch" role="img" aria-label="Architecture: the web app and the Chrome extension share one React interface, which calls edge functions, which call OpenRouter.">
            <div className="lp-arch__col">
              <div className="lp-node">Web app</div>
              <div className="lp-node">Chrome side panel</div>
            </div>
            <span className="lp-arch__link" aria-hidden />
            <div className="lp-node lp-node--core">
              Shared React interface
              <small>state, streaming client, design system</small>
            </div>
            <span className="lp-arch__link" aria-hidden />
            <div className="lp-node">
              Edge functions
              <small>policy, allowance, rate limits</small>
            </div>
            <span className="lp-arch__link" aria-hidden />
            <div className="lp-node">
              OpenRouter
              <small>{facts ? `${facts.models} models` : "hundreds of models"}</small>
            </div>
          </div>

          <dl className="lp-decisions">
            <div>
              <dt>Streaming from end to end</dt>
              <dd>
                The edge function pipes each model's token stream straight through. The client parses it
                incrementally and paints once per frame, so four answers arriving at once stay smooth.
              </dd>
            </div>
            <div>
              <dt>A public demo that cannot be drained</dt>
              <dd>
                Paid models run on a daily allowance per visitor and a ceiling for the whole site. The
                counters use compare-and-swap, so simultaneous requests cannot share one slot.
              </dd>
            </div>
            <div>
              <dt>One interface, two platforms</dt>
              <dd>
                The interface never asks where it is running. Each host hands it a small platform object,
                which keeps browser-extension APIs out of the shared code.
              </dd>
            </div>
            <div>
              <dt>Minimal trust</dt>
              <dd>
                The extension requests three permissions and no blanket access to your sites. The page
                reader refuses private network addresses and validates every redirect.
              </dd>
            </div>
            <div>
              <dt>Tested where it matters</dt>
              <dd>
                Automated tests cover the access policy, the allowance counters, the stream parser and the
                page reader. Continuous integration type-checks, tests and builds both products on every push.
              </dd>
            </div>
            <div>
              <dt>Built to be read</dt>
              <dd>
                React 19, TypeScript in strict mode, Zustand, Vite and Netlify Edge Functions. The server has
                no dependencies beyond the platform's own storage.
              </dd>
            </div>
          </dl>
        </section>

        <section className="lp-section lp-author" id="author">
          <div>
            <h2>Who built it</h2>
            <p>
              Polymind was designed and built by <strong>Benjamen Ayo</strong>, a software and systems
              engineer based in Arusha, Tanzania. He builds web platforms, internal tools and the
              infrastructure behind them, from the first sketch to production.
            </p>
            <div className="lp-actions">
              <a className="pm-btn pm-btn--quiet" href="https://github.com/NdelilioBenjie" target="_blank" rel="noreferrer noopener">
                <GitBranch size={16} />
                GitHub
              </a>
              <a className="pm-btn pm-btn--quiet" href="https://ayo-benjamin.netlify.app/" target="_blank" rel="noreferrer noopener">
                Portfolio
              </a>
            </div>
          </div>
          <div className="lp-cta">
            <h2>Try it on your own question</h2>
            <p>It takes one click, and the free models never run out.</p>
            <a className="pm-btn pm-btn--primary lp-btn-big" href="/app">
              Open Polymind
              <ArrowRight size={18} />
            </a>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <span>
          <Mark size={18} /> Polymind
        </span>
        <span>
          Open source under the MIT licence. <a href={REPO}>View the code</a>.
        </span>
      </footer>
    </div>
  );
}
