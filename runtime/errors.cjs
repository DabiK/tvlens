// Le transport utilise le statut et le code ; le message reste destiné au demandeur.
const refusal = (status, message, code) =>
  Object.assign(new Error(message), { status, code });

module.exports = { refusal };
