// Une reprise ne crée pas une nouvelle origine : seule une session créée dans cette vie peut être écartée.
function isEmptySession({ fresh, jobs, questions, passages }) {
  return fresh === true && jobs === 0 && questions === 0 && passages === 0;
}

module.exports = { isEmptySession };
