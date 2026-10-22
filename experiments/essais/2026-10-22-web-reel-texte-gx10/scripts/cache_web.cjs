// H4 cache: for each W/M question, run the product's SearXNG retrieval (the adapter of the trial branch) on the model's
// query (H2, arm P, first passage: no source title, as the product today) and on the raw question, and keep every
// opened page in full. Two limits of the product are raised before its modules load, so that text selections can be
// compared offline: page text kept whole (the product cuts at 2 500 characters) and up to 5 documents (the product keeps
// 3 of the 5 results it opens). One search every SPACING_MS against the upstream engines' rate limits.
// Usage: node cache_web.cjs <checkout> <h2 calls.jsonl> <questions-wmo.json> <out dir> <searxng url>
const fs = require('fs');
const path = require('path');
const [checkout, h2Calls, questionsFile, outDir, searxngUrl] = process.argv.slice(2);
const webRules = require(path.join(checkout, 'core/web-retrieval.cjs'));
webRules.WEB_TEXT_MAX_CHARS = 200000;
webRules.WEB_DOCUMENT_LIMIT = 5;
const { SearxngRetrieval } = require(path.join(checkout, 'adapters/web/searxng.cjs'));
const SPACING_MS = 8000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const queries = {};
  for (const line of fs.readFileSync(h2Calls, 'utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    if (row.arm === 'P' && row.pass === 1 && ['W', 'M'].includes(row.category)) queries[row.case] = row.decision;
  }
  const questions = JSON.parse(fs.readFileSync(questionsFile, 'utf8'));
  const retrieval = new SearxngRetrieval({ url: searxngUrl });
  fs.mkdirSync(path.join(outDir, 'texte'), { recursive: true });
  const pages = {};
  const log = fs.createWriteStream(path.join(outDir, 'recherches.jsonl'));
  for (const [video, list] of Object.entries(questions)) {
    for (const question of list.filter(q => ['W', 'M'].includes(q.category))) {
      const decision = queries[question.questionId] || {};
      const asked = [['raw', question.askedQuestion]];
      if (decision.web && decision.query) asked.unshift(['model', decision.query]);
      for (const [kind, query] of asked) {
        const began = Date.now();
        let outcome;
        try {
          outcome = await retrieval.retrieve({ query });
        } catch (error) {
          outcome = { documents: [], limits: [], error: error.code || error.name };
        }
        const urls = [];
        for (const document of outcome.documents) {
          const key = require('crypto').createHash('sha256').update(document.url).digest('hex').slice(0, 16);
          if (!pages[document.url]) {
            fs.writeFileSync(path.join(outDir, 'texte', key + '.txt'), document.text);
            pages[document.url] = { url: document.url, key, title: document.title, textChars: document.text.length, status: 200 };
          }
          urls.push(document.url);
        }
        log.write(JSON.stringify({ video, case: question.questionId, category: question.category, kind, query, urls,
          limits: outcome.limits, error: outcome.error || null, wallMs: Date.now() - began }) + '\n');
        console.log(question.questionId, kind, urls.length, Date.now() - began, 'ms', outcome.error || '');
        await sleep(SPACING_MS);
      }
    }
  }
  fs.writeFileSync(path.join(outDir, 'manifeste.json'), JSON.stringify(Object.values(pages), null, 1));
  log.end();
}

main();
