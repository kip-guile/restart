import type { RequestContext } from "./requestContext.js";
import type { BootstrapPayload } from "../shared/bootstrap.js";
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

const bootstrapCache = new TTLCache<BootstrapPayload>(15_000);

function makeCacheKey(ctx: RequestContext): string {
  return `${ctx.userId}:${ctx.route}`;
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
  const key = makeCacheKey(ctx);

  const cached = bootstrapCache.get(key);
  if (cached) {
    console.log(`[bootstrap] cache HIT ${key}`);
    return cached;
  }

  const http = createHttpClient({ requestId: ctx.requestId });

  try {
    // Route-specific bootstrapping
    const userName = await getUserName(http);

    let payload: BootstrapPayload;

    if (ctx.route === "/todos") {
      const todos = await getTodos(http);
      payload = {
        route: ctx.route,
        greeting: `Welcome back, ${userName}`,
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
        greeting: `Welcome back, ${userName}`,
        page: { kind: "home" },
      };
    }
    console.log(`[bootstrap] cache MISS ${key}`);

    bootstrapCache.set(key, payload);
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
