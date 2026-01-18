import React from "react";
import { Link, Route, Routes } from "react-router-dom";

// Direct imports for SSR compatibility (no lazy loading)
import Home from "./pages/Homepage.js";
import Todos from "./pages/TodosPage.js";
import About from "./pages/About.js";
import NotFound from "./pages/NotFound.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";

export function App() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
