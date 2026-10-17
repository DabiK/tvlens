const domainError = (code, message, cause) =>
  Object.assign(new Error(message, { cause }), { code });

module.exports = { domainError };
