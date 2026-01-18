import type { Request, Response } from "express";
import { isAuthenticated } from "./auth.js";

type CacheMode = "html" | "bootstrap" | "data" | "static";

export function applyCachePolicy(req: Request, res: Response, mode: CacheMode) {
  const authed = isAuthenticated(req);

  // Always vary by encoding because responses may be gzip/br.
  // Do NOT vary by Cookie/Authorization unless you really want huge cache fragmentation.
  res.setHeader("Vary", "Accept-Encoding");

  if (authed) {
    // Authenticated traffic: never allow shared caching by default.
    res.setHeader("Cache-Control", "private, no-store");
    return;
  }

  // Anonymous traffic:
  switch (mode) {
    case "html":
      res.setHeader(
        "Cache-Control",
        "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
      );
      return;

    case "bootstrap":
      res.setHeader(
        "Cache-Control",
        "public, max-age=0, s-maxage=30, stale-while-revalidate=120"
      );
      return;

    case "data":
      res.setHeader(
        "Cache-Control",
        "public, max-age=0, s-maxage=120, stale-while-revalidate=600"
      );
      return;

    case "static":
      // You already set this elsewhere for hashed assets.
      // Leave it here if you ever want to apply via middleware.
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return;

    default:
      res.setHeader("Cache-Control", "private, no-store");
  }
}