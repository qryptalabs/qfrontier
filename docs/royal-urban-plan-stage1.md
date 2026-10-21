# Corona del Alba: urban access plan — 20 October 2026

The port town now shares one surveyed street plan with its rendered paving,
ground, collision floors, pedestrian routes and local shop freight route.
The castle retains its structure and scale. No save migration or import is used.

## What changed

- Replaced the steep, short bridge wedges with two 10 m wide approaches over
  500 m long. Carriage road grades remain at or below 8%.
- The seven-arch crossing has a 12 m wide deck and level landing squares.
  Lowering the solid spandrel preserves the actual arch openings and ship clearance.
- Added upper neighborhoods behind the bridge with their own connected street.
- Rebuilt 43 town buildings with distinct homes, markets, workshops and larger
  warehouses. Doors remain 2.2 m high; occupied floors are 2.8–3.1 m high.
  Buildings have paved frontage connections, supported foundations and collision
  footprints that include their awnings.
- Added a graded palace avenue and a separate pedestrian promenade to the
  original processional stairs. A real service portal cuts both the visible palace
  shell and its collision walls. Freight unloads at the service gate; the narrow
  garden lane is pedestrian access.
- Local shop freight crosses the real bridge using the new approaches. Existing
  service and reward conservation rules remain in force.
- Added visit controls: Plaza del puente, Barrio alto, Plaza de acceso real,
  Avenida del castillo and Recorrer acceso al castillo. Visits do not move the
  saved player.

## Verification

- TypeScript check and production build passed.
- 100 regression tests passed, including street intersection elevations, grade,
  both-direction pedestrian access, local cart clearance, supported foundations,
  visible gate headroom, full Tripo ship envelopes, commerce conservation,
  loading/unloading and reload/replay checks.
- Live browser inspection passed: the automatic visit reached the interior court
  from the bridge square, switching first/third person during the same walk.
  The 390 × 844 viewport showed the larger upper-burg frontage, joystick and
  held advance control; document width remained exactly 390 px.
- Strict before/after backup comparison passed in
  `exact-exploration-release-preservation` mode. All six profiles, 31 jobs and
  390 receipts retain the original state hash
  `6cad26130e56e1c418ec616e00b19bdebea86d0cae37a140cc7afb0a733e0057`.
- The modified cart collision test covers the authored urban district. It does
  not certify every remote regional road outside that district.
- Private release: `2026-10-20T14-52-07-941Z-d0616ec0`.
- Build SHA-256: `3898713bca9f0b222188dd2ccbc804576ee64d783058cf35c1c97cbf42cf8380`.
- Host: `https://qfrontier.example.invalid/mundo/reino`.
- Existing Tunnel and Access configuration retained. The Workers test deployment
  is unchanged. Local compatibility remains 2026-05-22; this does not qualify the
  source's 2026-10-14 production compatibility date.

Browser and save-audit evidence lives in `work/royal-urban-plan-20261020/`.
Mobile browser resizing verifies layout and controls, not physical handset GPU performance.
The existing large-chunk build warning remains; no new capacity or FPS claim is made.
