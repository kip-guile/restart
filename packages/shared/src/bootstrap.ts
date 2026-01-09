export type Todo = {
  id: number;
  title: string;
  completed: boolean;
};

export type BootstrapPayload =
  | {
      route: string;
      greeting: string;
      page: { kind: "home" };
    }
  | {
      route: string;
      greeting: string;
      page: {
        kind: "todos";
        todos: Todo[];
      };
    }
  | {
      route: string;
      greeting: string;
      page: {
        kind: "error";
        status: number; // e.g. 500, 504
        code: "BOOTSTRAP_TIMEOUT" | "BOOTSTRAP_UPSTREAM" | "BOOTSTRAP_UNKNOWN";
        message: string; // safe, user-facing
      };
    };