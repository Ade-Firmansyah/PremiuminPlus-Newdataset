export function createLogger(scope) {
  return {
    info(message, meta = {}) {
      console.log(`[${scope}]`, message, meta);
    },
    error(message, meta = {}) {
      console.error(`[${scope}]`, message, meta);
    },
  };
}
