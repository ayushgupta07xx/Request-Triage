// Data contract for the dashboard.
//
// This is the TypeScript mirror of triage/card.py `to_card()` (per-case) and
// scripts/export_demo.py `build()` (the summary block). If a field is added
// on the Python side, add it here too -- a mismatch shows up as `undefined`
// in the UI rather than a compile error, so this file is the single place to
// keep the two languages in agreement.

export type RequestType =
  | "billing_dispute"
  | "general_enquiry"
  | "service_request"
  | "financial_hardship"
  | "other";

export type Urgency = "low" | "medium" | "high" | "critical";

export type CaseStatus =
  | "awaiting_human"
  | "auto_resolved"
  | "escalated"
  // A resend caught by the content fingerprint before any model call. It is a
  // real terminal status on the Python side, so it belongs in the mirror.
  | "duplicate";

export type DecisionSource =
  | "llm_primary"
  | "llm_secondary"
  | "keyword_fallback";

// One executed step in a branch. `artifact` carries any composite output the
// step produced (e.g. the drafted response text on generate_response).
export interface TraceStep {
  action: string;
  outcome: string | null;
  summary: string | null;
  artifact: string | null;
  target: string | null;
  due_at: string | null;
  error: string | null;
}

// What the model proposed, kept alongside the final decision so the audit
// trail can answer "model said X, system did Y".
export interface Proposal {
  request_type: string | null;
  urgency: string | null;
  confidence: number | null;
  secondary_type: string | null;
}

export interface Case {
  case_id: string;
  trace_id: string | null;

  // request
  channel: string | null;
  sender: string | null;
  subject: string | null;
  body: string | null;

  // classification (final decision)
  request_type: RequestType;
  urgency: Urgency;
  confidence: number | null;
  rationale: string | null;
  entities: Record<string, unknown>;
  secondary_type: string | null;
  decision_source: DecisionSource;
  guardrail_triggers: string[];
  requires_review: boolean;
  review_reason: string | null;
  model_name: string | null;
  prompt_version: string | null;
  latency_ms: number | null;

  // execution
  branch: string | null;
  status: CaseStatus;
  trace: TraceStep[];
  n_actions: number;

  // timing / SLA
  created_at: string | null;
  sla_due_at: string | null;
  sla_breached: boolean;
  duplicate_of: string | null;

  // provenance
  proposal: Proposal | null;
  was_overridden: boolean;
}

export interface Summary {
  total_cases: number;
  automation_rate: number;
  review_rate: number;
  sla_breach_count: number;
  sla_reference: string | null;
  by_type: Partial<Record<RequestType, number>>;
  by_status: Partial<Record<CaseStatus, number>>;
  by_urgency: Partial<Record<Urgency, number>>;
  by_decision_source: Partial<Record<DecisionSource, number>>;
  type_status: Partial<Record<RequestType, Partial<Record<CaseStatus, number>>>>;
  usage_total_tokens: number;
}

export interface DemoData {
  generated_from: string;
  schema_version: number;
  summary: Summary;
  cases: Case[];
}

// --- display helpers (labels only; no styling opinions) -------------------

export const TYPE_LABELS: Record<RequestType, string> = {
  billing_dispute: "Billing dispute",
  general_enquiry: "General enquiry",
  service_request: "Service request",
  financial_hardship: "Financial hardship",
  other: "Out of scope",
};

export const STATUS_LABELS: Record<CaseStatus, string> = {
  awaiting_human: "Awaiting human",
  auto_resolved: "Auto-resolved",
  escalated: "Escalated",
  duplicate: "Duplicate",
};

export const SOURCE_LABELS: Record<DecisionSource, string> = {
  llm_primary: "LLM (primary)",
  llm_secondary: "LLM (secondary)",
  keyword_fallback: "Keyword floor",
};

export const URGENCY_ORDER: Urgency[] = ["low", "medium", "high", "critical"];
