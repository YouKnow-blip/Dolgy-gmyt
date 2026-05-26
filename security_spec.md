# Security Specification (TDD) — Multi-User Task Plan Board

This specification outlines the data invariants, threat model, and validation rules to protect user workspaces from unauthorized access or malicious injection.

## 1. Data Invariants

- **Ownership Isolation**: A user can only access, create, or modify documents inside their own `users/{userId}/` subcollections. They cannot read or modify another user's workspace under any circumstances.
- **Id Integrity**: Document IDs must be alphanumeric strings (`isValidId`) under 128 characters to protect against path traversal and buffer overrun.
- **Timestamp Integrity**: All updates must set `updatedAt = request.time`, and document creation must set `createdAt = request.time`. Client-side injection of historic or future times is blocked.
- **Type Safety**:
  - Tasks: Title is a string (<= 200 chars). Status must be `'pending'` or `'completed'`. Priority must be `'low'`, `'medium'`, or `'high'`. Coordinate coordinates (posX, posY) must be finite numbers.
  - Drawings: `strokesData` must be a valid JSON string structure representing vector drawn coordinate lines.
  - Settings: Theme must be `'dark'` or `'light'`.

---

## 2. The "Dirty Dozen" Threat Payloads

The following malicious payloads must be rejected by the Firestore Rules Engine with `PERMISSION_DENIED`:

### Threat Group A: Identity Theft & Path Poisoning
1. **P1 (Cross-Owner Hijack)**: User `A` tries to read or write a task under `users/B/tasks/taskId`.
2. **P2 (Owner Spoofing on Create)**: User `A` creates a task in `users/A/tasks/taskId` but sets the `userId` field to `B`.
3. **P3 (ID Buffer Overflow)**: Injecting a 50KB random string as `taskId` to cause index bloat.
4. **P4 (Special Characters Exploitation)**: Injecting path manipulation characters (e.g. `../` or `&&`) into `taskId`.

### Threat Group B: Data Integrity & Temporal Attacks
5. **P5 (Future Timestamp Hijack)**: Setting `createdAt` to a year in the future.
6. **P6 (Immutable Hijack)**: Updating a task and attempting to change the immutable `createdAt` or `id` field.
7. **P7 (Malicious Value Poisoning)**: Setting priority to `'ultra_critical'` or status to `'deleted'`.
8. **P8 (Coordinate Flooding)**: Sending coordinates as multi-megabyte strings to crash or stall client physics processes.

### Threat Group C: Structural & Action Bypass
9. **P9 (Whitelisted Field Bypass)**: During a task update, trying to inject an unwhitelisted field (e.g., `isAdmin: true` or `proVersion: true`).
10. **P10 (Unauthenticated Access)**: An unauthenticated guest trying to read or write user workspace data.
11. **P11 (Drawing Script Injection)**: Injecting script tags or cross-site scripting strings inside `strokesData` drawing logs to compromise other sessions.
12. **P12 (Quota Drain)**: Flooding the drawing layers with large sizes of drawing vectors in a single request (strokes size checked to be reasonable).

---

## 3. Test Verification Rules Blueprint

A conceptual automated test runner `firestore.rules.test.ts` checking these invariants:

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('Firestore Security Rules', () => {
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'tensile-airway-1h7sp',
      firestore: {
        host: 'localhost',
        port: 8080,
      },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('rejects unauthenticated user accessing any user workspace', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.doc('users/alice/tasks/task1').get());
  });

  it('rejects cross-owner write (Alice trying to write to Bob\'s tasks)', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertFails(db.doc('users/bob/tasks/task1').set({
      id: 'task1',
      userId: 'bob',
      title: 'Hack task',
      status: 'pending',
      priority: 'high',
      posX: 100,
      posY: 120,
      pinned: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it('rejects invalid fields injection', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertFails(db.doc('users/alice/tasks/task1').set({
      id: 'task1',
      userId: 'alice',
      title: 'Valid task',
      status: 'pending',
      priority: 'high',
      posX: 100,
      posY: 120,
      pinned: false,
      hackerField: 'shouldNotExist',
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });
});
```
