import type { RequestContext } from "./requestContext.js";
import type { BootstrapPayload } from "@restart/shared";
import { createHttpClient } from "./httpClient.js";
import { TTLCache } from "./cache.js";

type ExternalUser = {
  id: number;
  name: string;
  username: string;
};

type ExternalTodo = {
  id: number;
  title: string;
  completed: boolean;
};

const publicBootstrapCache = new TTLCache<BootstrapPayload>(15_000);
const privateBootstrapCache = new TTLCache<BootstrapPayload>(15_000);

function makePublicKey(ctx: RequestContext): string {
  return `route=${ctx.route}`;
}

function makePrivateKey(ctx: RequestContext): string {
  if (!ctx.isAuthenticated) return `anon:${ctx.route}`;
  return `user=${ctx.userId}:${ctx.route}`;
}

function isBootstrapPublic(_ctx: RequestContext): boolean {
  // With your current greeting, it is always private
  return false;
}

export async function getUserName(
  http: ReturnType<typeof createHttpClient>,
): Promise<string> {
  const user = await http.getJson<ExternalUser>(
    "https://jsonplaceholder.typicode.com/users/1",
    { timeoutMs: 1500, retries: 1 },
  );
  return user.name;
}

export async function getTodos(
  http: ReturnType<typeof createHttpClient>,
): Promise<ExternalTodo[]> {
  return http.getJson<ExternalTodo[]>(
    "https://jsonplaceholder.typicode.com/todos?_limit=5",
    { timeoutMs: 1500, retries: 1 },
  );
}

export async function getBootstrapPayload(
  ctx: RequestContext,
): Promise<BootstrapPayload> {
  const cache = isBootstrapPublic(ctx) ? publicBootstrapCache : privateBootstrapCache;
  const key = isBootstrapPublic(ctx) ? makePublicKey(ctx) : makePrivateKey(ctx);

  const cached = cache.get(key);
  if (cached) {
    console.log(`[bootstrap] cache HIT ${key}`);
    return cached;
  }


  const http = createHttpClient({ requestId: ctx.requestId });

  try {
    // Route-specific bootstrapping
    const userName = ctx.isAuthenticated ? await getUserName(http) : null;

    const greeting = userName ? `Welcome back, ${userName}` : "Welcome";

    let payload: BootstrapPayload;

    if (ctx.route === "/todos") {
      const todos = await getTodos(http);
      payload = {
        route: ctx.route,
        greeting,
        page: {
          kind: "todos",
          todos: todos.map((t) => ({
            id: t.id,
            title: t.title,
            completed: t.completed,
          })),
        },
      };
    } else {
      payload = {
        route: ctx.route,
        greeting,
        page: { kind: "home" },
      };
    }
    console.log(`[bootstrap] cache MISS ${key}`);

    cache.set(key, payload);
    return payload;
  } catch (err) {
    console.error(
      `[bootstrap] FAIL requestId=${ctx.requestId} userId=${ctx.userId} route=${ctx.route}`,
      err,
    );
    return {
      route: ctx.route,
      greeting: "Welcome back, user",
      page: {
        kind: "error",
        status: 500,
        code: "BOOTSTRAP_UNKNOWN",
        message: "An unknown error occurred during bootstrapping.",
      },
    };
  }
}
