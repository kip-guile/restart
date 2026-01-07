import React, { Suspense } from "react";
import { Link, Route, Routes } from "react-router-dom";

const Home = React.lazy(() => import("./pages/Homepage.js"));
const Todos = React.lazy(() => import("./pages/TodosPage.js"));
const About = React.lazy(() => import("./pages/About.js"));
const NotFound = React.lazy(() => import("./pages/NotFound.js"));

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
        <Suspense fallback={<p>Loading page…</p>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/todos" element={<Todos />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </section>
    </main>
  );
}
