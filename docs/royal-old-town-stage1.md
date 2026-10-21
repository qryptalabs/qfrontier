# Barrio de la Ribera — 20 October 2026

First authored medieval quarter on the east side of Corona del Alba's port.
The castle, bridge, canal, fleet, existing supply shop and saved plots retain
their approved scale and purpose. The remainder of the town keeps its previous plan.

## Implemented

- 24 quarter buildings: 21 homes and shopfronts plus three new walkable premises.
  Paired facades, varied heights, tiled roofs, timber framing and wider paved
  frontages replace the former sparse square plots in this part of the port.
- A winding market street, craft lane, four short alleys, quay passage and
  small market square share their coordinates with terrain and navigation.
- La Vela Azul tavern has an open door, furnished common room, bar, fireplace,
  ceiling beams, hanging lamps, seated patrons and host facing the customers.
- The smithy has a physical forge, anvil, workbench, tool rack, smith with a
  hammer and positional hammer audio. The warehouse has shelves, reception,
  clear cargo aisles and an attendant. Signs and suspended door markers identify
  all three venues. Normal walking retains their ceilings.
- Existing supply-shop purchases and pickup remain the real commerce interface.
  The three new premises are exploration and ambient work scenes; they do not
  mint resources, sell new goods or implement lodging/repair transactions.
- Twelve walking residents use closed street routes; eight additional hosts,
  patrons and stallkeepers populate the quarter. Empty-handed residents have
  relaxed arms. Visible bodies block player motion; carts cannot enter the narrow
  alleys or premises. Existing freight keeps its validated wide road.
- Reino has a Casco medieval camera and individual visit buttons. The same
  authored quarter mounts on the planet through the shared world layer.
- Shared geometry/material batches and the existing single renderer are retained.
  No Tripo credits or external generation were needed for this modular quarter.

## Validation and limits

- TypeScript and release build passed.
- 104 selected regression tests passed after the final street/house layout.
  Four targeted interior tests were repeated after the ceiling/host finish.
  Checks cover both-direction alley walking, actual open mesh doors, solid
  furniture/walls, supported houses, street clearances, bridge passage, ship
  envelopes, trade conservation, delivery replay and current castle travel.
- Live browser inspection covered the overview, first/third person and manual
  entry into all three premises at 390 × 844. Joystick and held advance remained
  accessible with document width 390 px. Responsive resizing is not a physical
  phone or handset GPU benchmark. No new FPS or concurrent-player claim is made.
- Strict before/after preservation passed: six profiles, 31 jobs and 390 receipts,
  unchanged state hash
  `6cad26130e56e1c418ec616e00b19bdebea86d0cae37a140cc7afb0a733e0057`.
  All visits were previews; no character save movement, purchase or resource
  consumption was used for the visual review.
- Private host: `https://qfrontier.example.invalid/mundo/reino`.
  Access/Tunnel retained; original Workers test deployment unchanged. Local
  compatibility remains 2026-05-22, not a qualification of the source's newer date.
- Runtime manifest, build/test logs, screenshots and exact save audit:
  `work/royal-old-town-20261020/`. The pre-existing large bundle warning remains.

Final active release: `2026-10-20T18-06-27-394Z-7c9a6813`.
Build SHA-256: `e240aaf5c0eb93d90984b777f8bb8125b4fe48b8a81e469466935882c9d994d3`.
