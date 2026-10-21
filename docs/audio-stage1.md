# Audio: first playable layer

Activated on the private PC server on 2026-10-19. No schema change, import, reseed, game economy mutation, or deployment to the original Workers domain.

- `lib/audio/engine.ts`: one shared Web Audio mixer, explicitly unlocked by a user gesture. Music is a streamed, stereo MP3; effects are decoded on demand. Preferences use only `qfrontier.audio.v1` in browser storage.
- `lib/audio/model.ts`: pure distance/pan/room attenuation, emitter selection and distance-driven footsteps. Teleports and long interruptions reset the stride rather than playing a burst of steps.
- `lib/audio/world-sounds.ts`: public worker, tutorial and fishing schedules. Sounds do not settle work, change cargo or grant XP. Stationary carts have no hoof sounds; tools stop at the end of real work.
- `app/game-audio.tsx`: master/music/ambience/effects/interface settings, mute and a test cue; a silent initial notification baseline. Controls remain available in the fullscreen district and royal city.
- Station, continuous atlas/district and royal city submit frames to the mixer. Only the highest-priority recently updated visible scene is audible. Hidden documents suspend audio; BroadcastChannel prevents two game tabs owning playback simultaneously.
- Initial budgets: six nearby activity emitters on coarse-pointer devices, ten on desktop; sixteen concurrent sample voices, 24 MB of decoded file buffers, one streamed music element. Audio-frame projection is throttled to about 10 Hz. These limits are starting budgets, not a claim of measured performance on every mobile device.
- Indoor sound uses a low-pass filter, room impulse and dampened exterior sources. This is a lightweight approximation, not geometric acoustic ray tracing.

The initial pack has 27 MP3 files, about 3.15 MB total. Provenance, hashes and source links are in `public/audio/v1/manifest.json` and `credits.txt`. `scripts/prepare-audio-assets.mjs` regenerates the compressed pack from the retained, verified CC0 sources under `work/audio-stage1/sources`; it expects the existing local FFmpeg executable used for the trailers. The hoof effect is adapted wood foley; wind, saw friction and interface/level cues are procedural.

The first pass includes one medieval music track, five footstep surfaces, water/wind/forest ambience, extraction/crafting/harvest/construction/crates, cart hoof/wheel foley, port splashes, completion/level/interface cues and the port trade confirmation. Dedicated scores for individual biomes, NPC dialogue, detailed crowd voices, unique animal vocalizations and full wall-by-wall sound occlusion remain later audio work.

While checking footsteps, a pre-existing royal-visit bug was fixed: returning to a visible visitor camera now restores walking, while pending/in-flight saved-character operations remain frozen. No saved position is changed by visitor-camera movement.

Verification: full existing suite (1,220 tests at that checkpoint), final focused audio/royal suite (25 tests), TypeScript, build, changed-file lint; browser playback (music `readyState=4`, advancing time, no media error), mute/persistence, responsive 390×844 and desktop layouts, real stone/carpet step requests while walking in visitor mode, and fullscreen controls. A physical mobile-device audio/performance check is still pending. Save hashes before/after activation match: four profiles, 28 jobs and 381 receipts. Evidence and preservation summaries: `work/audio-stage1/`.
