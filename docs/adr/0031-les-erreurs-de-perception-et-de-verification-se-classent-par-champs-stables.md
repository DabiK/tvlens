# 0031 — Les erreurs de perception et de vérification se classent par champs stables

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/125-decide-description-retries-and-verifier-failures-on-error.md`
- Statut : acceptée

## Contexte

L’[ADR 0008](0008-description-redemandee-une-fois-apres-un-echec-passager.md) définit la redemande
d’une description et signale la dette des messages de transport recopiés dans son lecteur.
Les émetteurs Codex et locaux fournissent désormais des codes stables et les champs nécessaires.
La perception et le vérificateur lisaient encore les messages : leur reformulation pouvait changer
la décision sans changement de l’issue réelle.

## Décision

Cette décision remplace seulement la classification textuelle de l’ADR 0008. Les conditions de
redemande dans `WatchSession`, la limite d’un second appel, le plafond de 45 s, le marqueur
`TVLENS_VISION_TRANSIENT`, ses compteurs et la conservation de la cause restent ceux de cet ADR.
Les codes sont posés à la source ; les deux lecteurs importent les constantes de leurs émetteurs,
y compris les modules de notifications et d’exécution des tours.

Dans `CodexPerception.observeVisual`, l’ordre reste : appelant annulé, refus, preuve de l’échéance
propre, puis transport passager. Les refus sont cherchés sur quatre niveaux, erreur comprise :

- `authRequired === true` ; codes Codex `INPUT_REFUSED`, `CONFINEMENT_REFUSED`, `TOOL_REFUSED`,
  `SESSION_CLOSED` ; codes locaux `INPUT_REFUSED`, `CLOSED` ;
- code local `UNAVAILABLE` avec `httpStatus` entier entre 400 et 499.

Une échéance expirée est prouvée par l’identité avec `deadline.reason`, ou par
`turnStatus === 'interrupted'` avec `turnError === undefined`. Un délai expiré à côté d’une erreur
inconnue ne prouve rien. Sans refus ni annulation, sont aussi passagers :

- codes Codex `CONNECTION_LOST`, `DISCONNECTED`, ou `REQUEST_TIMEOUT` avec `method` égal à
  `initialize` ou `thread/start` ;
- code local `UNREACHABLE`, ou `UNAVAILABLE` avec `httpStatus` entier entre 500 et 599.

Ces noms abrègent les constantes `TVLENS_CODEX_*` et `TVLENS_LOCAL_VLM_*`. Toute autre issue reste
définitive, notamment `REQUEST_CUT`, le délai de `turn/start`, un statut HTTP absent ou invalide,
et un tour interrompu avec son propre détail d’échec.

Dans `CodexVerifier.verify`, `TOOL_REFUSED` produit le message fixe d’outil hors périmètre.
`CONFINEMENT_REFUSED`, `ROLE_REFUSED` ou `authRequired` conservent l’erreur d’origine.
`SyntaxError` et le défaut gardent leurs messages actuels. La classification ne lit aucun message,
préfixe ou expression régulière ; il n’existe aucun repli sur les anciens textes.

## Alternatives écartées

- Garder les messages comme repli : leur reformulation continuerait à modifier les décisions.
- Généraliser les reprises à tous les délais ou détails fournisseur : cela élargirait la politique
  de l’ADR 0008, notamment lorsqu’un tour non acquitté peut encore tourner.

## Conséquences

Les messages peuvent évoluer sans modifier ces décisions. Un nouvel émetteur doit fournir le code
et les champs convenus ; un ancien message sans code ne suffit plus. Les erreurs des vrais
émetteurs conservent leurs décisions. Les transports, les hôtes et le domaine ne changent pas.

## Protégée par

- `tests/architecture-f08.test.cjs` : codes et messages contradictoires, priorité de chaque refus
  jusqu’au quatrième niveau, échéance pilotée, vrais émetteurs et redemande dans `WatchSession`.
- `tests/verification.test.cjs` : diagnostic fixe d’outil, identité des refus de confinement,
  rôle et authentification, absence de repli textuel et confinement réel.
- Mutations isolées retirant `TOOL_REFUSED` de chacun des lecteurs, et `node scripts/check.mjs`.
