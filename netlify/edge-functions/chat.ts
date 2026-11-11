import type { Config, Context } from "@netlify/edge-functions";
import { blobQuota } from "../../packages/server/src/blob-quota.ts";
import { handleChat } from "../../packages/server/src/chat.ts";

export default (request: Request, context: Context) =>
  handleChat(request, { get: (name) => Netlify.env.get(name) }, { visitor: context.ip, quota: blobQuota() });

export const config: Config = {
  path: "/api/chat",
  // Per-visitor ceiling, enforced by Netlify before the function runs.
  rateLimit: { windowLimit: 40, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
