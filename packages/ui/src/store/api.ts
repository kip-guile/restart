import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { Todo } from "@restart/shared";

type HelloResponse = { message: string };

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
  }),
  endpoints: (builder) => ({
    hello: builder.query<HelloResponse, void>({
      query: () => "hello",
    }),
    getTodos: builder.query<Todo[], void>({
      query: () => "/todos",
    }),
  }),
});

export const { useHelloQuery, useGetTodosQuery } = api;
