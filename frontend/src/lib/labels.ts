import type { AgentAction, SecurityKind, SecurityLayer, TrustLabel } from "../types";
import { compactUrl, humanize } from "./format";

export const KIND_LABELS: Record<string, string> = {
  prompt_injection: "Prompt injection",
  redirect: "Redirect",
  exfiltration: "Exfiltration",
  checkout_attempt: "Checkout attempt",
};

export const LAYER_LABELS: Record<string, string> = {
  egress_proxy: "Egress proxy",
  action_firewall: "Action firewall",
  injection_guard: "Injection guard",
  number_check: "Number check",
};

export const LAYER_DESCRIPTIONS: Record<string, string> = {
  egress_proxy: "Each sandbox can only reach its own store's domain",
  action_firewall: "Only browse, extract and add-to-cart. No checkout, no payment",
  injection_guard: "Strips hidden instructions from page text before the model sees it",
  number_check: "Cross-checks every extracted price against the screenshot",
};

export const LAYER_ORDER = ["egress_proxy", "action_firewall", "injection_guard", "number_check"] as const;

export function kindLabel(kind: SecurityKind): string {
  return KIND_LABELS[kind] ?? humanize(kind);
}

export function layerLabel(layer: SecurityLayer): string {
  return LAYER_LABELS[layer] ?? humanize(layer);
}

export const TRUST_LABELS: Record<TrustLabel, string> = {
  real: "Real",
  questionable: "Questionable",
  fake: "Fake",
  unknown: "Unknown",
};

/** `click #12 'Godkänn cookies'`, `type #search 'OLED 65 tum'`, `goto elgiganten.se/` */
export function formatAction(action: AgentAction): string {
  const target = action.target ?? "";
  const quoted = action.text ? ` '${action.text}'` : "";
  switch (action.type) {
    case "goto":
      return `goto ${compactUrl(target)}`;
    case "click":
      return `click ${target}${quoted}`.trim();
    case "type":
      return `type ${target}${quoted}`.trim();
    case "scroll":
      return `scroll ${action.text ?? target ?? "down"}`.trim();
    case "extract":
      return `extract ${target}`.trim();
    case "add_to_cart":
      return `add_to_cart ${target}${quoted}`.trim();
    case "retry":
      return `↻ retry · ${action.text ?? "trying again"}`;
  }
}
