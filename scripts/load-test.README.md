# Local scalability baseline

This harness uses synthetic accounts and a fresh local SQLite database. It does
not contact Cloudflare, change the live realm, authenticate through Access, or
certify a concurrent-user capacity. Run from the project directory with Node 24.

```powershell
node --experimental-strip-types --test tests/load-testing.test.ts
node --experimental-strip-types scripts/load-test.mjs --users 100 --seconds 60 --out work/scalability-load-baseline.json
node --experimental-strip-types scripts/load-test.mjs --users 100 --seconds 60 --adapter scripts/load-test-partitioned.mjs --out work/scalability-load-partitioned.json
```

The immutable source defaults to
`../qa-baselines/scalability-source`. `--baseline-metadata` defaults to
`scripts/load-test-baseline.json`; the runner verifies every baseline `lib/` hash
before importing its engine. That metadata file is input only. Results use a
different filename. The private working metadata `work/scalability-baseline.json`
is never overwritten. To use a checkout whose original library files still match
the frozen manifest, pass `--source .`; no copied QA directory is then needed.
Never overwrite the original baseline result when adding
instrumentation or changing an adapter.
An existing output file is rejected before setup; choose a fresh `--out` for each
run. The final write also uses exclusive creation to protect earlier results.

The storage-v1 final source, runner, schemas and synthetic reports are separately
frozen outside the project. Its manifest is
`work/scalability-v1-final-freeze.json`; prior report files remain unchanged.
After an engine change, use explicit candidate mode and a new output filename:

```powershell
node --experimental-strip-types scripts/load-test.mjs --source . --engine-mode candidate --engine-label player-versions-v2 --adapter scripts/load-test-partitioned.mjs --player-reads true --assert-granular true --users 100 --seconds 60 --out work/scalability-load-player-v2.json
node scripts/load-test-compare.mjs work/scalability-load-baseline.json work/scalability-load-player-v2.json work/scalability-load-player-v2-comparison.json --allow-engine-change true
node --experimental-strip-types scripts/load-test.mjs --source . --engine-mode candidate --engine-label village-writes-v3 --adapter scripts/load-test-partitioned.mjs --player-reads true --village-writes true --assert-granular true --users 100 --seconds 60 --out work/scalability-load-village-v3.json
```

Candidate mode keeps the original reference hashes and records changed, missing
and added library files, the actual engine hash, and an unpublished label. It does
not bless the checkout as the original release. Without the explicit comparison
flag, different engine hashes are rejected. Identical workload settings remain
mandatory. Engine changes may legitimately change initial serialized state size;
that difference is recorded, rather than passed off as a layout-only comparison.

## Scenario

1. Sequential legal setup, outside the measurement window: 100 unique owners and
   profiles, 100 explicit habitable characters, 20 explicitly built sheds using
   their original bound tutorial materials. No fixture setters or grants are used.
   These are starter villages, not 100 mature six-building settlements. This first
   scenario does not exercise active managers, resident/carrier chains, alliances
   or combat; those need separately labeled scenarios before wider capacity claims.
2. A simultaneous burst of one GET from each of the 100 clients, at a fixed engine
   time. It measures an intentionally adverse read burst, not steady traffic.
3. A 60-second mixed segment: 20 roaming clients poll at 3.5 seconds, 80 other clients
   at 12 seconds. Clients think 8–16 seconds after an action and review quotes before
   confirming. Roles walk, survey/travel, follow the first-trade guide, farm or
   craft using real inputs. Each actor has at most one outstanding HTTP request.
   The generator is **closed loop**: slow responses lower achieved throughput;
   it does not maintain an open-loop advertised request rate. Review defaults to
   750–1500 ms. Failed domain commands remain visible in the error counts.
4. Separate correctness races, not throughput measurements: concurrent identical
   confirmation, a deliberately lost acknowledgement after commit, two
   cancellations competing for a finite extraction reservation, and two sales
   competing for one genuine transferable plank. This phase explicitly advances
   the engine clock to existing deadlines instead of waiting for recipes.
   `--assert-granular true` adds two separately quoted, independent players whose
   concurrent confirmations must both succeed, debit once and replay exactly.
   It is a correctness assertion outside the mixed measurement, not extra traffic
   in the shared scenario. The original engine is expected to fail this optional
   assertion because it authorizes quotes with a global revision.
5. Independent final reconciliation: real inputs/outputs/cancellation refunds,
   NPC credits, finite deposits/reservations, receipts, farm quotas and binding.

`--seconds` is limited to 60 per segment. `--clock-rate` defaults to 1 for the mixed
segment; setup/burst/races use an explicitly supplied engine timestamp. A seeded
PRNG controls traffic choices and offsets only. UUIDs and world security
randomness remain cryptographically generated. Outcomes can vary with scheduling;
the scenario is reproducible, not a promise of byte-identical worlds.

Other useful arguments: `--source`, `--users`, `--now`, `--seed`,
`--io-latency-ms`, `--review-ms`, `--request-timeout-ms`, `--database`,
`--profile-every`, `--build-every`. A database must be empty: existing realms are
rejected and are never cleared. The default in-memory database disappears when
the process exits. If setup cannot create the population under the 2,000,000-byte
guard, the failure is reported; the runner never raises that guard. A reduced
habitable-profile scenario must be labeled separately rather than presented as
the original population.

## Stores and comparability

`load-test-support.mjs` models the legacy one-row JSON/revision/CAS store using
real SQLite. A `setImmediate` before each SQL operation permits competing readers
to observe the same revision. It does not serialize application requests behind
a lock. Writes fail before mutation if the UTF-8 state exceeds 2,000,000 bytes.
This is a local state-TEXT guard, not a complete emulation of every hosted D1 limit.

`load-test-partitioned.mjs` uses the real experimental adapter and the SQL binding
from `tests/support/d1-sqlite.ts`, with both schemas and trace retention disabled.
It uses the same application-operation asynchronous boundary and optional
synthetic latency as legacy. Each HTTP request gets its own adapter instance;
sharing its `observed` revision cache across requests would invalidate the test.
Batch transactions and SQL limits execute through the shim. The initial layout
comparison used the same immutable engine. Candidate comparisons explicitly name
their different engine. Adapter modules and SQL hashes are included in every new
report. `--player-reads true` loads the additive player-read-model schema and opts
the adapter into player reads and entity version metadata. Capability-preserving
Proxies forward optional store methods and CAS commit context. Global reads,
scoped player reads and view projections are counted separately.

`--village-writes true` additionally loads `db/village-writes.sql` and enables
the per-village commit capability. It does not turn cold operation reads into
bounded reads: commands and quotes still reconstruct the world in this phase.
The bridge preserves `compareAndSwapVillage(record, world, context)`, records
its non-null authoritative result in the receipt journal, and separates
`villageCas` calls, commits and conflicts from legacy global `cas` operations.
The comparison exposes both categories and combined write totals. A capability
flag alone is not evidence that the new method processed measured operations.
The benchmark retains a 40-statement batch budget. Larger fixture-only budgets
used by regression imports are reported separately and do not qualify this run.
Server endpoint groups also count completed SQL calls/batches and statements
per HTTP request, including projection and retries. Their maximum per request
is separate from maximum batch size. Failed transactional calls are excluded
from this attribution hook; hosted plan quotas are not enforced by the harness.

A custom adapter exports:

```js
async function createLoadStore({databasePath, rowLimitBytes, ioLatencyMs, context, playerReads, villageWrites}) {
  return {store, snapshot, close, metrics, adapterInfo, resetMetrics, storageShape};
}
```

Only `store` (`read/insert/compareAndSwap`), `snapshot` and `close` are required.
Optional `capabilities`, `readPlayerView` and `projectPlayerView` are forwarded
without stripping them. The request handler passes the authorization returned by
`validateMvpQuote` into `executeMvp`; no extra client-body capability is invented.
`context` is an `AsyncLocalStorage` containing the synthetic HTTP request context,
not an application capability or client-controlled manager context.

In per-village mode, the fast-forwarded correctness phase polls the racer, then
recomputes the authoritative set of overdue job owners and polls their real
remaining closure until no accepted job is overdue. Exceptional shared-lease
maintenance can already settle that closure during the first read. The verifier
fails at its explicit safety bound rather than silently dropping work. Owner
polls, unique owners, settlement passes and completed race checks are reported.
These polls are outside the unchanged 60-second mixed measurement; they do not
reduce the 100-client burst or mixed traffic.

## Reading results honestly

- p50/p95/p99 use nearest-rank samples. Version 2 also separates latency by HTTP
  status, retains transport error codes, and labels censored timeouts. A rejected
  command is not a successful operation. Global quote-revision conflicts remain
  errors even if the new layout completes more HTTP requests.
- Client timings include local HTTP queuing and parsing. Server timings exclude
  time before a request handler starts. Both run in the same process and share an
  event loop; remote client behavior is not reproduced. Process CPU therefore
  includes the generator, engine, JSON/GC, SQLite and instrumentation.
  The harness defaults to a 30-second request timeout to observe slow responses;
  the application currently uses shorter 8-second GET and 12-second mutation
  deadlines. A successful slow benchmark response is therefore not a passing
  application latency result, and the shared-process client is not a browser.
- SQL execution milliseconds are local SQL timing, not D1 latency. Summed store
  wall times overlap under concurrency and must not be added to elapsed time or
  described as CPU. Database operations, CAS conflicts and extra engine reads
  are counted separately.
- Body bytes are exact UTF-8 JSON sizes, excluding headers/TLS/compression.
  Server bytes mean generated bodies; client bytes mean received bodies. A
  deliberately dropped acknowledgement generates a body that was not received.
- Version 2 samples RSS/heap/external memory at phase start/end and every 10 seconds.
  These are sampled maxima, not guaranteed absolute peaks. The original baseline
  (formatVersion 1) did **not** measure memory, status-specific latency or client
  request bytes; its zero client request-byte field means unmeasured, not no POSTs.
- Completion lag is first client observation minus the job's authoritative
  deadline. A null summary means no completion was observed during that segment,
  not instantaneous completion. Fast-forwarded correctness races are excluded.
- The first 100-account baseline is preserved at
  `work/scalability-load-baseline.json`, SHA256
  `64c58cc8d7ca0e77cbd647389bba8f502329a38dd1dd458b74965977ff8f7855`.
  It exposed severe quote contention and event-loop delays; it is not a passing
  capacity test. Synthetic data and assertions passing do not establish 100, 500,
  3,000 or 2 million hosted concurrent users.

Reports contain aggregate metrics and synthetic labels only. Request bodies,
tokens, world security seeds and full inventories are kept out of logs/reports.
Failed runner assertions additionally record their phase, HTTP endpoint without
query parameters, active server-handler count and local stack. A timeout during
the post-load HTTP races is distinguished from a failed economic reconciliation;
it never turns an incomplete integrity run into a pass. This instrumentation does
not change traffic, the request timeout or retries.

The 60-second cleanup cutoff and its outstanding-handler count remain recorded.
After closing HTTP connections, the runner also awaits the actual asynchronous
handler promises before closing SQLite; abandoned client sockets do not imply
that server-side writes have finished. Additional unmeasured cleanup time, the
post-close handler count and final handler count are reported separately. If a
timed phase or race aborted, an optional post-drain economic reconciliation is
supplementary only: the main `integrity` remains incomplete and the benchmark
remains failed. Job, event and ledger IDs must be unique; legacy counters must
remain nonnegative, without assuming that namespace IDs consume a global counter.
