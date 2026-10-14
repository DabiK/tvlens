---
id: T048
titre: Warn at server start when the listen address is neither loopback nor Tailscale
statut: a-faire
bloque_par: T028, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le serveur écoute sur l'adresse donnée par `TVLENS_BIND` sans la regarder : `0.0.0.0` ou une adresse
publique passe sans un mot, et un `TVLENS_PORT` mal écrit n'est pas refusé comme les autres réglages.
Après ce ticket, l'adresse et le port d'écoute sont lus avec les autres réglages de l'hôte, un port
invalide refuse le démarrage, et une adresse qui n'est ni locale ni Tailscale produit un avertissement
au démarrage. Aucune adresse n'est refusée.

## Sources

- Constats : SEC-03
- Code vérifié à la version `0d5a954` (chercher par nom, les lignes bougeront) :
  - `server/main.cjs`, `settings(env = process.env)` (l.9-21) : rend
    `{questionTimeoutMs, surveillance, retentionMs, disk:{minFreeBytes, warnFreeBytes}}` ; l'aide locale
    `checked(name, valid, expected)` lève `Réglage ${name} invalide : ${expected}.`.
  - `server/main.cjs`, `main()` (l.22-45) : l.40,
    `.listen(Number(process.env.TVLENS_PORT||8787),process.env.TVLENS_BIND||'127.0.0.1')`, hors de
    `settings()` ; l.41, la ligne de démarrage `console.log('TVLens server '+server.url+' — device token
    stored in '+tokenFile)`.
  - `server/http.cjs`, `RemoteServer.listen(port = 8787, host = "127.0.0.1")` (l.18).
  - `deploy/runtime.env.example` l.1-4 : « Explicitly set YOUR server's Tailscale IP. », « Never use
    0.0.0.0 for a private-only installation. », `TVLENS_BIND=127.0.0.1`, `TVLENS_PORT=8787`.
  - Test existant : `tests/server-sessions.test.cjs`, « the server host reads its reversible settings
    strictly, and no longer sweeps media at start » (l.619) : deux `deepEqual` sur `settings({})` (l.621) et sur
    `settings({… TVLENS_PORT: '1'})` (l.622), puis `assert.throws` sur `Réglage <nom> invalide`. Le
    second passe déjà `TVLENS_PORT: '1'`, qu'aucun champ ne reprend aujourd'hui.
  - Un port hors bornes fait déjà échouer le démarrage aujourd'hui, mais plus tard et en anglais : c'est
    `listen` de Node qui lève. Le refus par `checked` n'ajoute donc aucun cas d'arrêt, il le nomme.
- Le constat est classé P2 : l'accès reste protégé par le jeton d'appareil. Le ticket rend visible un
  mauvais réglage, il ne corrige pas une faille ouverte.

## Périmètre

- À modifier : `server/main.cjs`, `tests/server-sessions.test.cjs`.
- Forme retenue :
  - `settings()` rend en plus `listen: { host, port, warning }`.
  - `TVLENS_PORT` passe par `checked` : entier de 0 à 65535, 8787 par défaut ; sinon
    « Réglage TVLENS_PORT invalide : … ».
  - `host` vaut `TVLENS_BIND` ou `127.0.0.1`.
  - `warning` vaut `null` pour une adresse locale (`127.0.0.0/8`, `::1`, `localhost`) ou Tailscale
    (`100.64.0.0/10`, `fd7a:115c:a1e0::/48`). Pour toute autre valeur (`0.0.0.0`, `::`, adresse de
    réseau local ou publique, nom d'hôte), c'est une phrase en français qui nomme l'adresse, par
    exemple « Écoute sur 0.0.0.0 : cette adresse n'est ni locale ni Tailscale, le serveur est
    joignable au-delà du réseau privé. ».
  - `main()` écoute sur le `listen` rendu par `settings()` (plus de seconde lecture de `TVLENS_PORT`
    ni de `TVLENS_BIND` dans le fichier) et, quand `warning` n'est pas `null`, l'écrit par
    `console.log`, comme sa ligne de démarrage.
- À ne pas toucher : `server/http.cjs` ; `deploy/` ; les valeurs par défaut ; l'authentification par
  jeton. Aucune adresse n'est refusée par ce ticket.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `settings({}).listen` vaut exactement `{ host: '127.0.0.1', port: 8787, warning: null }`.
2. `settings({ TVLENS_PORT: 'abc' })`, `settings({ TVLENS_PORT: '70000' })` et
   `settings({ TVLENS_PORT: '-1' })` lèvent une erreur dont le message correspond à
   `/Réglage TVLENS_PORT invalide/`.
3. `warning` est `null` pour `127.0.0.1`, `127.8.9.1`, `::1`, `localhost`, `100.64.0.1`,
   `100.127.255.254` et `fd7a:115c:a1e0::1`.
4. `warning` est une chaîne qui contient l'adresse pour `0.0.0.0`, `::`, `192.168.1.10`, `100.63.0.1`,
   `100.128.0.1`, `203.0.113.7` et `tv.example.net`.
5. Le test existant « the server host reads its reversible settings strictly, and no longer sweeps
   media at start » garde toutes ses assertions ; ses deux `deepEqual` reçoivent le champ `listen` en
   plus, rien n'en est retiré : `{ host: '127.0.0.1', port: 8787, warning: null }` pour le premier,
   `{ host: '127.0.0.1', port: 1, warning: null }` pour le second.
6. `grep -n "process.env.TVLENS_PORT\|process.env.TVLENS_BIND" server/main.cjs` n'affiche aucune
   ligne : `main()` ne lit plus ces deux réglages hors de `settings()`.
7. `node --test --test-concurrency=1 tests/server-sessions.test.cjs` passe ; `node scripts/check.mjs`
   est vert.

## Test d'acceptation attendu

Dans `tests/server-sessions.test.cjs`, par la fonction exportée `settings(env)` de `server/main.cjs`,
comme le test existant. `main()` n'a aucun test hors ligne (il compose le serveur réel et écoute) :
le passage de `listen` à l'écoute et l'écriture de l'avertissement tiennent en deux lignes et sont
relus, le critère 6 garde seulement qu'aucune seconde lecture ne subsiste.

## Hypothèses bloquantes

Aucune décision n'est attendue. Refuser `0.0.0.0` ou `::` sans réglage explicite est une autre
question, laissée au propriétaire et reportée hors de ce ticket. Les plages Tailscale retenues
(`100.64.0.0/10`, `fd7a:115c:a1e0::/48`) ne figurent nulle part dans le dépôt : si une documentation
du dépôt en donne d'autres, la session suit le dépôt et le note au journal.

## Journal
