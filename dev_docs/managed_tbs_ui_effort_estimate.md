# Managed TBS UI effort estimate (Signals scope)

This document estimates the two UI-centric work items in the design doc:

1. **Policy management UI**
2. **Sampling monitoring screens**

It focuses on hidden complexity beyond "a simple UI form that calls an API".

---

## Short answer

No, this is **not** just a simple form + API call.

Even with a clean backend API, the UI work has meaningful complexity from:

- policy authoring safety and validation UX,
- explainability of "why kept" decisions,
- high-cardinality monitoring data design,
- RBAC/auditability needs for production controls,
- and cross-team contracts (Streams + Signals) that can block frontend velocity.

---

## Estimated effort (UI + UX + integration)

Assumptions:

- API exists with `validate` and `apply` semantics for full policy-set replacement.
- Sampling stats datastream schema is stable and documented.
- Design system components are available in-product.

| Work item | Engineering estimate | Notes |
|---|---:|---|
| Policy management UI (create/edit/review policies) | **4-7 person-weeks** | 2-3 w UI implementation, 1-2 w validation/review UX, 1-2 w RBAC/audit/error handling + QA |
| Sampling monitoring screens | **5-9 person-weeks** | 2-3 w dashboards/charts, 1-2 w per-policy drilldowns, 1-2 w "kept/dropped and why" exploration, 1-2 w performance + QA |

Combined Signals estimate for these two rows: **9-16 person-weeks**.

---

## Where hidden complexity appears

### 1) Policy management UI

#### A. Full-set replacement semantics (not patch semantics)
- The API takes a complete policy set and replaces previous state.
- UI must protect users from accidental deletions/regressions.
- Needs change review/diff before apply, not just "Save".

#### B. Two-phase workflow (validate then apply)
- UX must clearly separate dry-run validation from apply.
- Validation results can include multiple classes of issues:
  - syntax/schema errors,
  - memory risk warnings,
  - index volume risk warnings.
- Users need actionable errors tied to exact policy fields.

#### C. Guardrails and blast-radius controls
- The doc says some knobs remain Elastic-controlled (for cost safety).
- UI must expose what is editable vs locked, with reasons.
- Requires policy capability metadata from backend.

#### D. Concurrency/versioning
- If policy sets are edited by UI + CI + Terraform, stale writes are likely.
- UI should use revision IDs/ETags and conflict resolution UX.

#### E. Enterprise controls
- Production policy changes typically require:
  - RBAC (who can validate vs apply),
  - audit trail (who changed what, when),
  - possibly approval workflows (even if minimal in v1).

---

### 2) Sampling monitoring screens

#### A. Data contract risk
- "Volume in vs kept", policy hit rates, health, and "why kept" require a stable schema.
- If schema is unsettled, frontend rework is high.

#### B. Time-series + cardinality pressure
- Policy labels, services, environments can explode cardinality.
- UI needs sensible defaults, filters, and rollups to stay fast.

#### C. Explainability ("what was kept and why")
- This is usually the hardest user-facing part.
- Requires reason taxonomy that maps to OTel policy decisions.
- Needs trace-level evidence and pivot paths from aggregate charts.

#### D. Multi-window interpretation
- Hit rates and reduction over time can be misleading across time windows.
- UI needs clear denominator definitions and tooltips to avoid false conclusions.

#### E. Operational diagnostics
- "Sampler health" often means queue/backpressure/memory/restarts/dropped decision windows.
- Health panels usually need derived states, not raw metrics only.

---

## Dependencies that can shift effort up/down

Largest upward risks:

1. API/schema churn while UI is being built.
2. Missing backend support for `validate` details (field-level messages).
3. No revisioned apply model (harder conflict handling).
4. Late security/compliance asks (audit export, approval flow, change freeze).
5. Very high-volume data requiring aggressive frontend query optimization.

Largest downward accelerators:

1. Stable OpenAPI + datastream contract finalized first.
2. Reuse of existing in-product charting and form builders.
3. Existing audit log and RBAC primitives in host product.
4. "v1 scope fence" explicitly excluding advanced workflows (approvals, templates, recommendations).

---

## Suggested phased UI scope

### V1 (targeting migration unblock)
- Policy list + JSON/YAML editor + validate/apply flow.
- Basic diff preview before apply.
- Monitoring dashboard: volume in vs kept, policy hit rates, reduction trend, sampler health summary.
- "Why kept" shown as top reason categories with trace drilldown link.

### V1.5
- Guided policy builder (form-first), change history view, compare revisions.
- Better anomaly callouts and policy impact simulation.

### V2
- Deeper integration into Streams pipeline UI (`streams-map`).
- Adaptive sampling controls and recommendations.

