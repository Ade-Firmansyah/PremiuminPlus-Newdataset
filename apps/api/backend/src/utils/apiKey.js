const crypto = require('crypto');

function generateApiKey(prefix = 'pp') {
  return `${prefix}_${crypto.randomBytes(32).toString('hex')}`;
}

function maskApiKey(apiKey) {
  const value = String(apiKey || '');
  if (!value) return '';
  if (value.length <= 8) return `${value.slice(0, 2)}****${value.slice(-2)}`;
  return `${value.slice(0, 4)}********${value.slice(-4)}`;
}

module.exports = { generateApiKey, maskApiKey };
