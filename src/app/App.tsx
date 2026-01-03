import React from "react";
import { useSelector } from "react-redux";
import { Link, Route, Routes } from "react-router-dom";
import type { RootState } from "./store/store.js";
import { useGetTodosQuery } from "./store/api.js";

function Home() {
    const [message, setMessage] = React.useState<string>("Loading...");
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
    async function load() {
        try {
        const res = await fetch("/api/hello");
        if (!res.ok) {
            throw new Error(`BFF returned ${res.status}`);
        }
        const data = (await res.json()) as { message: string };
        setMessage(data.message);
        } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
        }
    }

    void load();
    }, []);

  return (
    <>
      <h2>Home</h2>
       <section className="card">
        <h2>BFF check</h2>
        {error ? <p className="error">Error: {error}</p> : <p>{message}</p>}
      </section>
      <p>This is Alexander&apos;s project. He&apos;s having fun over here.</p>
    </>
  );
}

function Todos() {
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

  if (bootstrap.page.kind !== "todos") {
    return (
      <div>
        <h2>Todos</h2>
        <p>This route is not /todos.</p>
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
        {data?.map((t) => (
          <li key={t.id}>
            {t.completed ? "✅" : "⬜"} {t.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

function About() {
  const message = useSelector((s: RootState) => s.app.message);

  return (
    <>
      <h2>About</h2>
      <p>{message ?? "Loading..."}</p>
      <p>This project is for frontend system design practice.</p>
    </>
  );
}

function NotFound() {
  return (
    <>
      <h2>Not found</h2>
      <p>
        <Link to="/">Go home</Link>
      </p>
    </>
  );
}

export function App() {
  return (
    <main className="page">
      <header className="header">
        <h1>Restart</h1>
        <nav className="nav">
          <Link className="first" to="/">Home</Link>
          <Link className="first" to="/about">About</Link>
          <Link to="/todos">Todos</Link>
        </nav>
      </header>

      <section className="card">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/todos" element={<Todos />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </section>
    </main>
  );
}
