/** Demo mode: when no OpenRouter key is configured the chat endpoint streams a
 *  clearly labelled simulated answer, so the interface can be explored for free. */

const encoder = new TextEncoder();

function demoText(model: string, prompt: string): string {
  const quoted = prompt.length > 160 ? `${prompt.slice(0, 160)}…` : prompt;
  return [
    `**Demo answer from \`${model}\`.** This deployment has no OpenRouter key yet, so the text below is simulated rather than written by the model.`,
    "",
    `You asked: “${quoted}”`,
    "",
    "With a key in place, this column would stream the model's real reply while the other columns stream theirs, so you can compare:",
    "",
    "- how each model interprets the question",
    "- which one answers fastest",
    "- where they agree and where they diverge",
    "",
    "Add `OPENROUTER_API_KEY` to the site's environment variables to switch Polymind to live answers.",
  ].join("\n");
}

export function demoStream(model: string, prompt: string): ReadableStream<Uint8Array> {
  const words = demoText(model, prompt).split(/(?<=\s)/);
  // Give each model its own pace so side-by-side columns do not move in lockstep.
  const pace = 14 + ([...model].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5) * 9;
  let index = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return new ReadableStream({
    start(controller) {
      const push = () => {
        if (index >= words.length) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        const chunk = { model, choices: [{ index: 0, delta: { content: words[index++] } }] };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        timer = setTimeout(push, pace);
      };
      timer = setTimeout(push, 180 + pace * 6);
    },
    cancel() {
      clearTimeout(timer);
    },
  });
}
