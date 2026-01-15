import { createApiSlice } from "./store/api.js";

export const browserApi = createApiSlice("/api");

export const { useHelloQuery, useGetTodosQuery } = browserApi;