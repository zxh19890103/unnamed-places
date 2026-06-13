export function getConfig() {
  const rawPort = process.env.PORT;
  const normalizedPort = rawPort?.trim() ?? '';
  const hasIntegerFormat = /^\d+$/.test(normalizedPort);
  const parsedPort = hasIntegerFormat ? Number.parseInt(normalizedPort, 10) : Number.NaN;
  const isValidPort = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535;

  return {
    port: isValidPort ? parsedPort : 4050
  };
}
