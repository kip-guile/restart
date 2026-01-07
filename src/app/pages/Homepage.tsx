import React from "react";

export default function Home() {
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