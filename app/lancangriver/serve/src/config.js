export function getConfig() {
  const port = Number(process.env.PORT || 3000);

  return {
    port: Number.isFinite(port) ? port : 3000
  };
}
