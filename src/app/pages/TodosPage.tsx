import React from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../store/store.js";
import { useGetTodosQuery } from "../store/api.js";
import type { Todo } from "../../shared/bootstrap.js"

export default function Todos() {
  const bootstrap = useSelector((s: RootState) => s.app.bootstrap);

  if (!bootstrap) return <p>Loading...</p>;

  if (bootstrap.page.kind === "error") {
    return (
      <div>
        <h2>Todos</h2>
        <p>{bootstrap.page.message}</p>
      </div>
    );
  }

  // RTK Query fetch
  const { data, isLoading, error, refetch } = useGetTodosQuery();

  if (isLoading) return <p>Loading todos...</p>;

  if (error) {
    return (
      <div>
        <p>Failed to load todos.</p>
        <button onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return (
     <div>
      <h2>Todos</h2>
      <ul>
        {data?.map((t: Todo) => (
          <li key={t.id}>
            {t.completed ? "✅" : "⬜"} {t.title}
          </li>
        ))}
      </ul>
    </div>
  );
}