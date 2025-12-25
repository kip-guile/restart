import React from "react";
import { Link, Route, Routes } from "react-router-dom";

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
  return (
    <>
      <h2>About</h2>
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
          <Link to="/">Home</Link>
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
