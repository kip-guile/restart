import type express from "express";
import crypto from "crypto";
import { isAuthenticated } from "../http/auth.js";

export type RequestContext = {
  requestId: string;
  userId: string | null;
  isAuthenticated: boolean;
  route: string;
};

function getOrCreateUserId(req: express.Request): string | null {
  // Only trust authenticated sessions, not arbitrary headers
  // For anonymous users, return null (use public cache only)
  if (isAuthenticated(req)) {
    // In a real app, extract userId from session/JWT
    // For now, use a cookie-based stable identifier if present
    const cookie = req.headers.cookie ?? "";
    const sessionMatch = cookie.match(/session=([^;]+)/);
    if (sessionMatch?.[1]) {
      return sessionMatch[1];
    }
    // Fallback for Authorization header auth
    return crypto.randomUUID();
  }
  return null;
}

export function buildRequestContext(
  req: express.Request,
  routeOverride?: string,
): RequestContext {
  return {
    requestId: crypto.randomUUID(),
    userId: getOrCreateUserId(req),
    route: routeOverride ?? req.path,
    isAuthenticated: isAuthenticated(req),
  };
}
