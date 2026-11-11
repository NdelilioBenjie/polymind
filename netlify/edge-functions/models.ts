import type { Config } from "@netlify/edge-functions";
import { handleModels } from "../../packages/server/src/catalogue.ts";

export default (request: Request) => handleModels(request, { get: (name) => Netlify.env.get(name) });

export const config: Config = {
  path: "/api/models",
  // Per-visitor ceiling, enforced by Netlify before the function runs.
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
