import type { Config } from "@netlify/edge-functions";
import { handlePage } from "../../packages/server/src/page.ts";

export default (request: Request) => handlePage(request, { get: (name) => Netlify.env.get(name) });

export const config: Config = {
  path: "/api/page",
  // Per-visitor ceiling, enforced by Netlify before the function runs.
  rateLimit: { windowLimit: 12, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
