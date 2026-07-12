# Phase 3–6 Implementation Roadmap

**Status:** Phases 1–2 complete and committed; Phases 3–6 remaining.  
**Branch:** fix/goal-system-functional-closure (2 commits from baseline 6b4bf1d)  
**Current HEAD:** 8576b84

---

## Phase 3: Transactional Goal Update Foundation

### Scope
- New repository method: `replaceClientGoals(ctx, clientIndexId, desiredGoals)`
- New server action: `updateClientGoalsAction(clientIndexId, goals)`  
- All local (no ERP mutation); atomic transaction; archive semantics; strict validation

### Key Implementation Details

**Repository method signature:**
```
Promise<{ erpCustomerId: string }>
```

**Critical behaviors:**
1. Assert tenant context (fail-closed)
2. Load client_index; verify ownership
3. Strict validation (no silent sanitize for confirmed payloads):
   - Unknown goalId → reject
   - Duplicate goalId → reject
   - Unknown sub-goal → reject
   - Wrong goal/layer sub-goal → reject
   - Missing trainerNotes property → reject
4. Hard-conflict detection → hard-reject
5. Corrected primary invariant: zero allowed; exactly one when nonempty
6. Reconcile rows:
   - Existing active goal → UPDATE in place (preserve createdAtUtc)
   - New goal → INSERT
   - Archived goal re-submitted → reactivate
   - Goal absent from desired set → archive
7. Recompute safety per-goal server-side
8. Update client_index.primaryGoalId/Label atomically
9. Write audit event (client.goals_updated)
10. Final invariant assertion before commit

**Note semantics (Decision D8):**
- Non-empty string → trim and store
- Blank/whitespace or null → clear to null
- Omitted property → invalid, reject whole request

**Server action pattern:**
- resolveTrainerId() → getTenantContext() → repo.replaceClientGoals() → revalidatePath using returned erpCustomerId (Decision D9)
- No ERP call
- Return typed ActionResult

**Tests required:**
- Add/update/archive/reactivate flows
- All 6 sub-goal + note + urgency combinations
- Zero-goal state (valid, index fields null)
- Hard conflict → zero writes
- Malformed goal/sub-goal → zero writes
- Cross-tenant rejection
- createdAtUtc/updatedAtUtc contract
- Fresh read after each mutation

---

## Phase 4: Client Hub Goal Editor

**Scope:** Reuse existing GoalWorkspace components in a mobile-first sheet.

**Key points:**
- Load existing active goals via listGoals(ctx, clientIndexId) with status='active' filter
- Seed workspaceReducer with existing state
- Edit, then submit complete desired set via updateClientGoalsAction
- Confirmed-first: await action before showing success
- No optimistic success; keep sheet open on error
- Add "Edit goals" entry to Hub goal card

---

## Phase 5: Integrity & Canonicalization

**Optional partial unique indexes** (gated on 6 §19A prerequisites):
- Duplicate scan of active rows
- Conflict report + repair plan  
- Backup confirmation
- Isolated DB verification
- Partial-index support check  
- Migration + rollback docs

If approved, indexes are:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS client_goal_active_uniqueness
  ON client_goal (tenant_id, client_index_id, goal_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS client_goal_active_primary
  ON client_goal (tenant_id, client_index_id)
  WHERE status = 'active' AND is_primary = 1;
```

**Canonicalization:**
- AI parse: derive allowed goals from lib/goals/taxonomy
- Grep for orphaned GoalSelect.tsx / GoalMultiSelect.tsx; delete if unused  
- Shared primary-invariant assertion helper
- Remove functionally divergent NEXT_PUBLIC_GOAL_WORKSPACE branches
- Verify flag no longer affects persistence/read/edit (Decision D4)

---

## Phase 6: Verification & Candidate Freeze

**Test suite:**
- Targeted: repository + action tests  
- Full suite: npm run test
- Lint: npx next lint  
- Build: npm run build (read-only)

**Acceptance matrix (13 rows):**
- Create zero/one/three goals; reload renders all
- Update primary/urgency/sub-goals/notes independently  
- Archive/reactivate flows
- Hard conflict rejection
- Safety flags display
- ERP fallback not triggered when local history exists

**Honest verdict:**
- `PASS — IMPLEMENTATION COMPLETE, READY FOR PRODUCT-OWNER QA`
- or  
- `FAIL — CLOSURE BLOCKED` (with reason)

Do not claim production freeze until product-owner approves.

---

## Deployment Gates (Post-Phase 6, not part of Phase 6)

1. Product-owner review of freeze report
2. Merge feature branch to main
3. Tagged release
4. VPS deployment via Dokploy
5. Production smoke test

---

## Summary

**Phases 1–2:** COMPLETE (205/205 tests green; Defects B1, B3, B4 fixed)  
**Phases 3–6:** Use this roadmap; each phase has explicit acceptance criteria.

**Blocking:** Modernization remains blocked until Phase 6 PASS + freeze report approved.
