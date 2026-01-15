import type { Request } from "express";

export function isAuthenticated(req: Request): boolean {
  // Pick one simple signal for the toy project.
  // Cookie-based session is common.
  const cookie = req.headers.cookie ?? "";
  if (cookie.includes("session=")) return true;

  // Also treat Authorization as authed.
  const auth = req.headers.authorization;
  if (auth && auth.trim().length > 0) return true;

  return false;
}