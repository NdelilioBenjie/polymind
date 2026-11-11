import type { Config } from "@netlify/edge-functions";
import { handleChat } from "../../packages/server/src/chat.ts";

export default (request: Request) => handleChat(request, { get: (name) => Netlify.env.get(name) });

export const config: Config = {
  path: "/api/chat",
  // Per-visitor ceiling, enforced by Netlify before the function runs.
  rateLimit: { windowLimit: 40, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
