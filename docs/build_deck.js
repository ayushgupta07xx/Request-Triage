// AUTO-GENERATED from the shipped deck, then hand-edited. Rebuild:
//   cd deck && node build_deck.js
const pptxgen = require("pptxgenjs");

const BG   = "img/bg.png";
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "Ayush Gupta";
pres.title  = "Handoff \u2014 Incoming Request Processing Workflow";

const T = (s, runs, o) => s.addText(runs, Object.assign({ margin: 0 }, o));
const S = (s, o) => s.addShape(pres.ShapeType.roundRect, o);

// ===== SLIDE 1 ==========================================================
const s1 = pres.addSlide();
s1.background = { path: BG };
T(s1, [{"text": "01", "options": {"fontSize": 9.5, "bold": true, "charSpacing": 2.4, "color": "1F9E84", "fontFace": "Calibri"}}, {"text": " / 05     ", "options": {"fontSize": 9.5, "charSpacing": 2.4, "color": "5A554E", "fontFace": "Calibri"}}, {"text": "PROBLEM UNDERSTANDING", "options": {"fontSize": 9.5, "charSpacing": 2.4, "color": "9C958D", "fontFace": "Calibri"}}],
  {"x": 0.7, "y": 0.38, "w": 11.933, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s1, [{"text": "PROBLEM UNDERSTANDING AND OBJECTIVE", "options": {"fontSize": 27.0, "bold": true, "charSpacing": -0.2, "color": "F4F2EE", "fontFace": "Arial"}}],
  {"x": 0.7, "y": 0.66, "w": 11.933, "h": 0.5, "valign": "top", "isTextBox": true});
T(s1, [{"text": "HANDOFF   ·   AYUSH GUPTA", "options": {"fontSize": 8.0, "charSpacing": 1.6, "color": "5A554E", "fontFace": "Calibri"}}],
  {"x": 0.7, "y": 6.94, "w": 5.0, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s1, [{"text": "handoff-triage.vercel.app", "options": {"fontSize": 8.0, "color": "5A554E", "fontFace": "Calibri", "align": "right"}}],
  {"x": 7.633, "y": 6.94, "w": 5.0, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s1, [{"text": "A UK consumer lending and mortgage servicing desk takes a continuous stream of requests by email, web form and shared inbox. Today a person reads every one of them and decides what happens next.", "options": {"fontSize": 13.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 19.0}}],
  {"x": 0.7, "y": 1.28, "w": 9.9, "h": 0.56, "valign": "middle", "isTextBox": true});
T(s1, [{"text": "THE BRIEF'S OWN THREE WORDS — TAKEN AS THE DESIGN TARGETS", "options": {"fontSize": 8.5, "bold": true, "charSpacing": 1.9, "color": "1F9E84", "fontFace": "Calibri"}}],
  {"x": 0.7, "y": 2.02, "w": 9.0, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s1, [{"text": "Slow", "options": {"fontSize": 24.0, "bold": true, "color": "1F9E84", "fontFace": "Arial"}}],
  {"x": 0.7, "y": 2.3, "w": 3.6443, "h": 0.42, "valign": "middle", "isTextBox": true});
T(s1, [{"text": "Nothing moves until a human has read it. Handle time and SLA breach risk scale straight with volume.", "options": {"fontSize": 10.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 14.0}}],
  {"x": 0.7, "y": 2.8, "w": 3.6443, "h": 0.85, "valign": "middle", "isTextBox": true});
T(s1, [{"text": "Inconsistent", "options": {"fontSize": 24.0, "bold": true, "color": "1F9E84", "fontFace": "Arial"}}],
  {"x": 4.8443, "y": 2.3, "w": 3.6443, "h": 0.42, "valign": "middle", "isTextBox": true});
T(s1, [{"text": "The same request resolves differently depending on who opens it, and how busy the floor is that hour.", "options": {"fontSize": 10.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 14.0}}],
  {"x": 4.8443, "y": 2.8, "w": 3.6443, "h": 0.85, "valign": "middle", "isTextBox": true});
T(s1, [{"text": "Judgment-dependent", "options": {"fontSize": 24.0, "bold": true, "color": "1F9E84", "fontFace": "Arial"}}],
  {"x": 8.9887, "y": 2.3, "w": 3.6443, "h": 0.42, "valign": "middle", "isTextBox": true});
T(s1, [{"text": "Nothing records why a case went where. Quality lives in individual heads, and leaves when they do.", "options": {"fontSize": 10.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 14.0}}],
  {"x": 8.9887, "y": 2.8, "w": 3.6443, "h": 0.85, "valign": "middle", "isTextBox": true});
T(s1, [{"text": "OBJECTIVE", "options": {"fontSize": 8.5, "bold": true, "charSpacing": 1.9, "color": "1F9E84", "fontFace": "Calibri"}}],
  {"x": 0.7, "y": 3.66, "w": 6.0, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s1, [{"text": "Execute the correct remediation end to end — and know when not to.", "options": {"fontSize": 21.0, "bold": true, "color": "F4F2EE", "fontFace": "Arial"}}],
  {"x": 0.7, "y": 3.9, "w": 11.933, "h": 0.4, "valign": "middle", "isTextBox": true});
T(s1, [{"text": "The brief asks for automatic processing of every request, and every request is processed automatically. Automatic closure is a different question: on a regulated desk, a system that resolves a hardship disclosure or a disputed charge by itself is a compliance incident, not a feature.", "options": {"fontSize": 11.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 15.0}}],
  {"x": 0.7, "y": 4.38, "w": 11.333, "h": 0.6, "valign": "middle", "isTextBox": true});
S(s1, {"x": 0.7, "y": 5.42, "w": 11.933, "h": 0.98, "fill": {"color": "0F1F1C"}, "rectRadius": 0.05, "line": {"color": "0F1F1C", "width": 1.0}});
T(s1, [{"text": "The model decides.   The state machine executes.", "options": {"fontSize": 21.0, "bold": true, "color": "2ABF9F", "fontFace": "Arial", "align": "center"}}],
  {"x": 0.7, "y": 5.42, "w": 11.933, "h": 0.98, "valign": "middle", "isTextBox": true});

// ===== SLIDE 2 ==========================================================
const s2 = pres.addSlide();
s2.background = { path: BG };
T(s2, [{"text": "02", "options": {"fontSize": 9.5, "bold": true, "charSpacing": 2.4, "color": "1F9E84", "fontFace": "Calibri"}}, {"text": " / 05     ", "options": {"fontSize": 9.5, "charSpacing": 2.4, "color": "5A554E", "fontFace": "Calibri"}}, {"text": "SOLUTION ARCHITECTURE", "options": {"fontSize": 9.5, "charSpacing": 2.4, "color": "9C958D", "fontFace": "Calibri"}}],
  {"x": 0.7, "y": 0.38, "w": 11.933, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "SOLUTION ARCHITECTURE AND DESIGN FLOW", "options": {"fontSize": 27.0, "bold": true, "charSpacing": -0.2, "color": "F4F2EE", "fontFace": "Arial"}}],
  {"x": 0.7, "y": 0.66, "w": 11.933, "h": 0.5, "valign": "top", "isTextBox": true});
T(s2, [{"text": "HANDOFF   ·   AYUSH GUPTA", "options": {"fontSize": 8.0, "charSpacing": 1.6, "color": "5A554E", "fontFace": "Calibri"}}],
  {"x": 0.7, "y": 6.94, "w": 5.0, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "handoff-triage.vercel.app", "options": {"fontSize": 8.0, "color": "5A554E", "fontFace": "Calibri", "align": "right"}}],
  {"x": 7.633, "y": 6.94, "w": 5.0, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "Classification is the only place the model acts. Everything after it — control flow, side effects, every drafted word — is deterministic code and configuration.", "options": {"fontSize": 12.0, "color": "9C958D", "fontFace": "Calibri"}}],
  {"x": 0.7, "y": 1.26, "w": 10.8, "h": 0.26, "valign": "middle", "isTextBox": true});
S(s2, {"x": 0.7, "y": 1.68, "w": 2.2266, "h": 0.8, "fill": {"color": "191816"}, "rectRadius": 0.05, "line": {"color": "191816", "width": 1.0}});
T(s2, [{"text": "INTAKE", "options": {"fontSize": 10.5, "bold": true, "color": "F4F2EE", "fontFace": "Arial", "align": "center"}}],
  {"x": 0.8, "y": 1.78, "w": 2.0266, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "web form · batch upload", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "align": "center", "lineSpacing": 11.0, "breakLine": true}}, {"text": "shared inbox", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "align": "center", "lineSpacing": 11.0}}],
  {"x": 0.8, "y": 2.0, "w": 2.0266, "h": 0.4, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "›", "options": {"fontSize": 15.0, "color": "5A554E", "fontFace": "Arial", "align": "center"}}],
  {"x": 2.9266, "y": 1.68, "w": 0.2, "h": 0.8, "valign": "middle", "isTextBox": true});
S(s2, {"x": 3.1266, "y": 1.68, "w": 2.2266, "h": 0.8, "fill": {"color": "191816"}, "rectRadius": 0.05, "line": {"color": "191816", "width": 1.0}});
T(s2, [{"text": "DUPLICATE CHECK", "options": {"fontSize": 10.5, "bold": true, "color": "F4F2EE", "fontFace": "Arial", "align": "center"}}],
  {"x": 3.2266, "y": 1.78, "w": 2.0266, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "content fingerprint,", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "align": "center", "lineSpacing": 11.0, "breakLine": true}}, {"text": "before any model call", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "align": "center", "lineSpacing": 11.0}}],
  {"x": 3.2266, "y": 2.0, "w": 2.0266, "h": 0.4, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "›", "options": {"fontSize": 15.0, "color": "5A554E", "fontFace": "Arial", "align": "center"}}],
  {"x": 5.3532, "y": 1.68, "w": 0.2, "h": 0.8, "valign": "middle", "isTextBox": true});
S(s2, {"x": 5.5532, "y": 1.68, "w": 2.2266, "h": 0.8, "fill": {"color": "0F1F1C"}, "rectRadius": 0.06, "line": {"color": "1F9E84", "width": 1.0}});
T(s2, [{"text": "CLASSIFY", "options": {"fontSize": 10.5, "bold": true, "color": "2ABF9F", "fontFace": "Arial", "align": "center"}}],
  {"x": 5.6532, "y": 1.78, "w": 2.0266, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "LLM: type × urgency,", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "align": "center", "lineSpacing": 11.0, "breakLine": true}}, {"text": "entities, rationale", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "align": "center", "lineSpacing": 11.0}}],
  {"x": 5.6532, "y": 2.0, "w": 2.0266, "h": 0.4, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "›", "options": {"fontSize": 15.0, "color": "5A554E", "fontFace": "Arial", "align": "center"}}],
  {"x": 7.7798, "y": 1.68, "w": 0.2, "h": 0.8, "valign": "middle", "isTextBox": true});
S(s2, {"x": 7.9798, "y": 1.68, "w": 2.2266, "h": 0.8, "fill": {"color": "191816"}, "rectRadius": 0.05, "line": {"color": "191816", "width": 1.0}});
T(s2, [{"text": "GUARDRAILS", "options": {"fontSize": 10.5, "bold": true, "color": "F4F2EE", "fontFace": "Arial", "align": "center"}}],
  {"x": 8.0798, "y": 1.78, "w": 2.0266, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "phrase filters,", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "align": "center", "lineSpacing": 11.0, "breakLine": true}}, {"text": "escalate only", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "align": "center", "lineSpacing": 11.0}}],
  {"x": 8.0798, "y": 2.0, "w": 2.0266, "h": 0.4, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "›", "options": {"fontSize": 15.0, "color": "5A554E", "fontFace": "Arial", "align": "center"}}],
  {"x": 10.2064, "y": 1.68, "w": 0.2, "h": 0.8, "valign": "middle", "isTextBox": true});
S(s2, {"x": 10.4064, "y": 1.68, "w": 2.2266, "h": 0.8, "fill": {"color": "191816"}, "rectRadius": 0.05, "line": {"color": "191816", "width": 1.0}});
T(s2, [{"text": "EXECUTE", "options": {"fontSize": 10.5, "bold": true, "color": "F4F2EE", "fontFace": "Arial", "align": "center"}}],
  {"x": 10.5064, "y": 1.78, "w": 2.0266, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "branch steps, side effects,", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "align": "center", "lineSpacing": 11.0, "breakLine": true}}, {"text": "every write audited", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "align": "center", "lineSpacing": 11.0}}],
  {"x": 10.5064, "y": 2.0, "w": 2.0266, "h": 0.4, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "TYPE SELECTS THE BRANCH   ·   URGENCY MODULATES WITHIN IT: SLA CLOCK, SENIOR ROUTING, CONDITIONAL STEPS", "options": {"fontSize": 8.5, "bold": true, "charSpacing": 1.5, "color": "1F9E84", "fontFace": "Calibri", "align": "center"}}],
  {"x": 0.7, "y": 2.6, "w": 11.933, "h": 0.22, "valign": "middle", "isTextBox": true});
S(s2, {"x": 0.7, "y": 2.94, "w": 11.933, "h": 0.46, "fill": {"color": "191816"}, "rectRadius": 0.05, "line": {"color": "191816", "width": 1.0}});
T(s2, [{"text": "billing_dispute", "options": {"fontSize": 9.5, "bold": true, "color": "F4F2EE", "fontFace": "Courier New"}}],
  {"x": 0.88, "y": 2.94, "w": 1.85, "h": 0.46, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "draft acknowledgement  ›  suppress collections  ›  route to Disputes  ›  SLA follow-up  ›  log", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri"}}],
  {"x": 2.8, "y": 2.94, "w": 8.083, "h": 0.46, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "awaiting_human", "options": {"fontSize": 9.0, "bold": true, "color": "9C958D", "fontFace": "Courier New", "align": "right"}}],
  {"x": 10.933, "y": 2.94, "w": 1.52, "h": 0.46, "valign": "middle", "isTextBox": true});
S(s2, {"x": 0.7, "y": 3.47, "w": 11.933, "h": 0.46, "fill": {"color": "141311"}, "rectRadius": 0.05, "line": {"color": "141311", "width": 1.0}});
T(s2, [{"text": "general_enquiry", "options": {"fontSize": 9.5, "bold": true, "color": "F4F2EE", "fontFace": "Courier New"}}],
  {"x": 0.88, "y": 3.47, "w": 1.85, "h": 0.46, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "grounded draft, cited  ›  log  ›  follow-up if urgent        the only branch permitted to close itself", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri"}}],
  {"x": 2.8, "y": 3.47, "w": 8.083, "h": 0.46, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "auto_resolved", "options": {"fontSize": 9.0, "bold": true, "color": "2ABF9F", "fontFace": "Courier New", "align": "right"}}],
  {"x": 10.933, "y": 3.47, "w": 1.52, "h": 0.46, "valign": "middle", "isTextBox": true});
S(s2, {"x": 0.7, "y": 4.0, "w": 11.933, "h": 0.46, "fill": {"color": "191816"}, "rectRadius": 0.05, "line": {"color": "191816", "width": 1.0}});
T(s2, [{"text": "service_request", "options": {"fontSize": 9.5, "bold": true, "color": "F4F2EE", "fontFace": "Courier New"}}],
  {"x": 0.88, "y": 4.0, "w": 1.85, "h": 0.46, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "draft confirmation  ›  route to Servicing Ops  ›  start SLA timer  ›  follow-up  ›  log", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri"}}],
  {"x": 2.8, "y": 4.0, "w": 8.083, "h": 0.46, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "awaiting_human", "options": {"fontSize": 9.0, "bold": true, "color": "9C958D", "fontFace": "Courier New", "align": "right"}}],
  {"x": 10.933, "y": 4.0, "w": 1.52, "h": 0.46, "valign": "middle", "isTextBox": true});
S(s2, {"x": 0.7, "y": 4.53, "w": 11.933, "h": 0.46, "fill": {"color": "141311"}, "rectRadius": 0.05, "line": {"color": "141311", "width": 1.0}});
T(s2, [{"text": "financial_hardship", "options": {"fontSize": 9.5, "bold": true, "color": "C2643F", "fontFace": "Courier New"}}],
  {"x": 0.88, "y": 4.53, "w": 1.85, "h": 0.46, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "PAUSE AUTOMATION  ›  escalate  ›  notify supervisor  ›  holding draft, not auto-sent  ›  follow-up  ›  log", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri"}}],
  {"x": 2.8, "y": 4.53, "w": 8.083, "h": 0.46, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "escalated", "options": {"fontSize": 9.0, "bold": true, "color": "C2643F", "fontFace": "Courier New", "align": "right"}}],
  {"x": 10.933, "y": 4.53, "w": 1.52, "h": 0.46, "valign": "middle", "isTextBox": true});
S(s2, {"x": 0.7, "y": 5.06, "w": 11.933, "h": 0.46, "fill": {"color": "191816"}, "rectRadius": 0.05, "line": {"color": "191816", "width": 1.0}});
T(s2, [{"text": "other", "options": {"fontSize": 9.5, "bold": true, "color": "F4F2EE", "fontFace": "Courier New"}}],
  {"x": 0.88, "y": 5.06, "w": 1.85, "h": 0.46, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "route to Triage Queue  ›  log        honest spam / misrouted branch", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri"}}],
  {"x": 2.8, "y": 5.06, "w": 8.083, "h": 0.46, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "awaiting_human", "options": {"fontSize": 9.0, "bold": true, "color": "9C958D", "fontFace": "Courier New", "align": "right"}}],
  {"x": 10.933, "y": 5.06, "w": 1.52, "h": 0.46, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "FOUR GATES DEMOTE A CASE TOWARD A HUMAN. NONE PROMOTE ONE.", "options": {"fontSize": 9.5, "bold": true, "charSpacing": 1.4, "color": "1F9E84", "fontFace": "Calibri", "lineSpacing": 14.0, "breakLine": true}}, {"text": "Those four are guardrails, confidence, grounding and the provider floor. Every case stores the model's proposal and the system's decision as separate records, the full step trace, and which tier decided it. Classification degrades 70B \u2192 8B \u2192 Gemini \u2192 a keyword floor capped at 0.60 that can never close a case. A human override re-runs the corrected branch and is kept as labelled training signal.", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 14.0}}],
  {"x": 0.7, "y": 5.55, "w": 7.6, "h": 0.95, "valign": "middle", "isTextBox": true});

T(s2, [{"text": "BRANCHES ARE DATA — triage/workflows.yaml", "options": {"fontSize": 8.5, "color": "1F9E84", "fontFace": "Calibri", "bold": true, "charSpacing": 1.9}}],
  {"x": 8.55, "y": 5.62, "w": 4.08, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s2, [{"text": "general_enquiry:", "options": {"fontSize": 7.5, "color": "9C958D", "fontFace": "Courier New", "lineSpacing": 9.5, "breakLine": true}}, {"text": "  steps:", "options": {"fontSize": 7.5, "color": "9C958D", "fontFace": "Courier New", "lineSpacing": 9.5, "breakLine": true}}, {"text": "    - action: generate_response", "options": {"fontSize": 7.5, "color": "F4F2EE", "fontFace": "Courier New", "lineSpacing": 9.5, "breakLine": true}}, {"text": "      grounded: true", "options": {"fontSize": 7.5, "color": "2ABF9F", "fontFace": "Courier New", "lineSpacing": 9.5, "breakLine": true}}, {"text": "    - action: log_outcome", "options": {"fontSize": 7.5, "color": "F4F2EE", "fontFace": "Courier New", "lineSpacing": 9.5}}],
  {"x": 8.55, "y": 5.84, "w": 4.08, "h": 0.68, "valign": "top", "isTextBox": true});
T(s2, [{"text": "An operations manager adds a request type by editing this file. No developer, no deploy.", "options": {"fontSize": 8.0, "color": "5A554E", "fontFace": "Calibri", "lineSpacing": 10.0}}],
  {"x": 8.55, "y": 6.56, "w": 4.08, "h": 0.28, "valign": "middle", "isTextBox": true});

// ===== SLIDE 3 ==========================================================
const s3 = pres.addSlide();
s3.background = { path: BG };
T(s3, [{"text": "03", "options": {"fontSize": 9.5, "color": "1F9E84", "fontFace": "Calibri", "bold": true, "charSpacing": 2.4}}, {"text": " / 05     ", "options": {"fontSize": 9.5, "color": "5A554E", "fontFace": "Calibri", "charSpacing": 2.4}}, {"text": "IMPLEMENTATION HIGHLIGHTS", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri", "charSpacing": 2.4}}],
  {"x": 0.7, "y": 0.38, "w": 11.933, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "IMPLEMENTATION HIGHLIGHTS", "options": {"fontSize": 27.0, "color": "F4F2EE", "fontFace": "Arial", "bold": true, "charSpacing": -0.2}}],
  {"x": 0.7, "y": 0.66, "w": 11.933, "h": 0.5, "valign": "top", "isTextBox": true});
T(s3, [{"text": "HANDOFF   ·   AYUSH GUPTA", "options": {"fontSize": 8.0, "color": "5A554E", "fontFace": "Calibri", "charSpacing": 1.6}}],
  {"x": 0.7, "y": 6.94, "w": 5.0, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "handoff-triage.vercel.app", "options": {"fontSize": 8.0, "color": "5A554E", "fontFace": "Calibri", "align": "right"}}],
  {"x": 7.633, "y": 6.94, "w": 5.0, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "88.0%", "options": {"fontSize": 26.0, "color": "2ABF9F", "fontFace": "Arial", "bold": true}}],
  {"x": 0.7, "y": 1.2, "w": 1.7, "h": 0.46, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "TYPE ACCURACY", "options": {"fontSize": 7.0, "color": "1F9E84", "fontFace": "Calibri", "bold": true, "charSpacing": 0.6}}],
  {"x": 0.7, "y": 1.7, "w": 1.75, "h": 0.18, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "47.0%", "options": {"fontSize": 15.0, "color": "F4F2EE", "fontFace": "Arial", "bold": true}}],
  {"x": 2.48, "y": 1.28, "w": 1.14, "h": 0.34, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "FLOOR BASELINE", "options": {"fontSize": 7.0, "color": "1F9E84", "fontFace": "Calibri", "bold": true, "charSpacing": 0.6}}],
  {"x": 2.48, "y": 1.7, "w": 1.2, "h": 0.18, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "100%", "options": {"fontSize": 15.0, "color": "F4F2EE", "fontFace": "Arial", "bold": true}}],
  {"x": 3.72, "y": 1.28, "w": 1.14, "h": 0.34, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "BRANCH COMPLETION", "options": {"fontSize": 7.0, "color": "1F9E84", "fontFace": "Calibri", "bold": true, "charSpacing": 0.6}}],
  {"x": 3.72, "y": 1.7, "w": 1.2, "h": 0.18, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "91%", "options": {"fontSize": 15.0, "color": "F4F2EE", "fontFace": "Arial", "bold": true}}],
  {"x": 4.96, "y": 1.28, "w": 1.04, "h": 0.34, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "URGENCY WITHIN ONE", "options": {"fontSize": 7.0, "color": "1F9E84", "fontFace": "Calibri", "bold": true, "charSpacing": 0.6}}],
  {"x": 4.96, "y": 1.7, "w": 1.44, "h": 0.18, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "Held-out 100, executed and scored exactly once on the quality tier. 95% CI 80.2–93.0. The floor ran on the same split, so the +41-point gap is like-for-like. Urgency is 52% exact.", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 11.0}}],
  {"x": 0.7, "y": 1.94, "w": 5.3, "h": 0.36, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "THE BRIEF'S FOUR NAMED ACTIONS, ACROSS ALL FIVE BRANCHES", "options": {"fontSize": 8.5, "color": "1F9E84", "fontFace": "Calibri", "bold": true, "charSpacing": 1.9}}],
  {"x": 0.7, "y": 2.44, "w": 5.3, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "Every named action is exercised by at least two branches; every branch runs two to six steps. Hardship pauses automation as its first step and can never auto-resolve.", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 11.0}}],
  {"x": 0.7, "y": 4.24, "w": 5.3, "h": 0.34, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "TYPE CONFUSION · HELD-OUT 100 · ROWS ARE TRUTH", "options": {"fontSize": 8.5, "color": "1F9E84", "fontFace": "Calibri", "bold": true, "charSpacing": 1.9}}],
  {"x": 0.7, "y": 4.7, "w": 5.3, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "Nine of the twelve errors land on service_request — 71% precision against 96% recall, where every other class holds 93–100%. That is why it carries no auto-policy.", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 11.0}}],
  {"x": 0.7, "y": 6.44, "w": 5.3, "h": 0.34, "valign": "middle", "isTextBox": true});
T(s3, [{"text": "ONE CASE, EXECUTED END TO END · FINANCIAL HARDSHIP, CRITICAL", "options": {"fontSize": 8.5, "color": "1F9E84", "fontFace": "Calibri", "bold": true, "charSpacing": 1.9}}],
  {"x": 6.7, "y": 1.22, "w": 5.93, "h": 0.2, "valign": "middle", "isTextBox": true});
s3.addImage({"path": "img/executed.png", "x": 6.7, "y": 1.46, "w": 5.93, "h": 5.32});
s3.addTable([[{"text": "BRANCH", "options": {"fontSize": 8.0, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Calibri", "align": "center"}}, {"text": "generate", "options": {"fontSize": 8.0, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Calibri", "align": "center"}}, {"text": "route", "options": {"fontSize": 8.0, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Calibri", "align": "center"}}, {"text": "follow-up", "options": {"fontSize": 8.0, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Calibri", "align": "center"}}, {"text": "log", "options": {"fontSize": 8.0, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Calibri", "align": "center"}}, {"text": "OUTCOME", "options": {"fontSize": 8.0, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Calibri", "align": "center"}}], [{"text": "billing_dispute", "options": {"fontSize": 8.5, "color": "F4F2EE", "fontFace": "Courier New"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "awaiting_human", "options": {"fontSize": 7.5, "color": "9C958D", "fontFace": "Courier New", "align": "right"}}], [{"text": "general_enquiry", "options": {"fontSize": 8.5, "color": "F4F2EE", "fontFace": "Courier New"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "—", "options": {"fontSize": 9.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "auto_resolved", "options": {"fontSize": 7.5, "color": "2ABF9F", "fontFace": "Courier New", "align": "right"}}], [{"text": "service_request", "options": {"fontSize": 8.5, "color": "F4F2EE", "fontFace": "Courier New"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "awaiting_human", "options": {"fontSize": 7.5, "color": "9C958D", "fontFace": "Courier New", "align": "right"}}], [{"text": "financial_hardship", "options": {"fontSize": 8.5, "color": "F4F2EE", "fontFace": "Courier New"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "—", "options": {"fontSize": 9.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "escalated", "options": {"fontSize": 7.5, "color": "C2643F", "fontFace": "Courier New", "align": "right"}}], [{"text": "other", "options": {"fontSize": 8.5, "color": "F4F2EE", "fontFace": "Courier New"}}, {"text": "—", "options": {"fontSize": 9.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "—", "options": {"fontSize": 9.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "✓", "options": {"fontSize": 10.0, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "awaiting_human", "options": {"fontSize": 7.5, "color": "9C958D", "fontFace": "Courier New", "align": "right"}}]], {"x": 0.7, "y": 2.66, "w": 5.3, "colW": [1.48, 0.71, 0.61, 0.79, 0.56, 1.15], "rowH": [0.22, 0.22, 0.22, 0.22, 0.22, 0.22], "border": {"type": "solid", "pt": 0.5, "color": "23211E"}, "margin": 1.5, "valign": "middle"});
s3.addTable([[{"text": "true \\ pred", "options": {"fontSize": 7.5, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Courier New", "align": "left"}}, {"text": "bill", "options": {"fontSize": 7.5, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Calibri", "align": "center"}}, {"text": "hard", "options": {"fontSize": 7.5, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Calibri", "align": "center"}}, {"text": "enq", "options": {"fontSize": 7.5, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Calibri", "align": "center"}}, {"text": "svc", "options": {"fontSize": 7.5, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Calibri", "align": "center"}}, {"text": "other", "options": {"fontSize": 7.5, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Calibri", "align": "center"}}, {"text": "n", "options": {"fontSize": 7.5, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Calibri", "align": "center"}}, {"text": "recall", "options": {"fontSize": 7.5, "bold": true, "charSpacing": 0.8, "color": "9C958D", "fontFace": "Calibri", "align": "center"}}], [{"text": "bill", "options": {"fontSize": 8.0, "color": "F4F2EE", "fontFace": "Courier New"}}, {"text": "18", "options": {"fontSize": 9.5, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "1", "options": {"fontSize": 8.5, "bold": false, "color": "F4F2EE", "fontFace": "Calibri", "align": "center"}}, {"text": "0", "options": {"fontSize": 8.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "1", "options": {"fontSize": 8.5, "bold": false, "color": "F4F2EE", "fontFace": "Calibri", "align": "center"}}, {"text": "0", "options": {"fontSize": 8.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "20", "options": {"fontSize": 7.5, "color": "5A554E", "fontFace": "Courier New", "align": "center"}}, {"text": "90%", "options": {"fontSize": 7.5, "color": "9C958D", "fontFace": "Courier New", "align": "right"}}], [{"text": "hard", "options": {"fontSize": 8.0, "color": "F4F2EE", "fontFace": "Courier New"}}, {"text": "0", "options": {"fontSize": 8.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "14", "options": {"fontSize": 9.5, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "0", "options": {"fontSize": 8.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "3", "options": {"fontSize": 8.5, "bold": false, "color": "F4F2EE", "fontFace": "Calibri", "align": "center"}}, {"text": "0", "options": {"fontSize": 8.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "17", "options": {"fontSize": 7.5, "color": "5A554E", "fontFace": "Courier New", "align": "center"}}, {"text": "82%", "options": {"fontSize": 7.5, "color": "9C958D", "fontFace": "Courier New", "align": "right"}}], [{"text": "enq", "options": {"fontSize": 8.0, "color": "F4F2EE", "fontFace": "Courier New"}}, {"text": "1", "options": {"fontSize": 8.5, "bold": false, "color": "F4F2EE", "fontFace": "Calibri", "align": "center"}}, {"text": "0", "options": {"fontSize": 8.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "18", "options": {"fontSize": 9.5, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "3", "options": {"fontSize": 8.5, "bold": false, "color": "F4F2EE", "fontFace": "Calibri", "align": "center"}}, {"text": "0", "options": {"fontSize": 8.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "22", "options": {"fontSize": 7.5, "color": "5A554E", "fontFace": "Courier New", "align": "center"}}, {"text": "82%", "options": {"fontSize": 7.5, "color": "9C958D", "fontFace": "Courier New", "align": "right"}}], [{"text": "svc", "options": {"fontSize": 8.0, "color": "F4F2EE", "fontFace": "Courier New"}}, {"text": "0", "options": {"fontSize": 8.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "0", "options": {"fontSize": 8.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "1", "options": {"fontSize": 8.5, "bold": false, "color": "F4F2EE", "fontFace": "Calibri", "align": "center"}}, {"text": "22", "options": {"fontSize": 9.5, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "0", "options": {"fontSize": 8.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "23", "options": {"fontSize": 7.5, "color": "5A554E", "fontFace": "Courier New", "align": "center"}}, {"text": "96%", "options": {"fontSize": 7.5, "color": "9C958D", "fontFace": "Courier New", "align": "right"}}], [{"text": "other", "options": {"fontSize": 8.0, "color": "F4F2EE", "fontFace": "Courier New"}}, {"text": "0", "options": {"fontSize": 8.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "0", "options": {"fontSize": 8.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "0", "options": {"fontSize": 8.5, "bold": false, "color": "5A554E", "fontFace": "Calibri", "align": "center"}}, {"text": "2", "options": {"fontSize": 8.5, "bold": false, "color": "F4F2EE", "fontFace": "Calibri", "align": "center"}}, {"text": "16", "options": {"fontSize": 9.5, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "align": "center"}}, {"text": "18", "options": {"fontSize": 7.5, "color": "5A554E", "fontFace": "Courier New", "align": "center"}}, {"text": "89%", "options": {"fontSize": 7.5, "color": "9C958D", "fontFace": "Courier New", "align": "right"}}]], {"x": 0.7, "y": 4.9, "w": 5.3, "colW": [1.3, 0.55, 0.55, 0.55, 0.55, 0.6, 0.4, 0.8], "rowH": [0.215, 0.215, 0.215, 0.215, 0.215, 0.215], "border": {"type": "solid", "pt": 0.5, "color": "23211E"}, "margin": 1.5, "valign": "middle"});

// ===== SLIDE 4 ==========================================================
const s4 = pres.addSlide();
s4.background = { path: BG };
T(s4, [{"text": "04", "options": {"fontSize": 9.5, "color": "1F9E84", "fontFace": "Calibri", "bold": true, "charSpacing": 2.4}}, {"text": " / 05     ", "options": {"fontSize": 9.5, "color": "5A554E", "fontFace": "Calibri", "charSpacing": 2.4}}, {"text": "CHALLENGES AND LEARNINGS", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri", "charSpacing": 2.4}}],
  {"x": 0.7, "y": 0.38, "w": 11.933, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "CHALLENGES AND LEARNINGS", "options": {"fontSize": 27.0, "color": "F4F2EE", "fontFace": "Arial", "bold": true, "charSpacing": -0.2}}],
  {"x": 0.7, "y": 0.66, "w": 11.933, "h": 0.5, "valign": "top", "isTextBox": true});
T(s4, [{"text": "HANDOFF   ·   AYUSH GUPTA", "options": {"fontSize": 8.0, "color": "5A554E", "fontFace": "Calibri", "charSpacing": 1.6}}],
  {"x": 0.7, "y": 6.94, "w": 5.0, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "handoff-triage.vercel.app", "options": {"fontSize": 8.0, "color": "5A554E", "fontFace": "Calibri", "align": "right"}}],
  {"x": 7.633, "y": 6.94, "w": 5.0, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "01", "options": {"fontSize": 10.0, "color": "1F9E84", "fontFace": "Courier New", "bold": true}}],
  {"x": 0.7, "y": 1.3, "w": 0.5, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "The bounded-autonomy tension", "options": {"fontSize": 15.0, "color": "F4F2EE", "fontFace": "Arial", "bold": true}}],
  {"x": 0.7, "y": 1.52, "w": 5.6565, "h": 0.3, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "The brief invites an agent. A regulated lending desk is the wrong place to give a model authority over side effects.", "options": {"fontSize": 10.5, "color": "F4F2EE", "fontFace": "Calibri", "lineSpacing": 13.5}}],
  {"x": 0.7, "y": 1.9, "w": 5.6565, "h": 0.58, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "Resolved by splitting perception from control: the model proposes a classification, the state machine disposes. Four gates — guardrails, confidence, grounding, provider floor — can each demote a case toward a human, and not one of them can promote a case toward automation.", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 11.5}}],
  {"x": 0.7, "y": 2.54, "w": 5.6565, "h": 1.0, "valign": "top", "isTextBox": true});
T(s4, [{"text": "02", "options": {"fontSize": 10.0, "color": "1F9E84", "fontFace": "Courier New", "bold": true}}],
  {"x": 6.9765, "y": 1.3, "w": 0.5, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "A configuration that lied", "options": {"fontSize": 15.0, "color": "F4F2EE", "fontFace": "Arial", "bold": true}}],
  {"x": 6.9765, "y": 1.52, "w": 5.6565, "h": 0.3, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "workflows.yaml declared the enquiry branch grounded while the engine returned a hardcoded placeholder. Thirty-four cases were reported auto-resolved having resolved nothing.", "options": {"fontSize": 10.5, "color": "F4F2EE", "fontFace": "Calibri", "lineSpacing": 13.5}}],
  {"x": 6.9765, "y": 1.9, "w": 5.6565, "h": 0.58, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "Found by clicking through the console, not by a test. A real knowledge base and a grounding gate now make that flag an enforced contract, and fixing it moved automation from 17.0% to 8.5% — the honest direction for a number to move. The same shape recurred later: configuration only reaches future runs, so claims already written into stored cases had to be reconciled against the evidence at the display layer.", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 11.5}}],
  {"x": 6.9765, "y": 2.54, "w": 5.6565, "h": 1.0, "valign": "top", "isTextBox": true});
T(s4, [{"text": "03", "options": {"fontSize": 10.0, "color": "1F9E84", "fontFace": "Courier New", "bold": true}}],
  {"x": 0.7, "y": 3.7, "w": 0.5, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "Measuring instead of asserting", "options": {"fontSize": 15.0, "color": "F4F2EE", "fontFace": "Arial", "bold": true}}],
  {"x": 0.7, "y": 3.9200000000000004, "w": 5.6565, "h": 0.3, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "The corpus is LLM-generated, so its labels are an upper bound. A single accuracy figure with nothing beside it says very little.", "options": {"fontSize": 10.5, "color": "F4F2EE", "fontFace": "Calibri", "lineSpacing": 13.5}}],
  {"x": 0.7, "y": 4.3, "w": 5.6565, "h": 0.58, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "Published against a keyword baseline on the same split with Wilson intervals, and against a cross-family holdout, where the model proposed the correct type 39 times in 40 — 97.5% — while the system scored 92.5%: the hardship guardrail overrode two correct calls, both on “cannot afford”. Two thirds of the measured error is the safety layer doing its job. ECE is 0.027 across three confidence levels, and critical urgency was never predicted — those 11 rows were audited, not relabelled.", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 11.5}}],
  {"x": 0.7, "y": 4.94, "w": 5.6565, "h": 1.0, "valign": "top", "isTextBox": true});
T(s4, [{"text": "04", "options": {"fontSize": 10.0, "color": "1F9E84", "fontFace": "Courier New", "bold": true}}],
  {"x": 6.9765, "y": 3.7, "w": 0.5, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "Leaving the suggested stack", "options": {"fontSize": 15.0, "color": "F4F2EE", "fontFace": "Arial", "bold": true}}],
  {"x": 6.9765, "y": 3.9200000000000004, "w": 5.6565, "h": 0.3, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "The brief suggests Streamlit or Gradio with n8n or Retool. We used none of them, which needs justifying rather than assuming.", "options": {"fontSize": 10.5, "color": "F4F2EE", "fontFace": "Calibri", "lineSpacing": 13.5}}],
  {"x": 6.9765, "y": 4.3, "w": 5.6565, "h": 0.58, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "A system with authority to pause collections needs control flow that is replayable, unit-testable and reviewable in version control. workflows.yaml keeps the declarative benefit those tools sell: an operations manager adds a request type by editing config, with no developer and no deploy.", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 11.5}}],
  {"x": 6.9765, "y": 4.94, "w": 5.6565, "h": 1.0, "valign": "top", "isTextBox": true});
T(s4, [{"text": "WHAT IS STILL WRONG — FOUND BY US, NOT YET FIXED", "options": {"fontSize": 8.5, "color": "1F9E84", "fontFace": "Calibri", "bold": true, "charSpacing": 1.9}}],
  {"x": 0.7, "y": 6.06, "w": 8.0, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s4, [{"text": "Approval lock is console-side.", "options": {"fontSize": 8.0, "color": "F4F2EE", "fontFace": "Calibri", "bold": true, "lineSpacing": 9.8, "breakLine": true}}, {"text": "The review endpoint guards double-approval, but not override-after-approval. Four lines to close.", "options": {"fontSize": 8.0, "color": "5A554E", "fontFace": "Calibri", "lineSpacing": 9.8}}],
  {"x": 0.7, "y": 6.28, "w": 2.75, "h": 0.58, "valign": "top", "isTextBox": true});
T(s4, [{"text": "No urgency floor on override.", "options": {"fontSize": 8.0, "color": "F4F2EE", "fontFace": "Calibri", "bold": true, "lineSpacing": 9.8, "breakLine": true}}, {"text": "A reviewer can drop critical to low, moving a 15-minute SLA to two working days.", "options": {"fontSize": 8.0, "color": "5A554E", "fontFace": "Calibri", "lineSpacing": 9.8}}],
  {"x": 3.6799999999999997, "y": 6.28, "w": 2.75, "h": 0.58, "valign": "top", "isTextBox": true});
T(s4, [{"text": "The per-class gate is derived on dev.", "options": {"fontSize": 8.0, "color": "F4F2EE", "fontFace": "Calibri", "bold": true, "lineSpacing": 9.8, "breakLine": true}}, {"text": "billing_dispute lands at 94.7% on held-out against a 95% pre-registered bar — inside the CI.", "options": {"fontSize": 8.0, "color": "5A554E", "fontFace": "Calibri", "lineSpacing": 9.8}}],
  {"x": 6.66, "y": 6.28, "w": 2.75, "h": 0.58, "valign": "top", "isTextBox": true});
T(s4, [{"text": "Responsive layout is deferred.", "options": {"fontSize": 8.0, "color": "F4F2EE", "fontFace": "Calibri", "bold": true, "lineSpacing": 9.8, "breakLine": true}}, {"text": "The desk assumes a wide viewport; a deliberate trade against measurement time.", "options": {"fontSize": 8.0, "color": "5A554E", "fontFace": "Calibri", "lineSpacing": 9.8}}],
  {"x": 9.639999999999999, "y": 6.28, "w": 2.75, "h": 0.58, "valign": "top", "isTextBox": true});

// ===== SLIDE 5 ==========================================================
const s5 = pres.addSlide();
s5.background = { path: BG };
T(s5, [{"text": "05", "options": {"fontSize": 9.5, "bold": true, "charSpacing": 2.4, "color": "1F9E84", "fontFace": "Calibri"}}, {"text": " / 05     ", "options": {"fontSize": 9.5, "charSpacing": 2.4, "color": "5A554E", "fontFace": "Calibri"}}, {"text": "DEMO SUMMARY AND NEXT STEPS", "options": {"fontSize": 9.5, "charSpacing": 2.4, "color": "9C958D", "fontFace": "Calibri"}}],
  {"x": 0.7, "y": 0.38, "w": 11.933, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "DEMO SUMMARY AND NEXT STEPS", "options": {"fontSize": 27.0, "bold": true, "charSpacing": -0.2, "color": "F4F2EE", "fontFace": "Arial"}}],
  {"x": 0.7, "y": 0.66, "w": 11.933, "h": 0.5, "valign": "top", "isTextBox": true});
T(s5, [{"text": "HANDOFF   ·   AYUSH GUPTA", "options": {"fontSize": 8.0, "charSpacing": 1.6, "color": "5A554E", "fontFace": "Calibri"}}],
  {"x": 0.7, "y": 6.94, "w": 5.0, "h": 0.22, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "handoff-triage.vercel.app", "options": {"fontSize": 8.0, "color": "5A554E", "fontFace": "Calibri", "align": "right"}}],
  {"x": 7.633, "y": 6.94, "w": 5.0, "h": 0.22, "valign": "middle", "isTextBox": true});
s5.addImage({"path": "img/landing.png", "x": 0.7, "y": 1.24, "w": 7.6, "h": 3.419});
T(s5, [{"text": "Demo mode opens cold from committed batch data — no keys, no network. Live mode runs a pasted message through the same pipeline, with a provider-outage toggle that degrades on the real code path, and persists every case to libSQL — so a repeat send is caught as a duplicate before any model call.", "options": {"fontSize": 9.0, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 12.0}}],
  {"x": 0.7, "y": 4.819, "w": 7.6, "h": 0.56, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "WHAT THE RECORDING SHOWS", "options": {"fontSize": 8.5, "bold": true, "charSpacing": 1.9, "color": "1F9E84", "fontFace": "Calibri"}}],
  {"x": 0.7, "y": 5.46, "w": 7.6, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "Five request types arriving across three intake channels, each taking a visibly different branch — including a hardship disclosure the model under-read and a guardrail escalated over it.", "options": {"fontSize": 10.5, "color": "F4F2EE", "fontFace": "Calibri", "lineSpacing": 14.0}}],
  {"x": 0.7, "y": 5.68, "w": 7.6, "h": 0.7, "valign": "middle", "isTextBox": true});
S(s5, {"x": 8.75, "y": 1.24, "w": 3.883, "h": 1.30, "fill": {"color": "0F1F1C"}, "rectRadius": 0.05, "line": {"color": "0F1F1C", "width": 1.0}});
T(s5, [{"text": "SUBMISSION LINKS", "options": {"fontSize": 8.5, "bold": true, "charSpacing": 1.9, "color": "2ABF9F", "fontFace": "Calibri"}}],
  {"x": 9.01, "y": 1.38, "w": 3.383, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "handoff-triage.vercel.app", "options": {"fontSize": 10.5, "bold": true, "color": "2ABF9F", "fontFace": "Calibri", "lineSpacing": 16.0, "breakLine": true}}, {"text": "Demo recording \u00b7 attached to this email", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 13.0, "breakLine": true}}, {"text": "github.com/ayushgupta07xx/Request-Triage", "options": {"fontSize": 9.5, "bold": true, "color": "F4F2EE", "fontFace": "Calibri", "lineSpacing": 16.0}}],
  {"x": 9.01, "y": 1.62, "w": 3.383, "h": 0.80, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "NEXT STEPS, ORDERED BY LEVERAGE", "options": {"fontSize": 8.5, "bold": true, "charSpacing": 1.9, "color": "1F9E84", "fontFace": "Calibri"}}],
  {"x": 8.75, "y": 2.72, "w": 3.883, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "1", "options": {"fontSize": 9.0, "bold": true, "color": "1F9E84", "fontFace": "Courier New"}}],
  {"x": 8.75, "y": 2.96, "w": 0.24, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "Expand the knowledge base", "options": {"fontSize": 9.5, "bold": true, "color": "F4F2EE", "fontFace": "Calibri", "lineSpacing": 12.0, "breakLine": true}}, {"text": "Automation is bounded by coverage, not model quality.", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 12.0}}],
  {"x": 9.05, "y": 2.96, "w": 3.583, "h": 0.6, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "2", "options": {"fontSize": 9.0, "bold": true, "color": "1F9E84", "fontFace": "Courier New"}}],
  {"x": 8.75, "y": 3.62, "w": 0.24, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "Fine-tune on the override queue", "options": {"fontSize": 9.5, "bold": true, "color": "F4F2EE", "fontFace": "Calibri", "lineSpacing": 12.0, "breakLine": true}}, {"text": "Every correction is already stored as labelled signal.", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 12.0}}],
  {"x": 9.05, "y": 3.62, "w": 3.583, "h": 0.6, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "3", "options": {"fontSize": 9.0, "bold": true, "color": "1F9E84", "fontFace": "Courier New"}}],
  {"x": 8.75, "y": 4.28, "w": 0.24, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "Embeddings behind kb.lookup", "options": {"fontSize": 9.5, "bold": true, "color": "F4F2EE", "fontFace": "Calibri", "lineSpacing": 12.0, "breakLine": true}}, {"text": "A single interface to replace; the keyword match stays as fallback.", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 12.0}}],
  {"x": 9.05, "y": 4.28, "w": 3.583, "h": 0.6, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "4", "options": {"fontSize": 9.0, "bold": true, "color": "1F9E84", "fontFace": "Courier New"}}],
  {"x": 8.75, "y": 4.94, "w": 0.24, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "Queue workers and per-class routing", "options": {"fontSize": 9.5, "bold": true, "color": "F4F2EE", "fontFace": "Calibri", "lineSpacing": 12.0, "breakLine": true}}, {"text": "Hosted cases persist to libSQL today; the rest is orchestration.", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 12.0}}],
  {"x": 9.05, "y": 4.94, "w": 3.583, "h": 0.6, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "5", "options": {"fontSize": 9.0, "bold": true, "color": "1F9E84", "fontFace": "Courier New"}}],
  {"x": 8.75, "y": 5.6, "w": 0.24, "h": 0.2, "valign": "middle", "isTextBox": true});
T(s5, [{"text": "Wire review to a staffed rota", "options": {"fontSize": 9.5, "bold": true, "color": "F4F2EE", "fontFace": "Calibri", "lineSpacing": 12.0, "breakLine": true}}, {"text": "Every queue item gets a named owner, not just a status.", "options": {"fontSize": 9.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 12.0}}],
  {"x": 9.05, "y": 5.6, "w": 3.583, "h": 0.6, "valign": "middle", "isTextBox": true});

T(s5, [{"text": "All four optional enhancements are in: batch processing, a per-case audit trail, a dashboard by type and status, and an escalation override for cases the model is uncertain about.", "options": {"fontSize": 8.5, "color": "9C958D", "fontFace": "Calibri", "lineSpacing": 11.0}}],
  {"x": 0.7, "y": 6.42, "w": 7.6, "h": 0.36, "valign": "middle", "isTextBox": true});

pres.writeFile({ fileName: "out.pptx" }).then(() => console.log("wrote out.pptx"));
