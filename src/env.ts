export function getPort(defaultPort = 3000): number {
  const raw = process.env.PORT;

  if (raw == null || raw.trim() === "") {
    return defaultPort;
  }

  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT value "${raw}". Expected an integer between 1 and 65535.`,
    );
  }

  return port;
}
