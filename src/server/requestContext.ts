import type express from "express";
import crypto from "crypto";

export type RequestContext = {
  requestId: string;
  userId: string;
  route: string;
};

function getOrCreateUserId(req: express.Request): string {
  const header = req.header("x-user-id");
  if (header && header.trim()) return header.trim();

  // Anonymous stable id per request for now
  // Later you can derive this from a real auth session
  return crypto.randomUUID();
}

export function buildRequestContext(
  req: express.Request,
  routeOverride?: string,
): RequestContext {
  return {
    requestId: crypto.randomUUID(),
    userId: getOrCreateUserId(req),
    route: routeOverride ?? req.path,
  };
}
