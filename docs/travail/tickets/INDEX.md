# Tickets de remédiation

Les tickets sont numérotés dans l'ordre où la boucle les prend : un ticket ne part que si tous ceux de sa colonne « Dépend de » sont
terminés. Le statut de chacun est dans son en-tête, pas ici. Chaque constat cité renvoie au
[rapport d'audit](../../audit-maintenabilite.md).

| Ticket | Titre | Lot | Dépend de | À savoir | Constats |
| --- | --- | --- | --- | --- | --- |
| [T001](001-resent-block-duplicate-without-race.md) | Prove the duplicate answer to a resent block without racing the ingestion lane | essai | — | terminé pendant l'essai de la boucle | [TSTA-01](../../audit-maintenabilite.md#TSTA-01), [FLK-01](../../audit-maintenabilite.md#FLK-01) |
| [T002](002-refuse-a-ticket-whose-final-change-differs-from-the-one-its.md) | Refuse a ticket whose final change differs from the one its reviewer read | L18 | T001 | touche au harnais | [ESSAI-02](../../audit-maintenabilite.md#ESSAI-02) |
| [T003](003-never-start-a-ticket-that-still-waits-for-an-owner-decision.md) | Never start a ticket that still waits for an owner decision | L18 | T002 | touche au harnais | [ESSAI-06](../../audit-maintenabilite.md#ESSAI-06) |
| [T004](004-wait-for-the-turn-request-itself-in-the-verifier-deadline.md) | Wait for the turn request itself in the verifier deadline test | L01 | — | — | [FLK-02](../../audit-maintenabilite.md#FLK-02), [OUBLI-36](../../audit-maintenabilite.md#OUBLI-36), [OUBLI-37](../../audit-maintenabilite.md#OUBLI-37) |
| [T005](005-let-a-codex-turn-left-in-flight-stop-holding-its-process.md) | Let a Codex turn left in flight stop holding its process alive | L01 | T004 | — | [OUBLI-11](../../audit-maintenabilite.md#OUBLI-11) |
| [T006](006-read-the-session-folder-only-after-the-store-has-finished.md) | Read the session folder only after the store has finished writing | L01 | — | — | [FLK-03](../../audit-maintenabilite.md#FLK-03), [OUBLI-36](../../audit-maintenabilite.md#OUBLI-36) |
| [T007](007-add-a-test-launcher-that-stops-and-names-a-test-file-that.md) | Add a test launcher that stops and names a test file that hangs | L01 | T145 | touche au harnais | [FLK-05](../../audit-maintenabilite.md#FLK-05), [FLK-13](../../audit-maintenabilite.md#FLK-13), [OUBLI-37](../../audit-maintenabilite.md#OUBLI-37) |
| [T008](008-ship-the-slow-disk-and-stalled-process-probes-for-flaky.md) | Ship the slow-disk and stalled-process probes for flaky tests | L01 | T007, T145 | — | [FLK-16](../../audit-maintenabilite.md#FLK-16) |
| [T009](009-skip-by-name-or-fail-on-demand-the-tests-that-need-ffmpeg.md) | Skip by name, or fail on demand, the tests that need ffmpeg | L01 | T145 | — | [TSTB-01](../../audit-maintenabilite.md#TSTB-01), [OPS-06](../../audit-maintenabilite.md#OPS-06), [FLK-14](../../audit-maintenabilite.md#FLK-14) |
| [T010](010-link-no-real-codex-credential-when-the-transport-is-a-test.md) | Link no real Codex credential when the transport is a test double | L01 | T145 | — | [TSTB-01](../../audit-maintenabilite.md#TSTB-01), [FLK-15](../../audit-maintenabilite.md#FLK-15) |
| [T011](011-declare-the-node-version-the-project-runs-on-and-refuse.md) | Declare the Node version the project runs on and refuse older ones | L01 | T145 | — | [OPS-01](../../audit-maintenabilite.md#OPS-01), [TSTC-11](../../audit-maintenabilite.md#TSTC-11), [FLK-14](../../audit-maintenabilite.md#FLK-14) |
| [T012](012-run-npm-test-and-the-quality-check-through-the-test-launcher.md) | Run npm test and the quality check through the test launcher | L01 | T007, T145 | touche au harnais | [FLK-05](../../audit-maintenabilite.md#FLK-05), [FLK-13](../../audit-maintenabilite.md#FLK-13), [OUBLI-37](../../audit-maintenabilite.md#OUBLI-37) |
| [T013](013-give-each-test-file-a-private-temp-directory-and-report-what.md) | Give each test file a private temp directory and report what it leaves | L01 | T012, T145 | touche au harnais | [FLK-13](../../audit-maintenabilite.md#FLK-13), [FLK-15](../../audit-maintenabilite.md#FLK-15) |
| [T014](014-run-every-python-test-from-npm-test-and-from-the-quality.md) | Run every Python test from npm test and from the quality check | L01 | T009, T012, T145 | touche au harnais | [TSTC-08](../../audit-maintenabilite.md#TSTC-08), [OUBLI-41](../../audit-maintenabilite.md#OUBLI-41), [OPS-06](../../audit-maintenabilite.md#OPS-06), [FLK-14](../../audit-maintenabilite.md#FLK-14) |
| [T015](015-make-the-mac-window-source-text-assertions-independent-of.md) | Make the Mac window source-text assertions independent of code layout | L02 | T152 | — | [UI-01](../../audit-maintenabilite.md#UI-01), [OUBLI-24](../../audit-maintenabilite.md#OUBLI-24) |
| [T016](016-make-the-static-guards-of-the-mac-renderer-fail-when-they.md) | Make the static guards of the Mac renderer fail when they scan nothing | L02 | T015, T145 | — | [TSTC-04](../../audit-maintenabilite.md#TSTC-04) |
| [T017](017-move-the-search-sequencing-of-the-mac-window-into-a-tested.md) | Move the search sequencing of the Mac window into a tested controller | L02 | T015 | — | [TSTC-01](../../audit-maintenabilite.md#TSTC-01) |
| [T018](018-extract-the-reception-rules-of-the-mac-window-as-pure-tested.md) | Extract the reception rules of the Mac window as pure tested functions | L02 | T015 | — | [TSTC-02](../../audit-maintenabilite.md#TSTC-02) |
| [T019](019-declare-the-ipc-channels-of-the-mac-host-once-and-check-them.md) | Declare the IPC channels of the Mac host once and check them at runtime | L02 | T015, T145 | — | [TSTC-03](../../audit-maintenabilite.md#TSTC-03), [OUBLI-15](../../audit-maintenabilite.md#OUBLI-15) |
| [T020](020-prove-on-the-mac-bench-that-a-question-leaves-a-manual.md) | Prove on the Mac bench that a question leaves a manual verification running | L02 | T145 | — | [TSTC-03](../../audit-maintenabilite.md#TSTC-03) |
| [T021](021-import-the-rolling-recorder-in-its-tests-instead-of.md) | Import the rolling recorder in its tests instead of rewriting its source | L02 | T145 | — | [TSTC-07](../../audit-maintenabilite.md#TSTC-07) |
| [T022](022-declare-the-tv-drop-causes-once-and-prove-each-one-has-its.md) | Declare the TV drop causes once and prove each one has its words | L02 | T145 | — | [TSTC-13](../../audit-maintenabilite.md#TSTC-13) |
| [T023](023-share-the-comment-stripping-of-the-static-guards-and-free.md) | Share the comment stripping of the static guards and free one from quote style | L02 | T015, T145 | — | [TSTA-08](../../audit-maintenabilite.md#TSTA-08) |
| [T024](024-make-the-remaining-static-guards-tolerant-of-quotes-and-line.md) | Make the remaining static guards tolerant of quotes and line breaks | L02 | T015, T145 | — | [TSTC-15](../../audit-maintenabilite.md#TSTC-15) |
| [T025](025-state-the-layer-rules-as-one-table-in-the-architecture-test.md) | State the layer rules as one table in the architecture test | L02 | T023, T145 | — | [TSTA-08](../../audit-maintenabilite.md#TSTA-08), [TSTB-19](../../audit-maintenabilite.md#TSTB-19) |
| [T026](026-install-prettier-with-default-settings-and-a-staged-ignore.md) | Install Prettier with default settings and a staged ignore list | L03 | T145 | demande un ADR ; installe une dépendance | [OPS-02](../../audit-maintenabilite.md#OPS-02), [ADP-15](../../audit-maintenabilite.md#ADP-15), [OUBLI-27](../../audit-maintenabilite.md#OUBLI-27), [OPS-07](../../audit-maintenabilite.md#OPS-07) |
| [T027](027-prove-the-full-suite-passes-on-a-prettier-formatted-copy-of.md) | Prove the full suite passes on a Prettier-formatted copy of the tree | L03 | T016, T017, T018, T019, T020, T021, T022, T024, T025, T026, T145 | — | [OPS-02](../../audit-maintenabilite.md#OPS-02), [OUBLI-43](../../audit-maintenabilite.md#OUBLI-43) |
| [T028](028-format-every-javascript-file-of-the-product-with-prettier.md) | Format every JavaScript file of the product with Prettier | L03 | T027, T145 | — | [OPS-02](../../audit-maintenabilite.md#OPS-02), [ADP-15](../../audit-maintenabilite.md#ADP-15) |
| [T029](029-ignore-the-formatting-commit-in-blame-and-pin-line-endings.md) | Ignore the formatting commit in blame and pin line endings | L03 | T028, T145 | — | [OPS-02](../../audit-maintenabilite.md#OPS-02), [OPS-19](../../audit-maintenabilite.md#OPS-19) |
| [T030](030-guard-the-boundaries-the-layer-table-leaves-open-in-the.md) | Guard the boundaries the layer table leaves open in the architecture test | L03 | T016, T017, T018, T019, T020, T021, T022, T024, T025, T145 | — | [OPS-04](../../audit-maintenabilite.md#OPS-04), [OUBLI-19](../../audit-maintenabilite.md#OUBLI-19), [OUBLI-06](../../audit-maintenabilite.md#OUBLI-06) |
| [T031](031-lint-with-eslint-in-the-quality-check-and-freeze-the.md) | Lint with ESLint in the quality check and freeze the existing violations | L03 | T028, T145 | demande un ADR ; installe une dépendance ; touche au harnais | [OPS-03](../../audit-maintenabilite.md#OPS-03), [ADP-15](../../audit-maintenabilite.md#ADP-15), [OUBLI-27](../../audit-maintenabilite.md#OUBLI-27), [OPS-07](../../audit-maintenabilite.md#OPS-07) |
| [T032](032-refuse-any-growth-of-the-frozen-lint-violations-in-the.md) | Refuse any growth of the frozen lint violations in the quality check | L03 | T031, T145 | touche au harnais | [OPS-03](../../audit-maintenabilite.md#OPS-03) |
| [T033](033-remove-the-unused-variables-that-eslint-reports.md) | Remove the unused variables that ESLint reports | L03 | T032, T145 | — | [OPS-03](../../audit-maintenabilite.md#OPS-03) |
| [T034](034-add-a-type-check-step-and-a-typed-files-measure-to-the.md) | Add a type-check step and a typed-files measure to the quality check | L03 | T032, T145 | demande un ADR ; installe une dépendance ; touche au harnais | [OPS-14](../../audit-maintenabilite.md#OPS-14), [ADP-15](../../audit-maintenabilite.md#ADP-15), [OPS-07](../../audit-maintenabilite.md#OPS-07) |
| [T035](035-type-check-ten-more-core-files-through-jsdoc-annotations.md) | Type-check ten more core files through JSDoc annotations | L03 | T034, T145 | — | [OPS-14](../../audit-maintenabilite.md#OPS-14) |
| [T036](036-add-a-journal-port-with-a-stderr-sink-and-a-contract-test.md) | Add a journal port with a stderr sink and a contract test | L17 | T145 | demande un ADR | [GAP1-01](../../audit-maintenabilite.md#GAP1-01), [GAP1-10](../../audit-maintenabilite.md#GAP1-10), [OUBLI-57](../../audit-maintenabilite.md#OUBLI-57) |
| [T037](037-freeze-a-reference-session-archive-and-prove-the-current.md) | Freeze a reference session archive and prove the current code reads it | L17 | T145 | — | [GAP2-01](../../audit-maintenabilite.md#GAP2-01), [GAP2-02](../../audit-maintenabilite.md#GAP2-02), [GAP2-10](../../audit-maintenabilite.md#GAP2-10), [OUBLI-53](../../audit-maintenabilite.md#OUBLI-53) |
| [T038](038-exercise-the-v1-wire-with-the-real-tv-client-and-write-its.md) | Exercise the /v1 wire with the real TV client and write its compatibility rule | L17 | T145 | demande un ADR | [GAP3-01](../../audit-maintenabilite.md#GAP3-01), [GAP3-02](../../audit-maintenabilite.md#GAP3-02), [OUBLI-49](../../audit-maintenabilite.md#OUBLI-49) |
| [T039](039-journal-every-refused-http-request-with-its-route-status-and.md) | Journal every refused HTTP request with its route, status and block identity | L17 | T036, T145 | — | [GAP1-02](../../audit-maintenabilite.md#GAP1-02) |
| [T040](040-serialize-errors-for-the-journal-with-their-cause-system.md) | Serialize errors for the journal with their cause, system code and a short stack | L17 | T036, T145 | — | [GAP1-04](../../audit-maintenabilite.md#GAP1-04), [OUBLI-58](../../audit-maintenabilite.md#OUBLI-58) |
| [T041](041-journal-the-start-the-stop-and-the-last-resort-failure-of.md) | Journal the start, the stop and the last-resort failure of the server host | L17 | T039, T145 | — | [OUBLI-55](../../audit-maintenabilite.md#OUBLI-55), [GAP1-05](../../audit-maintenabilite.md#GAP1-05) |
| [T042](042-pin-the-status-and-code-of-every-block-refusal-the-tv.md) | Pin the status and code of every block refusal the TV capture reads | L17 | T038, T145 | — | [GAP3-05](../../audit-maintenabilite.md#GAP3-05), [GAP3-02](../../audit-maintenabilite.md#GAP3-02) |
| [T043](043-name-the-surveillance-registry-version-and-report-an-unknown.md) | Name the surveillance registry version and report an unknown one when reopened | L17 | T037, T038, T145 | — | [GAP2-04](../../audit-maintenabilite.md#GAP2-04) |
| [T044](044-publish-the-server-version-and-capabilities-in-the-session.md) | Publish the server version and capabilities in the session answer | L17 | T038, T145 | — | [GAP3-03](../../audit-maintenabilite.md#GAP3-03) |
| [T045](045-replay-the-server-refusals-through-the-tv-transport.md) | Replay the server refusals through the TV transport | L17 | T042, T145 | — | [GAP3-05](../../audit-maintenabilite.md#GAP3-05), [GAP3-02](../../audit-maintenabilite.md#GAP3-02) |
| [T046](046-reject-the-active-codex-turn-when-its-event-handler-throws.md) | Reject the active Codex turn when its event handler throws | L04 | T028, T145 | — | [ADP-01](../../audit-maintenabilite.md#ADP-01) |
| [T047](047-keep-the-redacted-codex-refusal-detail-as-the-cause-of-the.md) | Keep the redacted Codex refusal detail as the cause of the fixed message | L04 | T046, T145 | — | [ADP-02](../../audit-maintenabilite.md#ADP-02) |
| [T048](048-warn-at-server-start-when-the-listen-address-is-neither.md) | Warn at server start when the listen address is neither loopback nor Tailscale | L04 | T028, T145 | — | [SEC-03](../../audit-maintenabilite.md#SEC-03) |
| [T049](049-tell-a-panel-drawing-failure-apart-from-a-server-outage-on.md) | Tell a panel drawing failure apart from a server outage on the TV | L04 | T028, T145 | — | [TV-05](../../audit-maintenabilite.md#TV-05) |
| [T050](050-retry-a-failed-surveillance-registry-read-with-a-bounded.md) | Retry a failed surveillance registry read with a bounded backoff | L04 | T028, T145 | — | [UI-04](../../audit-maintenabilite.md#UI-04) |
| [T051](051-answer-fixed-texts-without-host-paths-to-a-block-refused-for.md) | Answer fixed texts without host paths to a block refused for its content | L04 | T028, T038, T145 | — | [SEC-01](../../audit-maintenabilite.md#SEC-01) |
| [T052](052-answer-an-unexpected-server-error-with-a-generic-500-and.md) | Answer an unexpected server error with a generic 500 and journal it | L04 | T036, T051, T145 | demande un ADR | [SEC-01](../../audit-maintenabilite.md#SEC-01) |
| [T053](053-keep-the-config-read-when-its-cache-fails-and-journal-an.md) | Keep the config read when its cache fails and journal an unreadable cache | L04 | T028, T036, T145 | — | [ADP-03](../../audit-maintenabilite.md#ADP-03), [OUBLI-02](../../audit-maintenabilite.md#OUBLI-02), [ADP-05](../../audit-maintenabilite.md#ADP-05) |
| [T054](054-journal-unreadable-stores-instead-of-treating-them-as-absent.md) | Journal unreadable stores instead of treating them as absent | L04 | T028, T036, T145 | — | [ADP-05](../../audit-maintenabilite.md#ADP-05), [OUBLI-02](../../audit-maintenabilite.md#OUBLI-02) |
| [T055](055-share-the-wait-helpers-of-the-tests-and-make-every-bounded.md) | Share the wait helpers of the tests and make every bounded wait fail aloud | L05 | T028, T145 | — | [FLK-12](../../audit-maintenabilite.md#FLK-12), [TSTA-02](../../audit-maintenabilite.md#TSTA-02), [TSTB-03](../../audit-maintenabilite.md#TSTB-03) |
| [T056](056-move-the-mac-host-bench-out-of-the-ipc-contract-test-into-a.md) | Move the Mac host bench out of the IPC contract test into a shared helper | L05 | T055, T145 | — | [TSTA-04](../../audit-maintenabilite.md#TSTA-04), [TSTC-16](../../audit-maintenabilite.md#TSTC-16), [OUBLI-01](../../audit-maintenabilite.md#OUBLI-01) |
| [T057](057-launch-the-mac-host-from-the-shared-bench-in-the-two.md) | Launch the Mac host from the shared bench in the two remaining test files | L05 | T056, T145 | — | [TSTA-04](../../audit-maintenabilite.md#TSTA-04), [OUBLI-01](../../audit-maintenabilite.md#OUBLI-01), [TSTC-16](../../audit-maintenabilite.md#TSTC-16) |
| [T058](058-share-the-simulated-clocks-of-the-tests-instead-of-importing.md) | Share the simulated clocks of the tests instead of importing one from a script | L05 | T055, T145 | — | [OPS-13](../../audit-maintenabilite.md#OPS-13), [TSTB-04](../../audit-maintenabilite.md#TSTB-04) |
| [T059](059-share-one-hand-written-fake-dom-between-the-recap-view-and.md) | Share one hand-written fake DOM between the recap view and overlay card tests | L05 | T028, T145 | — | [TSTC-06](../../audit-maintenabilite.md#TSTC-06) |
| [T060](060-use-the-shared-wait-helpers-in-the-session-and-moment-index.md) | Use the shared wait helpers in the session and moment index tests | L05 | T055, T145 | — | [FLK-12](../../audit-maintenabilite.md#FLK-12), [TSTA-02](../../audit-maintenabilite.md#TSTA-02), [TSTB-03](../../audit-maintenabilite.md#TSTB-03) |
| [T061](061-use-the-shared-wait-helpers-in-the-server-recording-and.md) | Use the shared wait helpers in the server, recording and Codex client tests | L05 | T055, T145 | — | [FLK-12](../../audit-maintenabilite.md#FLK-12), [TSTA-02](../../audit-maintenabilite.md#TSTA-02), [TSTB-03](../../audit-maintenabilite.md#TSTB-03) |
| [T062](062-leave-no-private-copy-of-a-wait-helper-in-the-test-files.md) | Leave no private copy of a wait helper in the test files | L05 | T056, T060, T061, T145 | — | [FLK-12](../../audit-maintenabilite.md#FLK-12), [TSTA-02](../../audit-maintenabilite.md#TSTA-02), [TSTB-03](../../audit-maintenabilite.md#TSTB-03) |
| [T063](063-share-one-fake-codex-app-server-between-the-verification-and.md) | Share one fake Codex App Server between the verification and surveillance tests | L05 | T061, T145 | — | [TSTA-03](../../audit-maintenabilite.md#TSTA-03), [TSTB-08](../../audit-maintenabilite.md#TSTB-08) |
| [T064](064-start-the-headless-server-host-from-one-shared-helper-in-two.md) | Start the headless server host from one shared helper in two test files | L05 | T061, T145 | — | [OUBLI-38](../../audit-maintenabilite.md#OUBLI-38), [TSTA-04](../../audit-maintenabilite.md#TSTA-04), [TSTB-04](../../audit-maintenabilite.md#TSTB-04) |
| [T065](065-stop-the-mac-launch-when-the-given-config-file-cannot-be.md) | Stop the Mac launch when the given config file cannot be read | L04 | T053, T057, T058, T059, T062, T063, T064, T145 | — | [ADP-03](../../audit-maintenabilite.md#ADP-03) |
| [T066](066-drive-the-question-checkpoint-of-the-server-host-with-an.md) | Drive the question checkpoint of the server host with an injected timer | L06 | T057, T058, T059, T062, T063, T064, T145 | demande un ADR | [FLK-07](../../audit-maintenabilite.md#FLK-07), [OUBLI-12](../../audit-maintenabilite.md#OUBLI-12) |
| [T067](067-hold-the-session-clock-of-the-mac-host-in-its-tests-instead.md) | Hold the session clock of the Mac host in its tests instead of pausing | L06 | T057, T058, T059, T062, T063, T064, T145 | — | [FLK-04](../../audit-maintenabilite.md#FLK-04), [FLK-10](../../audit-maintenabilite.md#FLK-10), [TSTA-13](../../audit-maintenabilite.md#TSTA-13) |
| [T068](068-gate-close-during-reconnect-and-retry-tests-on-a-named-step.md) | Gate close-during-reconnect and retry tests on a named step, not a count | L06 | T057, T058, T059, T062, T063, T064, T145 | — | [FLK-09](../../audit-maintenabilite.md#FLK-09), [OUBLI-13](../../audit-maintenabilite.md#OUBLI-13), [TSTA-11](../../audit-maintenabilite.md#TSTA-11) |
| [T069](069-order-abandoned-run-and-held-write-tests-by-a-signal-instead.md) | Order abandoned-run and held-write tests by a signal instead of a delay | L06 | T057, T058, T059, T062, T063, T064, T145 | — | [FLK-11](../../audit-maintenabilite.md#FLK-11) |
| [T070](070-let-a-test-drive-the-lifetime-of-an-external-mcp-context.md) | Let a test drive the lifetime of an external MCP context | L06 | T066, T145 | — | [FLK-11](../../audit-maintenabilite.md#FLK-11), [TSTB-13](../../audit-maintenabilite.md#TSTB-13) |
| [T071](071-inject-the-disk-into-the-session-store-and-library-with-a.md) | Inject the disk into the session store and library with a fault double | L06 | T057, T058, T059, T062, T063, T064, T145 | demande un ADR | [TSTB-12](../../audit-maintenabilite.md#TSTB-12) |
| [T072](072-let-a-session-say-what-it-still-has-in-flight-and-when-it-is.md) | Let a session say what it still has in flight and when it is at rest | L06 | T071, T145 | demande un ADR | [FLK-06](../../audit-maintenabilite.md#FLK-06) |
| [T073](073-give-the-server-host-a-barrier-that-resolves-once-nothing-is.md) | Give the server host a barrier that resolves once nothing is in flight | L06 | T066, T072, T145 | — | [FLK-06](../../audit-maintenabilite.md#FLK-06) |
| [T074](074-wait-on-the-host-barrier-in-server-host-tests-instead-of.md) | Wait on the host barrier in server-host tests instead of polling its state | L06 | T073, T145 | — | [FLK-06](../../audit-maintenabilite.md#FLK-06), [TSTA-13](../../audit-maintenabilite.md#TSTA-13) |
| [T075](075-move-the-durable-session-disk-faults-onto-the-injected-disk.md) | Move the durable-session disk faults onto the injected disk double | L06 | T071, T145 | — | [TSTB-12](../../audit-maintenabilite.md#TSTB-12) |
| [T076](076-move-the-server-session-disk-faults-onto-the-injected-disk.md) | Move the server-session disk faults onto the injected disk double | L06 | T075, T145 | — | [TSTB-12](../../audit-maintenabilite.md#TSTB-12) |
| [T077](077-move-the-disk-guard-and-session-deletion-disk-faults-onto.md) | Move the disk-guard and session-deletion disk faults onto the injected disk | L06 | T071, T145 | — | [TSTB-12](../../audit-maintenabilite.md#TSTB-12) |
| [T078](078-name-the-context-release-recap-capacity-and-clip-range-tests.md) | Name the context release, recap capacity and clip range tests by behaviour | L07 | T057, T058, T059, T062, T063, T064, T145 | — | [TSTA-05](../../audit-maintenabilite.md#TSTA-05), [DOC-06](../../audit-maintenabilite.md#DOC-06) |
| [T079](079-name-the-description-retry-tests-after-their-behaviour.md) | Name the description retry tests after their behaviour | L07 | T005, T006, T008, T010, T011, T013, T014, T047, T048, T049, T050, T052, T054, T065, T067, T068, T069, T070, T074, T076, T077, T145 | — | [TSTA-05](../../audit-maintenabilite.md#TSTA-05), [DOC-06](../../audit-maintenabilite.md#DOC-06) |
| [T080](080-name-the-ingest-block-ownership-tests-after-their-behaviour.md) | Name the ingest block ownership tests after their behaviour | L07 | T001, T005, T006, T008, T010, T011, T013, T014, T040, T041, T043, T044, T045, T047, T048, T049, T050, T052, T054, T065, T067, T068, T069, T070, T074, T076, T077, T145 | — | [TSTA-05](../../audit-maintenabilite.md#TSTA-05), [DOC-06](../../audit-maintenabilite.md#DOC-06) |
| [T081](081-name-the-session-closing-tests-after-their-behaviour.md) | Name the session closing tests after their behaviour | L07 | T067, T068, T069, T070, T074, T076, T077, T145 | — | [TSTA-05](../../audit-maintenabilite.md#TSTA-05), [DOC-06](../../audit-maintenabilite.md#DOC-06) |
| [T082](082-name-the-codex-process-ownership-tests-after-their-behaviour.md) | Name the Codex process ownership tests after their behaviour | L07 | T005, T006, T008, T010, T011, T013, T014, T040, T041, T043, T044, T045, T047, T048, T049, T050, T052, T054, T065, T067, T068, T069, T070, T074, T076, T077, T145 | — | [TSTA-05](../../audit-maintenabilite.md#TSTA-05), [DOC-06](../../audit-maintenabilite.md#DOC-06) |
| [T083](083-sort-the-agent-role-tool-contract-and-index-tests-into.md) | Sort the agent role, tool contract and index tests into behaviour files | L07 | T047, T048, T049, T050, T052, T054, T065, T145 | — | [TSTA-06](../../audit-maintenabilite.md#TSTA-06), [DOC-06](../../audit-maintenabilite.md#DOC-06) |
| [T084](084-move-the-moment-index-regression-tests-next-to-the-index.md) | Move the moment index regression tests next to the index tests | L07 | T005, T006, T008, T010, T011, T013, T014, T040, T041, T043, T044, T045, T067, T068, T069, T070, T074, T076, T077, T083, T145 | — | [TSTA-06](../../audit-maintenabilite.md#TSTA-06) |
| [T085](085-move-the-evidence-settings-and-whisper-regression-tests-to.md) | Move the evidence, settings and Whisper regression tests to behaviour files | L07 | T084, T145 | — | [TSTA-06](../../audit-maintenabilite.md#TSTA-06) |
| [T086](086-name-the-remaining-codex-connection-tests-after-their.md) | Name the remaining Codex connection tests after their behaviour | L07 | T085, T145 | — | [TSTA-06](../../audit-maintenabilite.md#TSTA-06), [DOC-06](../../audit-maintenabilite.md#DOC-06) |
| [T087](087-pin-the-tool-and-question-limits-of-the-core-with-boundary.md) | Pin the tool and question limits of the core with boundary tests | L08 | T145 | — | [TSTB-06](../../audit-maintenabilite.md#TSTB-06) |
| [T088](088-pin-the-refusals-of-capture-blocks-budget-ledger-and-mcp.md) | Pin the refusals of capture blocks, budget ledger and MCP clients | L08 | T145 | — | [TSTB-06](../../audit-maintenabilite.md#TSTB-06) |
| [T089](089-pin-the-codex-transport-protocol-with-a-scripted-app-server.md) | Pin the Codex transport protocol with a scripted app server | L08 | T145 | — | [TSTB-07](../../audit-maintenabilite.md#TSTB-07) |
| [T090](090-test-the-settings-archive-decoder-and-language-modules.md) | Test the settings, archive, decoder and language modules directly | L08 | T145 | — | [TSTB-17](../../audit-maintenabilite.md#TSTB-17) |
| [T091](091-require-every-element-id-looked-up-by-a-tv-script-to-exist.md) | Require every element id looked up by a TV script to exist in its page | L08 | T028, T145 | — | [OUBLI-45](../../audit-maintenabilite.md#OUBLI-45) |
| [T092](092-feed-the-tv-surveillance-views-with-states-published-by-the.md) | Feed the TV surveillance views with states published by the real core | L08 | T057, T058, T059, T062, T063, T064, T145 | — | [TSTC-12](../../audit-maintenabilite.md#TSTC-12) |
| [T093](093-test-the-dom-builders-of-the-mac-panels-on-the-shared-fake.md) | Test the DOM builders of the Mac panels on the shared fake document | L08 | T057, T058, T059, T062, T063, T064, T145 | — | [UI-07](../../audit-maintenabilite.md#UI-07) |
| [T094](094-pin-the-answer-of-every-server-command-route-to-a-malformed.md) | Pin the answer of every server command route to a malformed request | L08 | T047, T048, T049, T050, T052, T054, T065, T145 | — | [TSTB-05](../../audit-maintenabilite.md#TSTB-05) |
| [T095](095-prove-that-two-overlapping-session-transitions-settle-on.md) | Prove that two overlapping session transitions settle on both hosts | L08 | T078, T079, T080, T081, T082, T086, T145 | — | [TSTB-14](../../audit-maintenabilite.md#TSTB-14) |
| [T096](096-compare-the-overlay-constants-of-the-page-and-the-supervisor.md) | Compare the overlay constants of the page and the supervisor to one shared file | L08 | T028, T145 | — | [TSTC-14](../../audit-maintenabilite.md#TSTC-14) |
| [T097](097-share-the-ambient-launch-parameter-cases-between-supervisor.md) | Share the ambient launch parameter cases between supervisor and page tests | L08 | T096, T145 | — | [TSTC-14](../../audit-maintenabilite.md#TSTC-14) |
| [T098](098-give-every-paying-npm-script-the-live-suffix-and-test-the.md) | Give every paying npm script the :live suffix and test the rule | L09 | T145 | — | [DOC-12](../../audit-maintenabilite.md#DOC-12), [TSTC-18](../../audit-maintenabilite.md#TSTC-18) |
| [T099](099-build-the-mac-package-from-an-allowlist-of-the-folders-the.md) | Build the Mac package from an allowlist of the folders the app loads | L09 | T145 | — | [DOC-09](../../audit-maintenabilite.md#DOC-09), [OPS-08](../../audit-maintenabilite.md#OPS-08), [OUBLI-17](../../audit-maintenabilite.md#OUBLI-17) |
| [T100](100-remove-dead-exports-and-move-the-temporal-target-out-of-the.md) | Remove dead exports and move the temporal target out of the session module | L09 | T028, T145 | — | [OUBLI-09](../../audit-maintenabilite.md#OUBLI-09), [CORE-05](../../audit-maintenabilite.md#CORE-05), [ADP-11](../../audit-maintenabilite.md#ADP-11) |
| [T101](101-remove-unreachable-tv-panel-code-and-let-test-fixtures.md) | Remove unreachable TV panel code and let test fixtures escape the webm ignore | L09 | T028, T145 | — | [TV-07](../../audit-maintenabilite.md#TV-07), [TSTC-20](../../audit-maintenabilite.md#TSTC-20) |
| [T102](102-move-the-installed-tv-remote-and-the-ipk-builder-out-of.md) | Move the installed TV remote and the ipk builder out of prototypes | L09 | T005, T006, T008, T010, T011, T013, T014, T028, T145 | touche au harnais | [OPS-18](../../audit-maintenabilite.md#OPS-18), [DOC-10](../../audit-maintenabilite.md#DOC-10), [OUBLI-21](../../audit-maintenabilite.md#OUBLI-21), [OPS-10](../../audit-maintenabilite.md#OPS-10) |
| [T103](103-move-the-tv-remote-python-tests-into-tests-and-run-them-in.md) | Move the TV remote Python tests into tests and run them in one discovery | L09 | T102, T145 | touche au harnais | [OPS-18](../../audit-maintenabilite.md#OPS-18), [DOC-10](../../audit-maintenabilite.md#DOC-10), [OUBLI-29](../../audit-maintenabilite.md#OUBLI-29) |
| [T104](104-make-the-tv-ipk-build-reproducible-and-require-its-inputs.md) | Make the TV ipk build reproducible and require its inputs explicitly | L09 | T102, T145 | — | [OPS-10](../../audit-maintenabilite.md#OPS-10) |
| [T105](105-build-both-tv-packages-from-a-file-manifest-with-one-npm.md) | Build both TV packages from a file manifest with one npm command | L09 | T104, T145 | — | [OPS-10](../../audit-maintenabilite.md#OPS-10) |
| [T106](106-inventory-every-entry-of-the-scripts-folder-and-keep-the.md) | Inventory every entry of the scripts folder and keep the table in sync | L09 | T040, T041, T043, T044, T045, T098, T099, T105, T145 | — | [OPS-11](../../audit-maintenabilite.md#OPS-11), [TSTC-18](../../audit-maintenabilite.md#TSTC-18) |
| [T107](107-fail-the-check-on-documentation-links-and-commands-that.md) | Fail the check on documentation links and commands that point nowhere | L10 | T145 | — | [DOC-07](../../audit-maintenabilite.md#DOC-07) |
| [T108](108-make-the-architecture-page-and-the-docs-index-describe-the.md) | Make the architecture page and the docs index describe the current code | L10 | T107, T145 | — | [DOC-02](../../audit-maintenabilite.md#DOC-02), [DOC-03](../../audit-maintenabilite.md#DOC-03), [DOC-07](../../audit-maintenabilite.md#DOC-07) |
| [T109](109-gather-every-known-debt-into-one-register-with-an-id-a.md) | Gather every known debt into one register with an id, a module and a state | L10 | T108, T145 | — | [DOC-05](../../audit-maintenabilite.md#DOC-05) |
| [T110](110-keep-the-product-decisions-and-invariants-in-one-reference.md) | Keep the product decisions and invariants in one reference page | L10 | T108, T145 | — | [OUBLI-18](../../audit-maintenabilite.md#OUBLI-18) |
| [T111](111-archive-the-first-architecture-loop-records-with-a-status.md) | Archive the first architecture loop records with a status line and a glossary | L10 | T109, T110, T145 | — | [DOC-08](../../audit-maintenabilite.md#DOC-08), [DOC-14](../../audit-maintenabilite.md#DOC-14) |
| [T112](112-archive-superseded-plans-and-diagrams-and-rewrite-the.md) | Archive superseded plans and diagrams, and rewrite the roadmap from what is open | L10 | T109, T145 | — | [DOC-08](../../audit-maintenabilite.md#DOC-08), [DOC-17](../../audit-maintenabilite.md#DOC-17) |
| [T113](113-archive-the-night-mission-briefs-once-their-open-items-are.md) | Archive the night mission briefs once their open items are in the register | L10 | T110, T112, T145 | — | [DOC-08](../../audit-maintenabilite.md#DOC-08) |
| [T114](114-make-contributing-the-entry-page-that-points-to-the-rules.md) | Make CONTRIBUTING the entry page that points to the rules and the one check | L10 | T100, T101, T103, T106, T109, T110, T145 | — | [DOC-01](../../audit-maintenabilite.md#DOC-01), [OUBLI-20](../../audit-maintenabilite.md#OUBLI-20) |
| [T115](115-give-each-decision-record-a-current-status-its-modules-and.md) | Give each decision record a current status, its modules and its guarding tests | L10 | T078, T079, T080, T081, T082, T086, T111, T145 | — | [DOC-04](../../audit-maintenabilite.md#DOC-04), [DOC-03](../../audit-maintenabilite.md#DOC-03) |
| [T116](116-pin-the-question-flag-warm-up-and-active-instruction-of-the.md) | Pin the question flag, warm-up and active instruction of the Mac host in tests | L11 | T152 | — | [CORE-01](../../audit-maintenabilite.md#CORE-01), [ADP-07](../../audit-maintenabilite.md#ADP-07) |
| [T117](117-pin-the-server-host-warm-up-at-start-and-resume-never-on-a.md) | Pin the server host warm-up at start and resume, never on a read-only open | L11 | T152 | — | [CORE-01](../../audit-maintenabilite.md#CORE-01), [ADP-07](../../audit-maintenabilite.md#ADP-07) |
| [T118](118-save-the-questions-of-both-hosts-through-one-shared.md) | Save the questions of both hosts through one shared checkpoint module | L11 | T152 | — | [CORE-01](../../audit-maintenabilite.md#CORE-01), [ADP-07](../../audit-maintenabilite.md#ADP-07), [OUBLI-10](../../audit-maintenabilite.md#OUBLI-10) |
| [T119](119-warm-up-a-session-and-read-the-active-instruction-through.md) | Warm up a session and read the active instruction through shared functions | L11 | T116, T117, T118 | — | [CORE-01](../../audit-maintenabilite.md#CORE-01), [ADP-07](../../audit-maintenabilite.md#ADP-07) |
| [T120](120-pin-the-pure-detection-source-and-card-text-rules-of.md) | Pin the pure detection, source and card text rules of surveillance in tests | L12 | T145 | — | [CORE-07](../../audit-maintenabilite.md#CORE-07) |
| [T121](121-revoke-the-inspector-of-a-closed-session-through-a-core.md) | Revoke the inspector of a closed session through a core decorator | L12 | T152 | — | [CORE-03](../../audit-maintenabilite.md#CORE-03) |
| [T122](122-decide-whether-an-answer-is-backed-by-its-evidence-in-one.md) | Decide whether an answer is backed by its evidence in one pure core function | L12 | T028, T145 | — | [CORE-13](../../audit-maintenabilite.md#CORE-13) |
| [T123](123-let-a-watch-session-raise-its-own-ending-and-close-its.md) | Let a watch session raise its own ending and close its intake | L12 | T028, T145 | — | [CORE-06](../../audit-maintenabilite.md#CORE-06) |
| [T124](124-put-a-stable-code-on-every-codex-and-local-vision-error-a.md) | Put a stable code on every Codex and local vision error a retry reads | L13 | T028, T038, T145 | — | [ADP-04](../../audit-maintenabilite.md#ADP-04) |
| [T125](125-decide-description-retries-and-verifier-failures-on-error.md) | Decide description retries and verifier failures on error codes, not wording | L13 | T124, T145 | demande un ADR | [ADP-04](../../audit-maintenabilite.md#ADP-04) |
| [T126](126-keep-the-key-of-a-cited-page-in-one-pure-core-module.md) | Keep the key of a cited page in one pure core module | L13 | T028, T145 | — | [ADP-12](../../audit-maintenabilite.md#ADP-12) |
| [T127](127-name-and-test-the-request-rules-of-the-mac-chat-in-a-pure.md) | Name and test the request rules of the Mac chat in a pure module | L14 | T152 | — | [OUBLI-23](../../audit-maintenabilite.md#OUBLI-23) |
| [T128](128-derive-the-mac-window-controls-from-a-tested-pure-model.md) | Derive the Mac window controls from a tested pure model | L14 | T152 | — | [UI-05](../../audit-maintenabilite.md#UI-05) |
| [T129](129-keep-a-pushed-state-from-being-overwritten-by-an-older-read.md) | Keep a pushed state from being overwritten by an older read in the Mac window | L14 | T057, T058, T059, T062, T063, T064, T145 | — | [UI-03](../../audit-maintenabilite.md#UI-03) |
| [T130](130-pin-the-remote-walk-of-the-tv-chat-column-in-a-page-harness.md) | Pin the remote walk of the TV chat column in a page harness without a browser | L15 | T152 | — | [TV-01](../../audit-maintenabilite.md#TV-01), [TV-02](../../audit-maintenabilite.md#TV-02) |
| [T131](131-route-the-tv-thumbnail-through-the-shared-transport-and-name.md) | Route the TV thumbnail through the shared transport and name every /v1 call | L15 | T028, T145 | — | [TV-06](../../audit-maintenabilite.md#TV-06) |
| [T132](132-share-the-clock-and-plural-helpers-of-the-tv-panel-views-in.md) | Share the clock and plural helpers of the TV panel views in one classic script | L15 | T130 | demande un ADR | [TV-04](../../audit-maintenabilite.md#TV-04), [TV-03](../../audit-maintenabilite.md#TV-03) |
| [T133](133-launch-and-stop-every-tv-controller-child-one-way-and-inject.md) | Launch and stop every TV controller child one way and inject the layout root | L15 | T145 | — | [PY-03](../../audit-maintenabilite.md#PY-03) |
| [T134](134-document-every-setting-the-code-reads-and-group-the-unit-s.md) | Document every setting the code reads and group the unit's environment lines | L16 | T145 | — | [OPS-15](../../audit-maintenabilite.md#OPS-15) |
| [T135](135-record-the-build-identity-in-a-generated-file-and-read-it.md) | Record the build identity in a generated file and read it without Git | L16 | T028, T145 | demande un ADR | [OPS-15](../../audit-maintenabilite.md#OPS-15), [OPS-17](../../audit-maintenabilite.md#OPS-17) |
| [T136](136-let-the-server-tell-which-build-it-runs-at-start-and-on-get.md) | Let the server tell which build it runs, at start and on GET /v1/version | L16 | T038, T135, T145 | — | [OPS-15](../../audit-maintenabilite.md#OPS-15) |
| [T137](137-describe-every-file-installed-on-the-tv-in-one-manifest.md) | Describe every file installed on the TV in one manifest checked against the code | L16 | T100, T101, T103, T106, T145 | demande un ADR | [OPS-16](../../audit-maintenabilite.md#OPS-16) |
| [T138](138-run-the-quality-check-on-github-actions-in-informative-mode.md) | Run the quality check on GitHub Actions in informative mode | L03 | T031, T145 | attend une décision | [OPS-05](../../audit-maintenabilite.md#OPS-05), [FLK-17](../../audit-maintenabilite.md#FLK-17), [OPS-19](../../audit-maintenabilite.md#OPS-19), [ADP-15](../../audit-maintenabilite.md#ADP-15) |
| [T139](139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md) | Remove the legacy OpenRouter and codex exec adapters and the scripts using them | L09 | T100, T106, T145 | demande un ADR ; touche au harnais ; supprime des tests ; attend une décision | [ADP-11](../../audit-maintenabilite.md#ADP-11), [OPS-11](../../audit-maintenabilite.md#OPS-11) |
| [T140](140-state-what-runs-on-the-test-tv-and-the-server-in-one-place.md) | State what runs on the test TV and the server in one place | L10 | T108, T145 | attend une décision | [DOC-02](../../audit-maintenabilite.md#DOC-02) |
| [T141](141-refuse-resuming-a-reviewer-or-an-unknown-sub-agent-in-a.md) | Refuse resuming a reviewer or a sub-agent of unknown role in a ticket session | L18 | T003, T145 | touche au harnais | [ESSAI-07](../../audit-maintenabilite.md#ESSAI-07) |
| [T142](142-show-the-retrospective-every-tool-the-orchestrator-called-in.md) | Show the retrospective every tool the orchestrator called, in order and timed | L18 | T003, T145 | touche au harnais | [ESSAI-08](../../audit-maintenabilite.md#ESSAI-08) |
| [T143](143-measure-a-ticket-session-over-all-its-turns-and-keep-each-run.md) | Measure a ticket session over all its turns and sub-agent runs, and keep each launch's stream | L18 | T142, T145 | touche au harnais | [ESSAI-09](../../audit-maintenabilite.md#ESSAI-09) |
| [T144](144-keep-the-reserves-of-a-finished-ticket-in-its-journal-and.md) | Keep the reserves of a finished ticket in its journal and its commit | L18 | — | touche au harnais | [ESSAI-05](../../audit-maintenabilite.md#ESSAI-05) |
| [T145](145-hold-the-full-remediation-queue-until-the-owner-reopens-it.md) | Hold the full remediation queue until the owner reopens it | plan court | — | attend une décision | — |
| [T146](146-serve-the-simulated-providers-of-the-smoke-mode-from-one.md) | Serve the simulated providers of the smoke mode from one adapter module | plan court | T121 | — | [CORE-04](../../audit-maintenabilite.md#CORE-04), [ADP-06](../../audit-maintenabilite.md#ADP-06) |
| [T147](147-compute-the-polled-state-views-of-the-server-host-in-pure.md) | Compute the polled state views of the server host in pure functions | plan court | T118, T119 | — | [CORE-02](../../audit-maintenabilite.md#CORE-02), [GAP3-08](../../audit-maintenabilite.md#GAP3-08) |
| [T148](148-hold-the-loaded-mac-session-in-one-object-instead-of-nine.md) | Hold the loaded Mac session in one object instead of nine host variables | plan court | T116, T118, T119 | — | [ADP-06](../../audit-maintenabilite.md#ADP-06) |
| [T149](149-move-the-window-and-capture-source-handlers-of-the-mac-host.md) | Move the window and capture source handlers of the Mac host into their own modules | plan court | T146, T148 | — | [ADP-06](../../audit-maintenabilite.md#ADP-06) |
| [T150](150-move-the-moment-actions-and-session-rows-of-the-mac-host.md) | Move the moment actions and the session rows of the Mac host into their own modules | plan court | T148, T149 | — | [ADP-06](../../audit-maintenabilite.md#ADP-06) |
| [T151](151-prove-the-tv-panel-end-to-end-against-the-real-server-fed.md) | Prove the TV panel end to end against the real server fed with TV-shaped capture blocks | plan court | T154 | — | — |
| [T152](152-run-the-mac-and-tv-smokes-in-the-full-quality-check.md) | Run the Mac and TV smokes in the full quality check | plan court | T151 | touche au harnais | — |
| [T153](153-accept-a-review-only-when-no-finding-is-left-in-the-ticket.md) | Accept a review only when no finding is left in the ticket's scope | plan court | — | touche au harnais | — |
| [T154](154-tune-the-harness-instructions-from-recurring-retrospective.md) | Tune the harness instructions from recurring retrospective findings every few tickets | plan court | T155 | touche au harnais | — |
| [T155](155-wait-for-the-analysed-passages-in-the-slow-disk-server-test.md) | Wait for the analysed passages in the slow-disk server test instead of a fixed number of turns | plan court | T153 | — | [FLK-08](../../audit-maintenabilite.md#FLK-08) |

## Plan court

La semaine du hackathon, la boucle ne traite que ces vingt-cinq tickets, dans cet ordre, qui est celui où elle les prend. Tous les
autres tickets « à faire » dépendent de [T145](145-hold-the-full-remediation-queue-until-the-owner-reopens-it.md), qui attend la décision de rouvrir la file complète. T145 dit comment la rouvrir.

1. **Filet minimal** : [T004](004-wait-for-the-turn-request-itself-in-the-verifier-deadline.md), [T005](005-let-a-codex-turn-left-in-flight-stop-holding-its-process.md),
   [T006](006-read-the-session-folder-only-after-the-store-has-finished.md) : les trois causes connues d'échec ou de blocage des tests sous
   charge.
2. **Une relecture sans fuite, un harnais qui apprend** : [T153](153-accept-a-review-only-when-no-finding-is-left-in-the-ticket.md) (un relecteur n'accepte que s'il ne
   reste aucun constat dans le périmètre, et un écart à un critère se déclare avant l'implémentation),
   [T155](155-wait-for-the-analysed-passages-in-the-slow-disk-server-test.md) (le test du disque lent, qui a fait rougir le contrôle complet pendant T153, attend le fait publié
   au lieu d'un nombre de tours), [T154](154-tune-the-harness-instructions-from-recurring-retrospective.md) (`--tune-every N` : tous les N tickets, une session corrige les
   consignes du harnais d'après les problèmes qui reviennent dans les rétrospectives, sans toucher aux contrôles).
3. **Tester la TV sans la TV** : [T151](151-prove-the-tv-panel-end-to-end-against-the-real-server-fed.md) (scénario de la capture au panneau, contre le vrai
   serveur), [T152](152-run-the-mac-and-tv-smokes-in-the-full-quality-check.md) (le contrôle complet lance les smokes du Mac et de la TV). Tous les tickets
   suivants attendent T152 : un ticket qui casse la fenêtre ou le panneau est refusé sans que personne regarde.
4. **Règles de l'interface en modules testés** : [T015](015-make-the-mac-window-source-text-assertions-independent-of.md) (gardes indépendantes de la mise en page),
   [T017](017-move-the-search-sequencing-of-the-mac-window-into-a-tested.md), [T018](018-extract-the-reception-rules-of-the-mac-window-as-pure-tested.md) (fenêtre Mac).
5. **Tests des hôtes** : [T116](116-pin-the-question-flag-warm-up-and-active-instruction-of-the.md) (Mac), [T117](117-pin-the-server-host-warm-up-at-start-and-resume-never-on-a.md) (serveur) : ce
   que les déplacements suivants doivent garder.
6. **Un code pour les deux hôtes** : [T118](118-save-the-questions-of-both-hosts-through-one-shared.md) (sauvegarde des questions), [T119](119-warm-up-a-session-and-read-the-active-instruction-through.md)
   (préchauffage et consigne active).
7. **Inspecteur révoqué** : [T121](121-revoke-the-inspector-of-a-closed-session-through-a-core.md).
8. **Interface, suite** : [T127](127-name-and-test-the-request-rules-of-the-mac-chat-in-a-pure.md), [T128](128-derive-the-mac-window-controls-from-a-tested-pure-model.md) (fenêtre Mac), [T130](130-pin-the-remote-walk-of-the-tv-chat-column-in-a-page-harness.md)
   (harnais du panneau TV sans navigateur), [T132](132-share-the-clock-and-plural-helpers-of-the-tv-panel-views-in.md) (horloge et pluriel de la TV, avec un ADR).
9. **Faux du mode smoke hors de la composition** : [T146](146-serve-the-simulated-providers-of-the-smoke-mode-from-one.md).
10. **Vues de l'hôte serveur** : [T147](147-compute-the-polled-state-views-of-the-server-host-in-pure.md).
11. **Hôte Mac** : [T148](148-hold-the-loaded-mac-session-in-one-object-instead-of-nine.md) (la session chargée en un objet), [T149](149-move-the-window-and-capture-source-handlers-of-the-mac-host.md)
    (fenêtre et source capturée), [T150](150-move-the-moment-actions-and-session-rows-of-the-mac-host.md) (actions sur un moment et liste des sessions).

Niveaux : T146 est `simple` (relu par Sonnet), T148 `sensible` (Opus dès la première tentative), T132 `sensible` par son ADR, T152, T153 et
T154 `critique` parce qu'ils touchent au harnais. Les autres sont `standard` : Sonnet implémente, Opus relit.

Le découpage par zone de `app/renderer.js` et de `tv/app/companion.js` s'écrira après les étapes 4 et 8, contre le code qu'elles
laissent. Hors du plan court, derrière T145 : les tickets de l'overlay de la TV (la surveillance reste dans le panneau ouvert), la
sortie des réglages, des modèles et de `verify:*` hors d'`app/main.cjs`, la suppression des adaptateurs hérités (T139), le code mort
(T100, T101), le lanceur de tests (T007), la mesure de la latence et le reste de la file.

## Jalons

Un jalon est un livrable dont d'autres lots dépendent.

- **format** — livré par [T028](028-format-every-javascript-file-of-the-product-with-prettier.md) (Format every JavaScript file of the product with Prettier) ; attendu directement par T029, T031, T046, T048, T049, T050, T051, T053, T054, T055, T059, T091, T096, T100, T101, T102, T122, T123, T124, T126, T131, T135.
- **lint** — livré par [T031](031-lint-with-eslint-in-the-quality-check-and-freeze-the.md) (Lint with ESLint in the quality check and freeze the existing violations) ; attendu directement par T032, T138.
- **journal** — livré par [T036](036-add-a-journal-port-with-a-stderr-sink-and-a-contract-test.md) (Add a journal port with a stderr sink and a contract test) ; attendu directement par T039, T040, T052, T053, T054.
- **archive-reference** — livré par [T037](037-freeze-a-reference-session-archive-and-prove-the-current.md) (Freeze a reference session archive and prove the current code reads it) ; attendu directement par T043.
- **contrat-fil** — livré par [T038](038-exercise-the-v1-wire-with-the-real-tv-client-and-write-its.md) (Exercise the /v1 wire with the real TV client and write its compatibility rule) ; attendu directement par T042, T043, T044, T051, T124, T136.

## Tickets qui attendent une décision

La boucle ne les lance pas : elle les nomme et passe aux tickets prêts (T003, constat
[ESSAI-06](../../audit-maintenabilite.md#ESSAI-06)). Le propriétaire tranche en remplaçant la question par sa décision, au début de la
section « Hypothèses bloquantes » du ticket.

- [T145](145-hold-the-full-remediation-queue-until-the-owner-reopens-it.md) — Hold the full remediation queue until the owner reopens it. Décision attendue du propriétaire : rouvrir la file complète des tickets de dette, après le plan court, en relisant d'abord les tickets retenus contre le code du moment.
- [T138](138-run-the-quality-check-on-github-actions-in-informative-mode.md) — Run the quality check on GitHub Actions in informative mode. Décision attendue du propriétaire : sous quelles conditions la CI tourne sur GitHub. Elle porte sur
- [T139](139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md) — Remove the legacy OpenRouter and codex exec adapters and the scripts using them. Décision attendue du propriétaire : supprimer `adapters/openrouter.cjs`, `adapters/codex-video-agent.cjs`,
- [T140](140-state-what-runs-on-the-test-tv-and-the-server-in-one-place.md) — State what runs on the test TV and the server in one place. Décision attendue du propriétaire : la version de la nuit tourne-t-elle encore sur la TV de test et sur le

## Tickets à relire avant de lancer

- **Demande un ADR** (`adr: oui`) : [T026](026-install-prettier-with-default-settings-and-a-staged-ignore.md), [T031](031-lint-with-eslint-in-the-quality-check-and-freeze-the.md), [T034](034-add-a-type-check-step-and-a-typed-files-measure-to-the.md), [T036](036-add-a-journal-port-with-a-stderr-sink-and-a-contract-test.md), [T038](038-exercise-the-v1-wire-with-the-real-tv-client-and-write-its.md), [T052](052-answer-an-unexpected-server-error-with-a-generic-500-and.md), [T066](066-drive-the-question-checkpoint-of-the-server-host-with-an.md), [T071](071-inject-the-disk-into-the-session-store-and-library-with-a.md), [T072](072-let-a-session-say-what-it-still-has-in-flight-and-when-it-is.md), [T125](125-decide-description-retries-and-verifier-failures-on-error.md), [T132](132-share-the-clock-and-plural-helpers-of-the-tv-panel-views-in.md), [T135](135-record-the-build-identity-in-a-generated-file-and-read-it.md), [T137](137-describe-every-file-installed-on-the-tv-in-one-manifest.md), [T139](139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md).
- **Installe une dépendance** (`installe: oui`) : [T026](026-install-prettier-with-default-settings-and-a-staged-ignore.md), [T031](031-lint-with-eslint-in-the-quality-check-and-freeze-the.md), [T034](034-add-a-type-check-step-and-a-typed-files-measure-to-the.md).
- **Touche au harnais** (`harnais: oui`) : [T002](002-refuse-a-ticket-whose-final-change-differs-from-the-one-its.md), [T003](003-never-start-a-ticket-that-still-waits-for-an-owner-decision.md), [T007](007-add-a-test-launcher-that-stops-and-names-a-test-file-that.md), [T012](012-run-npm-test-and-the-quality-check-through-the-test-launcher.md), [T013](013-give-each-test-file-a-private-temp-directory-and-report-what.md), [T014](014-run-every-python-test-from-npm-test-and-from-the-quality.md), [T031](031-lint-with-eslint-in-the-quality-check-and-freeze-the.md), [T032](032-refuse-any-growth-of-the-frozen-lint-violations-in-the.md), [T034](034-add-a-type-check-step-and-a-typed-files-measure-to-the.md), [T102](102-move-the-installed-tv-remote-and-the-ipk-builder-out-of.md), [T103](103-move-the-tv-remote-python-tests-into-tests-and-run-them-in.md), [T139](139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md), [T141](141-refuse-resuming-a-reviewer-or-an-unknown-sub-agent-in-a.md), [T142](142-show-the-retrospective-every-tool-the-orchestrator-called-in.md), [T143](143-measure-a-ticket-session-over-all-its-turns-and-keep-each-run.md), [T144](144-keep-the-reserves-of-a-finished-ticket-in-its-journal-and.md), [T152](152-run-the-mac-and-tv-smokes-in-the-full-quality-check.md), [T153](153-accept-a-review-only-when-no-finding-is-left-in-the-ticket.md), [T154](154-tune-the-harness-instructions-from-recurring-retrospective.md).
- **Supprime des tests** (`supprime_tests: oui`) : [T139](139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md).

## Par lot

### L18 — Ce que l'essai de la boucle a montré

- [T002](002-refuse-a-ticket-whose-final-change-differs-from-the-one-its.md) — Refuse a ticket whose final change differs from the one its reviewer read _(touche au harnais)_
- [T003](003-never-start-a-ticket-that-still-waits-for-an-owner-decision.md) — Never start a ticket that still waits for an owner decision _(touche au harnais)_
- [T141](141-refuse-resuming-a-reviewer-or-an-unknown-sub-agent-in-a.md) — Refuse resuming a reviewer or a sub-agent of unknown role in a ticket session _(touche au harnais)_
- [T142](142-show-the-retrospective-every-tool-the-orchestrator-called-in.md) — Show the retrospective every tool the orchestrator called, in order and timed _(touche au harnais)_
- [T143](143-measure-a-ticket-session-over-all-its-turns-and-keep-each-run.md) — Measure a ticket session over all its turns and sub-agent runs, and keep each launch's stream _(touche au harnais)_
- [T144](144-keep-the-reserves-of-a-finished-ticket-in-its-journal-and.md) — Keep the reserves of a finished ticket in its journal and its commit _(touche au harnais)_

### L01 — Un filet de tests fiable et reproductible

- [T004](004-wait-for-the-turn-request-itself-in-the-verifier-deadline.md) — Wait for the turn request itself in the verifier deadline test
- [T005](005-let-a-codex-turn-left-in-flight-stop-holding-its-process.md) — Let a Codex turn left in flight stop holding its process alive
- [T006](006-read-the-session-folder-only-after-the-store-has-finished.md) — Read the session folder only after the store has finished writing
- [T007](007-add-a-test-launcher-that-stops-and-names-a-test-file-that.md) — Add a test launcher that stops and names a test file that hangs _(touche au harnais)_
- [T008](008-ship-the-slow-disk-and-stalled-process-probes-for-flaky.md) — Ship the slow-disk and stalled-process probes for flaky tests
- [T009](009-skip-by-name-or-fail-on-demand-the-tests-that-need-ffmpeg.md) — Skip by name, or fail on demand, the tests that need ffmpeg
- [T010](010-link-no-real-codex-credential-when-the-transport-is-a-test.md) — Link no real Codex credential when the transport is a test double
- [T011](011-declare-the-node-version-the-project-runs-on-and-refuse.md) — Declare the Node version the project runs on and refuse older ones
- [T012](012-run-npm-test-and-the-quality-check-through-the-test-launcher.md) — Run npm test and the quality check through the test launcher _(touche au harnais)_
- [T013](013-give-each-test-file-a-private-temp-directory-and-report-what.md) — Give each test file a private temp directory and report what it leaves _(touche au harnais)_
- [T014](014-run-every-python-test-from-npm-test-and-from-the-quality.md) — Run every Python test from npm test and from the quality check _(touche au harnais)_

### L02 — Des tests qui ne lisent plus le texte du code source

- [T015](015-make-the-mac-window-source-text-assertions-independent-of.md) — Make the Mac window source-text assertions independent of code layout
- [T016](016-make-the-static-guards-of-the-mac-renderer-fail-when-they.md) — Make the static guards of the Mac renderer fail when they scan nothing
- [T017](017-move-the-search-sequencing-of-the-mac-window-into-a-tested.md) — Move the search sequencing of the Mac window into a tested controller
- [T018](018-extract-the-reception-rules-of-the-mac-window-as-pure-tested.md) — Extract the reception rules of the Mac window as pure tested functions
- [T019](019-declare-the-ipc-channels-of-the-mac-host-once-and-check-them.md) — Declare the IPC channels of the Mac host once and check them at runtime
- [T020](020-prove-on-the-mac-bench-that-a-question-leaves-a-manual.md) — Prove on the Mac bench that a question leaves a manual verification running
- [T021](021-import-the-rolling-recorder-in-its-tests-instead-of.md) — Import the rolling recorder in its tests instead of rewriting its source
- [T022](022-declare-the-tv-drop-causes-once-and-prove-each-one-has-its.md) — Declare the TV drop causes once and prove each one has its words
- [T023](023-share-the-comment-stripping-of-the-static-guards-and-free.md) — Share the comment stripping of the static guards and free one from quote style
- [T024](024-make-the-remaining-static-guards-tolerant-of-quotes-and-line.md) — Make the remaining static guards tolerant of quotes and line breaks
- [T025](025-state-the-layer-rules-as-one-table-in-the-architecture-test.md) — State the layer rules as one table in the architecture test

### L03 — Formatage, lint, règles de couches et intégration continue

- [T026](026-install-prettier-with-default-settings-and-a-staged-ignore.md) — Install Prettier with default settings and a staged ignore list _(demande un ADR ; installe une dépendance)_
- [T027](027-prove-the-full-suite-passes-on-a-prettier-formatted-copy-of.md) — Prove the full suite passes on a Prettier-formatted copy of the tree
- [T028](028-format-every-javascript-file-of-the-product-with-prettier.md) — Format every JavaScript file of the product with Prettier
- [T029](029-ignore-the-formatting-commit-in-blame-and-pin-line-endings.md) — Ignore the formatting commit in blame and pin line endings
- [T030](030-guard-the-boundaries-the-layer-table-leaves-open-in-the.md) — Guard the boundaries the layer table leaves open in the architecture test
- [T031](031-lint-with-eslint-in-the-quality-check-and-freeze-the.md) — Lint with ESLint in the quality check and freeze the existing violations _(demande un ADR ; installe une dépendance ; touche au harnais)_
- [T032](032-refuse-any-growth-of-the-frozen-lint-violations-in-the.md) — Refuse any growth of the frozen lint violations in the quality check _(touche au harnais)_
- [T033](033-remove-the-unused-variables-that-eslint-reports.md) — Remove the unused variables that ESLint reports
- [T034](034-add-a-type-check-step-and-a-typed-files-measure-to-the.md) — Add a type-check step and a typed-files measure to the quality check _(demande un ADR ; installe une dépendance ; touche au harnais)_
- [T035](035-type-check-ten-more-core-files-through-jsdoc-annotations.md) — Type-check ten more core files through JSDoc annotations
- [T138](138-run-the-quality-check-on-github-actions-in-informative-mode.md) — Run the quality check on GitHub Actions in informative mode _(attend une décision du propriétaire)_

### L17 — Journal, formats sur disque et contrat de fil : les angles morts de l'audit

- [T036](036-add-a-journal-port-with-a-stderr-sink-and-a-contract-test.md) — Add a journal port with a stderr sink and a contract test _(demande un ADR)_
- [T037](037-freeze-a-reference-session-archive-and-prove-the-current.md) — Freeze a reference session archive and prove the current code reads it
- [T038](038-exercise-the-v1-wire-with-the-real-tv-client-and-write-its.md) — Exercise the /v1 wire with the real TV client and write its compatibility rule _(demande un ADR)_
- [T039](039-journal-every-refused-http-request-with-its-route-status-and.md) — Journal every refused HTTP request with its route, status and block identity
- [T040](040-serialize-errors-for-the-journal-with-their-cause-system.md) — Serialize errors for the journal with their cause, system code and a short stack
- [T041](041-journal-the-start-the-stop-and-the-last-resort-failure-of.md) — Journal the start, the stop and the last-resort failure of the server host
- [T042](042-pin-the-status-and-code-of-every-block-refusal-the-tv.md) — Pin the status and code of every block refusal the TV capture reads
- [T043](043-name-the-surveillance-registry-version-and-report-an-unknown.md) — Name the surveillance registry version and report an unknown one when reopened
- [T044](044-publish-the-server-version-and-capabilities-in-the-session.md) — Publish the server version and capabilities in the session answer
- [T045](045-replay-the-server-refusals-through-the-tv-transport.md) — Replay the server refusals through the TV transport

### L04 — Des erreurs visibles et des frontières durcies

- [T046](046-reject-the-active-codex-turn-when-its-event-handler-throws.md) — Reject the active Codex turn when its event handler throws
- [T047](047-keep-the-redacted-codex-refusal-detail-as-the-cause-of-the.md) — Keep the redacted Codex refusal detail as the cause of the fixed message
- [T048](048-warn-at-server-start-when-the-listen-address-is-neither.md) — Warn at server start when the listen address is neither loopback nor Tailscale
- [T049](049-tell-a-panel-drawing-failure-apart-from-a-server-outage-on.md) — Tell a panel drawing failure apart from a server outage on the TV
- [T050](050-retry-a-failed-surveillance-registry-read-with-a-bounded.md) — Retry a failed surveillance registry read with a bounded backoff
- [T051](051-answer-fixed-texts-without-host-paths-to-a-block-refused-for.md) — Answer fixed texts without host paths to a block refused for its content
- [T052](052-answer-an-unexpected-server-error-with-a-generic-500-and.md) — Answer an unexpected server error with a generic 500 and journal it _(demande un ADR)_
- [T053](053-keep-the-config-read-when-its-cache-fails-and-journal-an.md) — Keep the config read when its cache fails and journal an unreadable cache
- [T054](054-journal-unreadable-stores-instead-of-treating-them-as-absent.md) — Journal unreadable stores instead of treating them as absent
- [T065](065-stop-the-mac-launch-when-the-given-config-file-cannot-be.md) — Stop the Mac launch when the given config file cannot be read

### L05 — Des aides de test partagées au lieu de copies

- [T055](055-share-the-wait-helpers-of-the-tests-and-make-every-bounded.md) — Share the wait helpers of the tests and make every bounded wait fail aloud
- [T056](056-move-the-mac-host-bench-out-of-the-ipc-contract-test-into-a.md) — Move the Mac host bench out of the IPC contract test into a shared helper
- [T057](057-launch-the-mac-host-from-the-shared-bench-in-the-two.md) — Launch the Mac host from the shared bench in the two remaining test files
- [T058](058-share-the-simulated-clocks-of-the-tests-instead-of-importing.md) — Share the simulated clocks of the tests instead of importing one from a script
- [T059](059-share-one-hand-written-fake-dom-between-the-recap-view-and.md) — Share one hand-written fake DOM between the recap view and overlay card tests
- [T060](060-use-the-shared-wait-helpers-in-the-session-and-moment-index.md) — Use the shared wait helpers in the session and moment index tests
- [T061](061-use-the-shared-wait-helpers-in-the-server-recording-and.md) — Use the shared wait helpers in the server, recording and Codex client tests
- [T062](062-leave-no-private-copy-of-a-wait-helper-in-the-test-files.md) — Leave no private copy of a wait helper in the test files
- [T063](063-share-one-fake-codex-app-server-between-the-verification-and.md) — Share one fake Codex App Server between the verification and surveillance tests
- [T064](064-start-the-headless-server-host-from-one-shared-helper-in-two.md) — Start the headless server host from one shared helper in two test files

### L06 — Des tests qui attendent un fait, pas un délai

- [T066](066-drive-the-question-checkpoint-of-the-server-host-with-an.md) — Drive the question checkpoint of the server host with an injected timer _(demande un ADR)_
- [T067](067-hold-the-session-clock-of-the-mac-host-in-its-tests-instead.md) — Hold the session clock of the Mac host in its tests instead of pausing
- [T068](068-gate-close-during-reconnect-and-retry-tests-on-a-named-step.md) — Gate close-during-reconnect and retry tests on a named step, not a count
- [T069](069-order-abandoned-run-and-held-write-tests-by-a-signal-instead.md) — Order abandoned-run and held-write tests by a signal instead of a delay
- [T070](070-let-a-test-drive-the-lifetime-of-an-external-mcp-context.md) — Let a test drive the lifetime of an external MCP context
- [T071](071-inject-the-disk-into-the-session-store-and-library-with-a.md) — Inject the disk into the session store and library with a fault double _(demande un ADR)_
- [T072](072-let-a-session-say-what-it-still-has-in-flight-and-when-it-is.md) — Let a session say what it still has in flight and when it is at rest _(demande un ADR)_
- [T073](073-give-the-server-host-a-barrier-that-resolves-once-nothing-is.md) — Give the server host a barrier that resolves once nothing is in flight
- [T074](074-wait-on-the-host-barrier-in-server-host-tests-instead-of.md) — Wait on the host barrier in server-host tests instead of polling its state
- [T075](075-move-the-durable-session-disk-faults-onto-the-injected-disk.md) — Move the durable-session disk faults onto the injected disk double
- [T076](076-move-the-server-session-disk-faults-onto-the-injected-disk.md) — Move the server-session disk faults onto the injected disk double
- [T077](077-move-the-disk-guard-and-session-deletion-disk-faults-onto.md) — Move the disk-guard and session-deletion disk faults onto the injected disk

### L07 — Des fichiers de test rangés par comportement

- [T078](078-name-the-context-release-recap-capacity-and-clip-range-tests.md) — Name the context release, recap capacity and clip range tests by behaviour
- [T079](079-name-the-description-retry-tests-after-their-behaviour.md) — Name the description retry tests after their behaviour
- [T080](080-name-the-ingest-block-ownership-tests-after-their-behaviour.md) — Name the ingest block ownership tests after their behaviour
- [T081](081-name-the-session-closing-tests-after-their-behaviour.md) — Name the session closing tests after their behaviour
- [T082](082-name-the-codex-process-ownership-tests-after-their-behaviour.md) — Name the Codex process ownership tests after their behaviour
- [T083](083-sort-the-agent-role-tool-contract-and-index-tests-into.md) — Sort the agent role, tool contract and index tests into behaviour files
- [T084](084-move-the-moment-index-regression-tests-next-to-the-index.md) — Move the moment index regression tests next to the index tests
- [T085](085-move-the-evidence-settings-and-whisper-regression-tests-to.md) — Move the evidence, settings and Whisper regression tests to behaviour files
- [T086](086-name-the-remaining-codex-connection-tests-after-their.md) — Name the remaining Codex connection tests after their behaviour

### L08 — Combler les trous de couverture qui comptent

- [T087](087-pin-the-tool-and-question-limits-of-the-core-with-boundary.md) — Pin the tool and question limits of the core with boundary tests
- [T088](088-pin-the-refusals-of-capture-blocks-budget-ledger-and-mcp.md) — Pin the refusals of capture blocks, budget ledger and MCP clients
- [T089](089-pin-the-codex-transport-protocol-with-a-scripted-app-server.md) — Pin the Codex transport protocol with a scripted app server
- [T090](090-test-the-settings-archive-decoder-and-language-modules.md) — Test the settings, archive, decoder and language modules directly
- [T091](091-require-every-element-id-looked-up-by-a-tv-script-to-exist.md) — Require every element id looked up by a TV script to exist in its page
- [T092](092-feed-the-tv-surveillance-views-with-states-published-by-the.md) — Feed the TV surveillance views with states published by the real core
- [T093](093-test-the-dom-builders-of-the-mac-panels-on-the-shared-fake.md) — Test the DOM builders of the Mac panels on the shared fake document
- [T094](094-pin-the-answer-of-every-server-command-route-to-a-malformed.md) — Pin the answer of every server command route to a malformed request
- [T095](095-prove-that-two-overlapping-session-transitions-settle-on.md) — Prove that two overlapping session transitions settle on both hosts
- [T096](096-compare-the-overlay-constants-of-the-page-and-the-supervisor.md) — Compare the overlay constants of the page and the supervisor to one shared file
- [T097](097-share-the-ambient-launch-parameter-cases-between-supervisor.md) — Share the ambient launch parameter cases between supervisor and page tests

### L09 — Retirer le code mort et ranger le dépôt

- [T098](098-give-every-paying-npm-script-the-live-suffix-and-test-the.md) — Give every paying npm script the :live suffix and test the rule
- [T099](099-build-the-mac-package-from-an-allowlist-of-the-folders-the.md) — Build the Mac package from an allowlist of the folders the app loads
- [T100](100-remove-dead-exports-and-move-the-temporal-target-out-of-the.md) — Remove dead exports and move the temporal target out of the session module
- [T101](101-remove-unreachable-tv-panel-code-and-let-test-fixtures.md) — Remove unreachable TV panel code and let test fixtures escape the webm ignore
- [T102](102-move-the-installed-tv-remote-and-the-ipk-builder-out-of.md) — Move the installed TV remote and the ipk builder out of prototypes _(touche au harnais)_
- [T103](103-move-the-tv-remote-python-tests-into-tests-and-run-them-in.md) — Move the TV remote Python tests into tests and run them in one discovery _(touche au harnais)_
- [T104](104-make-the-tv-ipk-build-reproducible-and-require-its-inputs.md) — Make the TV ipk build reproducible and require its inputs explicitly
- [T105](105-build-both-tv-packages-from-a-file-manifest-with-one-npm.md) — Build both TV packages from a file manifest with one npm command
- [T106](106-inventory-every-entry-of-the-scripts-folder-and-keep-the.md) — Inventory every entry of the scripts folder and keep the table in sync
- [T139](139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md) — Remove the legacy OpenRouter and codex exec adapters and the scripts using them _(demande un ADR ; touche au harnais ; supprime des tests ; attend une décision du propriétaire)_

### L10 — Une documentation qui dit l'état actuel

- [T107](107-fail-the-check-on-documentation-links-and-commands-that.md) — Fail the check on documentation links and commands that point nowhere
- [T108](108-make-the-architecture-page-and-the-docs-index-describe-the.md) — Make the architecture page and the docs index describe the current code
- [T109](109-gather-every-known-debt-into-one-register-with-an-id-a.md) — Gather every known debt into one register with an id, a module and a state
- [T110](110-keep-the-product-decisions-and-invariants-in-one-reference.md) — Keep the product decisions and invariants in one reference page
- [T111](111-archive-the-first-architecture-loop-records-with-a-status.md) — Archive the first architecture loop records with a status line and a glossary
- [T112](112-archive-superseded-plans-and-diagrams-and-rewrite-the.md) — Archive superseded plans and diagrams, and rewrite the roadmap from what is open
- [T113](113-archive-the-night-mission-briefs-once-their-open-items-are.md) — Archive the night mission briefs once their open items are in the register
- [T114](114-make-contributing-the-entry-page-that-points-to-the-rules.md) — Make CONTRIBUTING the entry page that points to the rules and the one check
- [T115](115-give-each-decision-record-a-current-status-its-modules-and.md) — Give each decision record a current status, its modules and its guarding tests
- [T140](140-state-what-runs-on-the-test-tv-and-the-server-in-one-place.md) — State what runs on the test TV and the server in one place _(attend une décision du propriétaire)_

### L11 — Un seul cycle de vie pour les deux hôtes

Fiche de chantier : [hotes-cycle-de-vie.md](../fiches/hotes-cycle-de-vie.md).

- [T116](116-pin-the-question-flag-warm-up-and-active-instruction-of-the.md) — Pin the question flag, warm-up and active instruction of the Mac host in tests
- [T117](117-pin-the-server-host-warm-up-at-start-and-resume-never-on-a.md) — Pin the server host warm-up at start and resume, never on a read-only open
- [T118](118-save-the-questions-of-both-hosts-through-one-shared.md) — Save the questions of both hosts through one shared checkpoint module
- [T119](119-warm-up-a-session-and-read-the-active-instruction-through.md) — Warm up a session and read the active instruction through shared functions

### L12 — Un cœur aux responsabilités séparées

Fiche de chantier : [coeur.md](../fiches/coeur.md).

- [T120](120-pin-the-pure-detection-source-and-card-text-rules-of.md) — Pin the pure detection, source and card text rules of surveillance in tests
- [T121](121-revoke-the-inspector-of-a-closed-session-through-a-core.md) — Revoke the inspector of a closed session through a core decorator
- [T122](122-decide-whether-an-answer-is-backed-by-its-evidence-in-one.md) — Decide whether an answer is backed by its evidence in one pure core function
- [T123](123-let-a-watch-session-raise-its-own-ending-and-close-its.md) — Let a watch session raise its own ending and close its intake

### L13 — Des adaptateurs Codex lisibles

Fiche de chantier : [adaptateurs-codex.md](../fiches/adaptateurs-codex.md).

- [T124](124-put-a-stable-code-on-every-codex-and-local-vision-error-a.md) — Put a stable code on every Codex and local vision error a retry reads
- [T125](125-decide-description-retries-and-verifier-failures-on-error.md) — Decide description retries and verifier failures on error codes, not wording _(demande un ADR)_
- [T126](126-keep-the-key-of-a-cited-page-in-one-pure-core-module.md) — Keep the key of a cited page in one pure core module

### L14 — Une interface Mac découpée et testable

Fiche de chantier : [interface-mac.md](../fiches/interface-mac.md).

- [T127](127-name-and-test-the-request-rules-of-the-mac-chat-in-a-pure.md) — Name and test the request rules of the Mac chat in a pure module
- [T128](128-derive-the-mac-window-controls-from-a-tested-pure-model.md) — Derive the Mac window controls from a tested pure model
- [T129](129-keep-a-pushed-state-from-being-overwritten-by-an-older-read.md) — Keep a pushed state from being overwritten by an older read in the Mac window

### L15 — Un companion TV et des scripts Python maintenables

Fiche de chantier : [tv-et-python.md](../fiches/tv-et-python.md).

- [T130](130-pin-the-remote-walk-of-the-tv-chat-column-in-a-page-harness.md) — Pin the remote walk of the TV chat column in a page harness without a browser
- [T131](131-route-the-tv-thumbnail-through-the-shared-transport-and-name.md) — Route the TV thumbnail through the shared transport and name every /v1 call
- [T132](132-share-the-clock-and-plural-helpers-of-the-tv-panel-views-in.md) — Share the clock and plural helpers of the TV panel views in one classic script _(demande un ADR)_
- [T133](133-launch-and-stop-every-tv-controller-child-one-way-and-inject.md) — Launch and stop every TV controller child one way and inject the layout root

### L16 — Des livraisons reproductibles

Fiche de chantier : [livraison.md](../fiches/livraison.md).

- [T134](134-document-every-setting-the-code-reads-and-group-the-unit-s.md) — Document every setting the code reads and group the unit's environment lines
- [T135](135-record-the-build-identity-in-a-generated-file-and-read-it.md) — Record the build identity in a generated file and read it without Git _(demande un ADR)_
- [T136](136-let-the-server-tell-which-build-it-runs-at-start-and-on-get.md) — Let the server tell which build it runs, at start and on GET /v1/version
- [T137](137-describe-every-file-installed-on-the-tv-in-one-manifest.md) — Describe every file installed on the TV in one manifest checked against the code _(demande un ADR)_

