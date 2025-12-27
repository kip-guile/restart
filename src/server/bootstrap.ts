import type { RequestContext } from "./requestContext.js";
import type { BootstrapPayload } from "../shared/bootstrap.js";

function greetingForUser(userId: string): string {
  const short = userId.slice(0, 6);
  return `Welcome back, user-${short}`;
}

export function getBootstrapPayload(
  ctx: RequestContext,
): Promise<BootstrapPayload> {
  // Route specific behavior can go here later
  return Promise.resolve({
    route: ctx.route,
    greeting: greetingForUser(ctx.userId),
  });
}
