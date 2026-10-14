#!/usr/bin/env node
// PreToolUse(Agent) : dans une session de ticket, un sous-agent se lance au premier plan.
// Lancé en arrière-plan, il rend la main avant d'avoir fini : l'orchestrateur termine alors son tour sans verdict
// et dépense pour rien un des refus de fin de tour, qui sont comptés.
import { decide, loopMode, readInput } from "./lib.mjs";

const input = readInput();
if (loopMode && input.tool_input?.run_in_background !== false) {
  const how = "relance le même appel avec « run_in_background: false » et attends son rapport avant de continuer.";
  decide("deny", `Dans une session de ticket, un sous-agent se lance au premier plan : ${how}`);
}
