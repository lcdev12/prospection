import { computePriority, detectProblem } from "../filters/priorityScorer.js";
import type { EnrichedLead, RawLead } from "../types.js";

const buildColdEmail = (lead: RawLead, problem: string): string => {
  return [
    `Bonjour ${lead.name},`,
    "",
    `J'ai remarque que ${problem.toLowerCase()} pour votre activite a ${lead.city}.`,
    "Je peux vous aider a obtenir plus de demandes clients avec un site web moderne et un suivi simple.",
    "Souhaitez-vous un audit gratuit de 10 minutes cette semaine ?",
    "",
    "Cordialement,"
  ].join("\n");
};

const buildCallNote = (lead: RawLead, priority: EnrichedLead["priority"], problem: string): string => {
  const contactHint = lead.email
    ? `Email dispo: ${lead.email}.`
    : "Pas d'email visible, appel direct.";
  return `Priorite ${priority}: ${lead.name} (${lead.city}) - angle: ${problem}. ${contactHint} Proposer un mini-audit concret.`;
};

export const enrichLeads = (leads: RawLead[]): EnrichedLead[] => {
  return leads.map((lead) => {
    const priority = computePriority(lead);
    const problem = detectProblem(lead, priority);

    return {
      ...lead,
      priority,
      problem,
      coldEmail: buildColdEmail(lead, problem),
      call_note: buildCallNote(lead, priority, problem)
    };
  });
};
