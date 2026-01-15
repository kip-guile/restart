import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { Todo } from "@restart/shared";

type HelloResponse = { message: string };

export function createApiSlice(baseUrl: string) {
  return createApi({
    reducerPath: "api",
    baseQuery: fetchBaseQuery({ baseUrl }),
    endpoints: (builder) => ({
      hello: builder.query<HelloResponse, void>({
        query: () => "hello",
      }),
      getTodos: builder.query<Todo[], void>({
        // IMPORTANT: keep it relative to baseUrl
        query: () => "todos",
      }),
    }),
  });
}
