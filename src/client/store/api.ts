import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { Todo } from "../../shared/bootstrap.js";

type HelloResponse = { message: string };
type BootstrapResponse = unknown;

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
  }),
  endpoints: (builder) => ({
    hello: builder.query<HelloResponse, void>({
      query: () => "hello",
    }),
    bootstrap: builder.query<BootstrapResponse, { path: string }>({
      query: ({ path }) => `bootstrap?path=${encodeURIComponent(path)}`,
    }),
    getTodos: builder.query<Todo[], void>({
      query: () => "/todos",
    }),
  }),
});

export const { useHelloQuery, useBootstrapQuery, useGetTodosQuery } = api;
