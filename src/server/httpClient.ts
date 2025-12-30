export type HttpClient = {
  getJson<T>(
    url: string,
    opts?: { timeoutMs?: number; retries?: number },
  ): Promise<T>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function createHttpClient(params: { requestId: string }): HttpClient {
  async function getJson<T>(
    url: string,
    opts?: { timeoutMs?: number; retries?: number },
  ): Promise<T> {
    const timeoutMs = opts?.timeoutMs ?? 1500;
    const retries = opts?.retries ?? 1;

    let attempt = 0;
    let lastErr: unknown = null;

    while (attempt <= retries) {
      attempt += 1;

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);

      const start = process.hrtime.bigint();
      try {
        const res = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: {
            accept: "application/json",
            "x-request-id": params.requestId,
          },
        });

        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1_000_000;
        console.log(
          `[${params.requestId}] GET ${url} (${durationMs.toFixed(2)}ms)`,
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `GET ${url} failed: ${res.status} ${res.statusText} (${durationMs.toFixed(2)}ms) ${text}`,
          );
        }

        const data = (await res.json()) as T;
        return data;
      } catch (err) {
        lastErr = err;

        // Retry only for network like failures and timeouts
        const isAbort = err instanceof Error && err.name === "AbortError";
        const isNetwork = err instanceof TypeError;
        const retryable = isAbort || isNetwork;

        if (!retryable || attempt > retries) throw err;

        // basic backoff
        await sleep(100 * attempt);
      } finally {
        clearTimeout(t);
      }
    }

    throw lastErr;
  }

  return { getJson };
}
