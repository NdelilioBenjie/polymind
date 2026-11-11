import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import { handleChat, handleModels, handlePage, type Env } from "@polymind/server";

type Handler = (request: Request, env: Env) => Promise<Response>;

const routes: Record<string, Handler> = {
  "/api/chat": handleChat,
  "/api/models": handleModels,
  "/api/page": handlePage,
};

/** Serves the API during `npm run dev` and `npm run preview` by calling the
 *  same handlers the Netlify Edge Functions use, so no Netlify CLI is needed. */
function polymindApi(env: Record<string, string>): Plugin {
  const serverEnv: Env = { get: (name) => env[name] ?? process.env[name] };

  const middleware: Connect.NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const handler = routes[url.pathname];
    if (!handler) return next();

    const abort = new AbortController();
    res.on("close", () => abort.abort());

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(url, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
      signal: abort.signal,
      // @ts-expect-error Node needs this flag for streamed request bodies.
      duplex: "half",
    });

    handler(request, serverEnv)
      .then(async (response) => {
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        if (!response.body) return res.end();
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        console.error("[polymind api]", error);
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      });
  };

  return {
    name: "polymind-api",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

export default defineConfig(({ mode }) => {
  // Read .env from the repository root; server keys never reach the browser bundle.
  const env = loadEnv(mode, "../..", "");
  return {
    plugins: [react(), polymindApi(env)],
    build: { target: "es2022", sourcemap: false },
  };
});
