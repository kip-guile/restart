import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

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
  }),
});

export const { useHelloQuery, useBootstrapQuery } = api;
