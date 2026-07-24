"""
Loads and validates workflows.yaml.

Design note: the config is validated against the schema enums at import time,
not at execution time. A typo in a branch name or action fails immediately at
startup with a precise message, rather than surfacing three steps into a
remediation run in front of a reviewer.
"""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path
from typing import Any, Optional

import yaml

from .schemas import ActionType, CaseStatus, RequestType, Urgency

CONFIG_PATH = Path(__file__).parent / "workflows.yaml"

_URGENCY_ORDER = {
    Urgency.LOW: 0,
    Urgency.MEDIUM: 1,
    Urgency.HIGH: 2,
    Urgency.CRITICAL: 3,
}


class ConfigError(ValueError):
    """Raised when workflows.yaml is structurally valid YAML but semantically wrong."""


class WorkflowConfig:
    def __init__(self, raw: dict[str, Any]):
        self.raw = raw
        self.version: str = raw.get("version", "0")
        self.context: dict[str, str] = raw.get("context", {})
        self.defaults: dict[str, Any] = raw.get("defaults", {})
        self.urgency_sla: dict[Urgency, int] = {}
        self.guardrails: list[dict[str, Any]] = raw.get("guardrails", [])
        self.branches: dict[RequestType, dict[str, Any]] = {}
        self.review_queue: dict[str, Any] = raw.get("review_queue", {})
        self.auto_policies: dict[str, dict[str, Any]] = {}
        self._validate()

    # -- validation -------------------------------------------------------

    def _validate(self) -> None:
        errors: list[str] = []

        for name, minutes in (self.raw.get("urgency_sla_minutes") or {}).items():
            try:
                self.urgency_sla[Urgency(name)] = int(minutes)
            except ValueError:
                errors.append(f"urgency_sla_minutes: unknown urgency {name!r}")

        missing_sla = set(Urgency) - set(self.urgency_sla)
        if missing_sla:
            errors.append(
                "urgency_sla_minutes missing: "
                + ", ".join(sorted(u.value for u in missing_sla))
            )

        for gr in self.guardrails:
            gid = gr.get("id", "<unnamed>")
            if not gr.get("phrases"):
                errors.append(f"guardrail {gid!r}: no phrases defined")
            if (ft := gr.get("force_type")) is not None:
                try:
                    RequestType(ft)
                except ValueError:
                    errors.append(f"guardrail {gid!r}: unknown force_type {ft!r}")
            if (mu := gr.get("min_urgency")) is not None:
                try:
                    Urgency(mu)
                except ValueError:
                    errors.append(f"guardrail {gid!r}: unknown min_urgency {mu!r}")

        for name, branch in (self.raw.get("branches") or {}).items():
            try:
                rt = RequestType(name)
            except ValueError:
                errors.append(f"branches: {name!r} is not a valid request type")
                continue
            self.branches[rt] = branch

            steps = branch.get("steps") or []
            if len(steps) < 2:
                errors.append(
                    f"branch {name!r}: {len(steps)} step(s) — the brief requires "
                    "at least two downstream steps per branch"
                )
            for i, step in enumerate(steps):
                try:
                    ActionType(step.get("action"))
                except ValueError:
                    errors.append(
                        f"branch {name!r} step {i}: unknown action {step.get('action')!r}"
                    )
                if (st := step.get("status")) is not None:
                    try:
                        CaseStatus(st)
                    except ValueError:
                        errors.append(
                            f"branch {name!r} step {i}: unknown status {st!r}"
                        )
                for u in step.get("conditional_on_urgency") or []:
                    try:
                        Urgency(u)
                    except ValueError:
                        errors.append(
                            f"branch {name!r} step {i}: unknown urgency {u!r}"
                        )

        uncovered = set(RequestType) - set(self.branches)
        if uncovered:
            errors.append(
                "no branch defined for: "
                + ", ".join(sorted(t.value for t in uncovered))
            )

        for model, pol in (self.raw.get("auto_policies") or {}).items():
            kind = (pol or {}).get("kind")
            if kind not in ("per_class", "ensemble"):
                errors.append(f"auto_policies[{model!r}]: unknown kind {kind!r}")
                continue
            parsed: dict[str, Any] = {"kind": kind}
            if kind == "per_class":
                gates: dict[RequestType, float] = {}
                for cls, t in (pol.get("class_thresholds") or {}).items():
                    try:
                        rt = RequestType(cls)
                    except ValueError:
                        errors.append(
                            f"auto_policies[{model!r}]: unknown class {cls!r}"
                        )
                        continue
                    if rt == RequestType.FINANCIAL_HARDSHIP:
                        errors.append(
                            f"auto_policies[{model!r}]: financial_hardship may "
                            "never auto-handle - the branch pauses automation "
                            "by design"
                        )
                        continue
                    try:
                        tv = float(t)
                    except (TypeError, ValueError):
                        tv = -1.0
                    if not 0.0 <= tv <= 1.0:
                        errors.append(
                            f"auto_policies[{model!r}].{cls}: threshold {t!r} "
                            "not in [0, 1]"
                        )
                        continue
                    gates[rt] = tv
                if not gates:
                    errors.append(
                        f"auto_policies[{model!r}]: per_class policy with no "
                        "valid class_thresholds"
                    )
                parsed["class_thresholds"] = gates
            else:
                try:
                    tv = float(pol.get("threshold", 1.0))
                except (TypeError, ValueError):
                    tv = -1.0
                if not 0.0 <= tv <= 1.0:
                    errors.append(f"auto_policies[{model!r}]: threshold not in [0, 1]")
                parsed["threshold"] = tv
            self.auto_policies[model] = parsed

        if errors:
            raise ConfigError(
                "workflows.yaml failed validation:\n  - " + "\n  - ".join(errors)
            )

    # -- accessors --------------------------------------------------------

    @property
    def confidence_threshold(self) -> float:
        return float(self.defaults.get("confidence_threshold", 0.7))

    @property
    def duplicate_window(self) -> timedelta:
        return timedelta(minutes=int(self.defaults.get("duplicate_window_minutes", 60)))

    def auto_policy_for(self, model_name: Optional[str]) -> Optional[dict[str, Any]]:
        """The auto-handling gate derived for this model, or None.

        None means the model has no derived operating point, and the caller
        must route to human review. Absence of evidence is a review reason.
        """
        if not model_name:
            return None
        return self.auto_policies.get(model_name)

    def branch_for(self, rt: RequestType) -> dict[str, Any]:
        return self.branches[rt]

    def sla_for(self, urgency: Urgency) -> timedelta:
        return timedelta(minutes=self.urgency_sla[urgency])

    def route_target(self, rt: RequestType, urgency: Urgency) -> str:
        """Routing target, escalated to the senior queue when urgency warrants."""
        branch = self.branches[rt]
        threshold = branch.get("escalate_to_senior_at_urgency")
        senior = branch.get("senior_route_to")
        if senior and threshold:
            if _URGENCY_ORDER[urgency] >= _URGENCY_ORDER[Urgency(threshold)]:
                return senior
        return branch.get("route_to", "Triage Queue")

    def steps_for(self, rt: RequestType, urgency: Urgency) -> list[dict[str, Any]]:
        """Steps for this branch, filtered by any urgency conditions."""
        out = []
        for step in self.branches[rt].get("steps", []):
            cond = step.get("conditional_on_urgency")
            if cond and urgency.value not in cond:
                continue
            out.append(step)
        return out

    @staticmethod
    def max_urgency(a: Urgency, b: Urgency) -> Urgency:
        return a if _URGENCY_ORDER[a] >= _URGENCY_ORDER[b] else b


def load_config(path: Optional[Path] = None) -> WorkflowConfig:
    p = path or CONFIG_PATH
    with open(p, "r", encoding="utf-8") as fh:
        return WorkflowConfig(yaml.safe_load(fh))
