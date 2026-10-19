const TVLENS_MEMORY_MEDIA_UNAVAILABLE = 'TVLENS_MEMORY_MEDIA_UNAVAILABLE';

/**
 * @typedef {'present'|'absent'|'unknown'} Modality
 * @typedef {{audio:Modality,images:Modality,video:Modality}} MemoryModalities
 * Présence dans la capture, indépendante de son analyse et de sa conservation actuelle.
 * L'absence de métadonnées historiques se traduit par unknown, jamais par ready.
 *
 * @typedef {'expired'|'missing'|'not-kept'|'unreadable'|'images-absent'} MediaReason
 * images-absent : son conservé, images et vidéo explicitement absentes à la capture.
 * @typedef {object} MemoryAvailability
 * @property {boolean} replayable
 * @property {MediaReason|null} reason
 * @property {boolean|null} images
 * @property {boolean|null} audio
 * null signifie que la présence de la modalité conservée est inconnue. Un bail reste
 * l'autorité sur l'existence des fichiers ; cette lecture n'ouvre aucun média.
 *
 * @typedef {{id:string,startMs:number,endMs:number}} MemoryInterval
 * @typedef {object} MemoryObservation
 * @property {string} [transcript]
 * @property {string} [summary]
 * @property {string} [visual]
 * @property {string} [audio]
 * @property {string} [uncertainty]
 * @property {string} [topic]
 * @property {string} [topicContinuity]
 * Les autres métadonnées historiques de l'observation restent détachées et lisibles.
 *
 * @typedef {{text:string,firstId:string,lastId:string,startMs:number,endMs:number}} MemoryTopicSummary
 * Résumé cumulatif du sujet ; ne vaut pas preuve propre au passage.
 *
 * @typedef {object} MemoryPassage
 * @property {string} id
 * @property {number} startMs
 * @property {number} endMs
 * @property {number|null} revision Révision du propriétaire, null pour une archive non versionnée.
 * @property {string|null} status
 * @property {string|null} audioStatus
 * @property {string|null} visionStatus
 * @property {string|null} error
 * @property {string|null} audioError
 * @property {string|null} visionError
 * @property {boolean} audioFailed Une transcription en échec peut avoir audioStatus ready.
 * @property {string} [audioFailureCode] Cause stable fournie par la transcription en échec.
 * @property {string|null} visionSkipReason
 * @property {string|null} stage
 * @property {MemoryObservation|null} observation
 * @property {MemoryTopicSummary|null} topicSummary
 * @property {string|null} summary Résumé historique de repli.
 * @property {string[]} explicitNulls Champs de métadonnées explicitement nuls, distingués des champs absents
 * normalisés à null. Les projections historiques peuvent ainsi conserver leurs omissions sans lire l'archive.
 * @property {boolean} thumbnailAvailable
 * @property {'history'|'retained'} origin history ne retrouve jamais de média par cette vue.
 * @property {MemoryModalities} modalities
 * @property {MemoryAvailability} availability
 * @property {boolean} usableObservation Même critère que les lecteurs de preuves actuels.
 * @property {string[]} fieldOrder Présence et ordre des champs acquis du passage, avant normalisation.
 * @property {string[]} undefinedFields Champs présents dont la valeur est undefined, distincts de null.
 * @property {MemoryPassageMetadata} metadata Métadonnées facultatives détachées ; aucune capacité ni chemin ajouté.
 *
 * @typedef {object} MemoryPassageMetadata
 * @property {boolean} [hasAudio]
 * @property {false} [hasImages] Absence déclarée et sauvegardée ; un champ absent laisse la modalité inconnue.
 * @property {MediaReason|null} [mediaReason]
 * @property {number} [receivedMs]
 * @property {number} [audioStartedMs]
 * @property {number} [transcriptPublishedMs]
 * @property {number} [visionQueuedMs]
 * @property {number} [visionStartedMs]
 * @property {number} [visionPublishedMs]
 * @property {number} [audioMs]
 * @property {number} [visionMs]
 * @property {number} [analysisMs]
 * @property {{assembleMs:number}} [ingest]
 * @property {object} [metrics]
 * Les extensions historiques non normalisées restent dans metadata avec leur présence d'origine.
 * latencySummary, exporté par l'entrée publique, calcule les latences depuis ces horodatages et l'intervalle.
 *
 * @typedef {object} MemorySession
 * @property {string} id
 * @property {boolean} accepting
 * @property {boolean} readOnly
 * @property {'until-deleted'} retention
 * @property {null} retentionMs
 * @property {number} unplacedMedia
 * @property {string|null} lastError
 *
 * @typedef {object} MemoryClock
 * @property {number} elapsedMs Ancrage à figer au début d'une question.
 * @property {number} capturedThroughMs
 * @property {number} analyzedThroughMs
 * @property {number} contextThroughMs
 * @property {number} analysisLagMs
 *
 * @typedef {object} MemoryCoverage
 * @property {number} passages
 * @property {number} retainedPassages Nombre dans la collection avec suivi média, même si indisponible.
 * @property {number} historyPassages
 * @property {number} replayablePassages
 * @property {number|null} startMs null pour la mémoire vide.
 * @property {number} throughMs
 * @property {number} pending
 * @property {number} audioPending
 * @property {number} visionPending
 * @property {boolean} analyzing
 * @property {Array<MemoryInterval & {status:string}>} gaps
 * @property {Array<MemoryInterval & {audioStatus:string,code?:string}>} audioGaps
 * @property {Array<MemoryInterval & {visionStatus:string,reason:string|null}>} visionGaps
 * @property {Array<{startMs:number,endMs:number}>} captureGaps Trous avant ou entre passages, hors gigue de 250 ms.
 * @property {number} visionBlockedMs Temps de rétention de la voie vision, distinct des pertes.
 *
 * @typedef {object} MemoryView
 * @property {MemorySession} session
 * @property {MemoryClock} clock
 * @property {MemoryPassage[]} passages Ordre d'observation, toutes origines confondues.
 * @property {MemoryCoverage} coverage
 * @property {Object<string,number>} losses Compteurs de pertes établis par le propriétaire, jamais recomptés.
 * Valeurs détachées, sans capacité ni question historique. Une question fige session.id,
 * clock.elapsedMs et les identifiants/intervalles ; ses relectures portent seulement sur cet ensemble.
 * Une révision ne représente pas encore tous les changements de disponibilité.
 *
 * @typedef {object} MemoryPassageRead
 * @property {{id:string}} session Identité de la session lue, pour qu'une question ne relise que la sienne.
 * @property {MemoryClock} clock Même horloge que MemoryView.clock au moment de la lecture.
 * @property {MemoryPassage[]} passages Ordre demandé ; un identifiant inconnu est omis.
 *
 * @typedef {object} MemoryReadPort
 * @property {()=>MemoryView} view
 * @property {(id:string)=>MemoryPassage|null} passage Lecture bornée, sans construire MemoryView.
 * @property {(ids:string[])=>MemoryPassageRead} passages Relecture bornée d'un ensemble figé, sans construire
 * MemoryView ni projeter un passage non demandé. Refus TVLENS_MEMORY_IDS_INVALID si ids n'est pas une liste de textes.
 * @property {(limit:number)=>MemoryPassage[]} recentPassages Queue conservée, sans history ni filtre ready.
 * @property {()=>MemoryPublicationStatus} readPublicationStatus Activité et compatibilité, séparées de la consultation métier.
 * @property {()=>object[]} readHistoricalQuestions Copie profonde des questions conservées, sans les jobs de DeepAsk.
 * @property {()=>{apiCalls:number,apiCost:number}} readUsage Compteurs acquis de perception.
 *
 * @typedef {object} MemoryPublicationStatus
 * @property {boolean} accepting
 * @property {boolean} readOnly
 * @property {number} unplacedMedia
 * @property {'until-deleted'} retention
 * @property {null} retentionMs
 * @property {boolean} asking Compatibilité de la façade ; ne fait pas partie de MemoryView.
 * @property {boolean} analyzing
 * @property {number} pending
 * @property {number} audioPending
 * @property {number} visionPending
 * @property {string|null} lastError Priorité stockage, sauvegarde puis traitement.
 * @property {number} visionBlockedMs Durée lue à l'instant courant, sans consolider une retenue.
 *
 * @typedef {{atMs:number,dataUrl:string}} MemoryFrame
 * @typedef {{frames:MemoryFrame[],audio:Uint8Array|null}} MemoryMedia
 * @typedef {()=>Promise<void>} MemoryMediaRelease
 * Libération idempotente, appelée par le propriétaire après la fin effective de l'usage (ADR 0004).
 *
 * @typedef {object} MemoryMediaPort
 * @property {(id:string)=>Promise<MemoryMedia>} read Images et son capturés, sans chemin ni Response HTTP.
 * @property {(ids:string[])=>Promise<MemoryMediaRelease>} lease Refus si une paire média manque ou attend sa suppression.
 * Les refus portent TVLENS_MEMORY_MEDIA_UNAVAILABLE, sans détail interne d'adaptateur.
 * Lecture et baux sont composés séparément des données de domaine, recherche et inspection.
 */
module.exports = { TVLENS_MEMORY_MEDIA_UNAVAILABLE };
