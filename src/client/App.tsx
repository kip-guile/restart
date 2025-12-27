import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, Route, Routes } from "react-router-dom";
import type { RootState, AppDispatch } from "./store/store";
import { setMessage as setGlobalMessage } from "./store/store";

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
        const data: { message: string } = await res.json();
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

function About() {
  const dispatch = useDispatch<AppDispatch>();
  const message = useSelector((s: RootState) => s.app.message);

  React.useEffect(() => {
    // In prod, message can already exist from injected state, so do nothing
    if (message) return;

    // In dev, fetch from BFF so you still start with real data
    async function load() {
      const res = await fetch("/api/injected");
      const data: { message: string } = await res.json();
      dispatch(setGlobalMessage(data.message));
    }

    void load();
  }, [dispatch, message]);

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
          <Link to="/about">About</Link>
        </nav>
      </header>

      <section className="card">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </section>
    </main>
  );
}
