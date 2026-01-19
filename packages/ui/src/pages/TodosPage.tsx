/**
 * @fileoverview Todos page component
 *
 * DATA LOADING STRATEGY:
 * This component uses RTK Query as the single source of truth for todos data.
 *
 * SSR (production):
 * - Server pre-populates RTK Query cache via upsertQueryData
 * - Hook returns cached data immediately (isLoading: false)
 * - No fetch occurs, page renders with data
 *
 * CSR (development or client navigation):
 * - Hook finds no cached data
 * - Automatically fetches from /api/todos
 * - Shows loading state, then renders data
 *
 * This approach is simpler than mixing bootstrap with RTK Query:
 * - Single source of truth (RTK Query cache)
 * - Automatic fetching when needed
 * - Built-in loading/error states
 * - Cache invalidation for free
 */
import React from "react";
import { useGetTodosQuery } from "../browserApi.js";
import type { Todo } from "@restart/shared";

export default function Todos() {
  const { data, isLoading, error, refetch } = useGetTodosQuery();

  if (isLoading && !data) {
    return (
      <div>
        <h2>Todos</h2>
        <p>Loading todos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h2>Todos</h2>
        <p>Failed to load todos.</p>
        <button onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Todos</h2>
      {data && data.length > 0 ? (
        <ul>
          {data.map((t: Todo) => (
            <li key={t.id}>
              {t.completed ? "✅" : "⬜"} {t.title}
            </li>
          ))}
        </ul>
      ) : (
        <p>No todos found.</p>
      )}
    </div>
  );
}