export function requireFields(payload, fields) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');

  if (missing.length) {
    const error = new Error(`Missing fields: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
}
