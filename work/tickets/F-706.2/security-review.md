## Attempt 1 — 2026-11-22

### Security audit findings
- **Table RLS & Force**: `ai_spend_ops` has `enable row level security` and `force row level security`.
- **Policy isolation**: Policies `ai_spend_read`, `ai_spend_reserve`, `ai_spend_settle` require `tudo.maintenance = 'ai-spend'`. `withUser` and `withMaintenance` explicitly clear or restrict this GUC.
- **No Delete policy**: `ai_spend_ops` has no DELETE policy, ensuring spend audit records cannot be deleted through the app.
- **Injection & Tampering**: All queries use parameterized inputs (`$1, $2, ...`). The `state` transitions are strictly enforced via CHECK constraint and RLS policy (`reserved -> charged | released`).
- **Data privacy & scoping**: `ai_spend_ops` contains no user identifying information (no `user_id`, no prompt text, no response data). Only aggregation metrics (`period`, `provider`, `model`, `kind`, `estimate_micro_usd`, `state`).
- **Advisory lock**: Concurrency control uses a dedicated 64-bit transaction-scoped advisory lock `hashtextextended('ai-spend', 0)` within `withSpendMeter` during reservations, preventing race conditions or bypassing the $20 spend cap.
- **Fail-closed**: Unpriced models, prototype pollution keys (`constructor`, `__proto__`), or lock timeouts fail closed without touching the provider or modifying balances.

Verdict: **PASS** (no 🔴 blockers).
