# Service settings in package policies: option sketches

This document compares two UX/data-model options for service settings that eventually become package policy values.

## Problem framing

Service-specific settings now include policy-level fields such as:

- `name`
- `description`
- `namespace`

The key decision is where these fields live in the creation flow and how they map to package policy objects.

---

## Option 1: Service-specific fields (likely one package policy per service)

### Diagram (flow + data shape)

```text
┌─────────────────────────────────────────────────────────────────┐
│ Integration setup                                               │
│  - Select services: [API] [Worker] [Frontend]                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ For each selected service                                      │
│  Service card: API                                              │
│   - Package policy name                                         │
│   - Description                                                 │
│   - Namespace                                                   │
│   - Service-level vars                                          │
└─────────────────────────────────────────────────────────────────┘
                            │ repeat per service
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Output                                                          │
│  packagePolicy[api]    -> name/description/namespace/api vars  │
│  packagePolicy[worker] -> name/description/namespace/worker vars│
│  packagePolicy[front]  -> name/description/namespace/front vars │
└─────────────────────────────────────────────────────────────────┘
```

### Mockup (form-level)

```text
Create integration policy
========================================================
Selected services: [API] [Worker]

[Service: API]
  Policy name:        api-prod
  Description:        API service in production
  Namespace:          prod-api
  Service URL:        https://api.internal
  Enable traces:      true

[Service: Worker]
  Policy name:        worker-prod
  Description:        Worker fleet
  Namespace:          prod-worker
  Queue name:         jobs-main
  Poll interval (s):  15

[Create 2 package policies]
```

### Example payload sketch

```json
[
  {
    "name": "api-prod",
    "description": "API service in production",
    "namespace": "prod-api",
    "inputs": [{ "vars": { "service_type": "api", "url": "https://api.internal" } }]
  },
  {
    "name": "worker-prod",
    "description": "Worker fleet",
    "namespace": "prod-worker",
    "inputs": [{ "vars": { "service_type": "worker", "queue": "jobs-main" } }]
  }
]
```

### What this optimizes for

- Maximum per-service flexibility.
- Natural fit when service isolation is required (different namespaces, naming, descriptions).
- Easy mental model for users who already reason in one-policy-per-service terms.

### Costs / risks

- More policies to create/manage.
- Longer setup flow as service count grows.
- Higher chance of drift between service policies.

---

## Option 2: Global policy-level fields (single package policy per package)

### Diagram (flow + data shape)

```text
┌─────────────────────────────────────────────────────────────────┐
│ Integration setup                                               │
│  - Select services: [API] [Worker] [Frontend]                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Global package policy fields (once)                            │
│  - Package policy name                                          │
│  - Description                                                  │
│  - Namespace                                                    │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Service settings section                                       │
│  API vars + Worker vars + Frontend vars                        │
│  (all nested inside one package policy)                        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Output                                                          │
│  packagePolicy[package] -> one name/description/namespace      │
│                           + all selected service vars          │
└─────────────────────────────────────────────────────────────────┘
```

### Mockup (form-level)

```text
Create integration policy
========================================================
Policy name:        services-prod
Description:        Production services policy
Namespace:          prod

Selected services: [API] [Worker]

[Service settings]
  API
    Service URL:        https://api.internal
    Enable traces:      true

  Worker
    Queue name:         jobs-main
    Poll interval (s):  15

[Create 1 package policy]
```

### Example payload sketch

```json
{
  "name": "services-prod",
  "description": "Production services policy",
  "namespace": "prod",
  "inputs": [
    { "vars": { "service_type": "api", "url": "https://api.internal" } },
    { "vars": { "service_type": "worker", "queue": "jobs-main" } }
  ]
}
```

### What this optimizes for

- Simpler and faster onboarding flow.
- Fewer package policies to manage over time.
- Strong consistency for shared metadata (`name`, `description`, `namespace`).

### Costs / risks

- Reduced per-service policy-level customization.
- Harder to isolate lifecycle changes for one service.
- Can become crowded when many services are selected.

---

## Side-by-side tradeoff summary

| Dimension | Option 1: Service-specific fields | Option 2: Global fields |
|---|---|---|
| Policy count | One per service (usually) | One per package |
| Per-service customization | High | Medium (vars only) |
| Setup complexity | Higher | Lower |
| Ongoing management | More objects | Fewer objects |
| Consistency across services | Easier to drift | Inherently consistent |
| Best fit | Heterogeneous service requirements | Shared environment defaults |

## Open decision questions

1. Is per-service `namespace` a hard requirement for expected users?
2. Do users commonly edit one service without touching others?
3. Is policy object count currently a pain point in Fleet for this use case?
4. Should we allow a hybrid mode later (global defaults + per-service override)?
