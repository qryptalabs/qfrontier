# Catálogo completo de módulos y archivos

Generado con `node scripts/catalog-modules.mjs`. Describe las carpetas reales de la alfa, no el árbol de producción propuesto. No enumera dependencias instaladas, builds ni estado privado.

## app (79 archivos)

Rutas web, API autenticada, componentes de funciones, paneles y estilos.

- [app/[...path]/page.tsx](../../app/[...path]/page.tsx) — `dynamic`
- [app/activity-hub.tsx](../../app/activity-hub.tsx) — `ExperienceBar`, `ActivityBell`, `ActivityAlerts`
- [app/api/city-shop/route.ts](../../app/api/city-shop/route.ts) — `dynamic`, `GET`, `POST`
- [app/api/mvp/quote/route.ts](../../app/api/mvp/quote/route.ts) — `dynamic`, `POST`
- [app/api/mvp/route.ts](../../app/api/mvp/route.ts) — `dynamic`, `GET`, `POST`
- [app/api/royal-harbor/route.ts](../../app/api/royal-harbor/route.ts) — `dynamic`, `GET`, `POST`
- [app/api/royal-kingdom/route.ts](../../app/api/royal-kingdom/route.ts) — `dynamic`, `GET`, `POST`
- [app/chatgpt-auth.ts](../../app/chatgpt-auth.ts) — `ChatGPTUser`, `getChatGPTUser`, `requireChatGPTUser`, `chatGPTSignInPath`, `chatGPTSignOutPath`
- [app/civil-works.css](../../app/civil-works.css)
- [app/civil-works.tsx](../../app/civil-works.tsx) — `CivilWorks`, `CivilDemolition`, `CivilMaintenance`
- [app/construction-materials.tsx](../../app/construction-materials.tsx) — `ConstructionMaterialsProps`
- [app/ensayos/viajes/page.tsx](../../app/ensayos/viajes/page.tsx)
- [app/ensayos/viajes/travel-physics-lab.tsx](../../app/ensayos/viajes/travel-physics-lab.tsx) — `TravelLabPreset`, `TravelLabMemory`, `createTravelLabMemory`, `applyTravelLabManual`, `travelLabPosition`
- [app/error.tsx](../../app/error.tsx)
- [app/exploration-panel.tsx](../../app/exploration-panel.tsx) — `ExplorationPanelProps`
- [app/exploration.css](../../app/exploration.css)
- [app/first-trade-panel.tsx](../../app/first-trade-panel.tsx)
- [app/game-audio.css](../../app/game-audio.css)
- [app/game-audio.tsx](../../app/game-audio.tsx) — `GameAudio`, `useAudioActivity`
- [app/game-availability.css](../../app/game-availability.css)
- [app/game-availability.tsx](../../app/game-availability.tsx)
- [app/game-page.tsx](../../app/game-page.tsx) — `GameSearchParams`, `renderGamePage`
- [app/graphics/city-shop-mobile-controls.css](../../app/graphics/city-shop-mobile-controls.css)
- [app/graphics/city-shop-panel.tsx](../../app/graphics/city-shop-panel.tsx) — `CityShopPanel`
- [app/graphics/city-shop.css](../../app/graphics/city-shop.css)
- [app/graphics/fishing-community.css](../../app/graphics/fishing-community.css)
- [app/graphics/frontier-world.tsx](../../app/graphics/frontier-world.tsx)
- [app/graphics/game-icons.tsx](../../app/graphics/game-icons.tsx)
- [app/graphics/graphics.css](../../app/graphics/graphics.css)
- [app/graphics/habitable-scene.css](../../app/graphics/habitable-scene.css)
- [app/graphics/habitable-scene.tsx](../../app/graphics/habitable-scene.tsx) — `HabitableSceneProps`, `HabitableScene`
- [app/graphics/item-art.tsx](../../app/graphics/item-art.tsx)
- [app/graphics/living-zone.css](../../app/graphics/living-zone.css)
- [app/graphics/premium.css](../../app/graphics/premium.css)
- [app/graphics/royal-harbor.css](../../app/graphics/royal-harbor.css)
- [app/graphics/royal-harbor.tsx](../../app/graphics/royal-harbor.tsx)
- [app/graphics/royal-kingdom-panel.tsx](../../app/graphics/royal-kingdom-panel.tsx) — `RoyalKingdomPanel`
- [app/graphics/shop-handling-status.tsx](../../app/graphics/shop-handling-status.tsx) — `ShopHandlingStatus`
- [app/graphics/shop-production-status.tsx](../../app/graphics/shop-production-status.tsx) — `ShopProductionStatus`
- [app/graphics/starter-protection.tsx](../../app/graphics/starter-protection.tsx)
- [app/graphics/tavern-supply-panel.css](../../app/graphics/tavern-supply-panel.css)
- [app/graphics/tavern-supply-panel.tsx](../../app/graphics/tavern-supply-panel.tsx) — `TavernSupplyPanel`
- [app/graphics/use-royal-kingdom.ts](../../app/graphics/use-royal-kingdom.ts) — `useRoyalKingdom`
- [app/graphics/use-viewer-lifecycle.ts](../../app/graphics/use-viewer-lifecycle.ts) — `useViewerVisibility`, `useEffectiveGraphicsQuality`
- [app/habitable-access.tsx](../../app/habitable-access.tsx) — `findHabitableAccessSidePoint`
- [app/habitable-client.tsx](../../app/habitable-client.tsx) — `HabitableClientProps`, `HabitablePanel`
- [app/habitable-commerce.css](../../app/habitable-commerce.css)
- [app/habitable-commerce.tsx](../../app/habitable-commerce.tsx)
- [app/habitable-daily.css](../../app/habitable-daily.css)
- [app/habitable-daily.tsx](../../app/habitable-daily.tsx) — `HabitableFoodStatus`
- [app/habitable-facilities.css](../../app/habitable-facilities.css)
- [app/habitable-facilities.tsx](../../app/habitable-facilities.tsx) — `HabitableFacilitiesProps`
- [app/habitable-industry.css](../../app/habitable-industry.css)
- [app/habitable-industry.tsx](../../app/habitable-industry.tsx)
- [app/habitable-network.css](../../app/habitable-network.css)
- [app/habitable-network.tsx](../../app/habitable-network.tsx) — `ConstructionProgress`
- [app/habitable-placement.tsx](../../app/habitable-placement.tsx)
- [app/habitable-residents.css](../../app/habitable-residents.css)
- [app/habitable-residents.tsx](../../app/habitable-residents.tsx) — `HabitableResidentsProps`
- [app/habitable.css](../../app/habitable.css)
- [app/land-expansion.css](../../app/land-expansion.css)
- [app/land-expansion.tsx](../../app/land-expansion.tsx) — `LandPane`, `LandExpansionProps`
- [app/layout.tsx](../../app/layout.tsx) — `metadata`
- [app/level-progression.tsx](../../app/level-progression.tsx) — `LevelUnlockDialog`, `LevelCelebration`
- [app/local-time.tsx](../../app/local-time.tsx) — `useGameTimestamp`
- [app/manager-build-approval.tsx](../../app/manager-build-approval.tsx)
- [app/manager-industry.tsx](../../app/manager-industry.tsx) — `ManagerIndustryDraft`, `useManagerIndustryDraft`, `ManagerIndustryControls`, `ManagerIndustryPolicy`, `ManagerTransportPanel`
- [app/manager-operator.tsx](../../app/manager-operator.tsx) — `ManagerOperatorControls`, `ManagerOperatorPanel`
- [app/manager-policy.tsx](../../app/manager-policy.tsx) — `ManagerPolicyDraft`, `useManagerPolicyDraft`, `ManagerPolicyControls`, `ManagerPrioritySummary`, `ManagerAllocationPanel`, `ManagerWorkReservations`
- [app/mvp-client.tsx](../../app/mvp-client.tsx) — `useGameRoute`, `useGameSection`
- [app/mvp.css](../../app/mvp.css)
- [app/page.tsx](../../app/page.tsx) — `dynamic`
- [app/production-manager.css](../../app/production-manager.css)
- [app/production-manager.tsx](../../app/production-manager.tsx) — `ProductionManagerProps`, `ManagerForecastPanel`
- [app/sector-picker.tsx](../../app/sector-picker.tsx) — `SectorOption`
- [app/test-booster.css](../../app/test-booster.css)
- [app/test-booster.tsx](../../app/test-booster.tsx) — `TestBoosterProps`, `TestBooster`
- [app/use-activity-notifications.ts](../../app/use-activity-notifications.ts) — `useActivityNotifications`
- [app/use-level-notifications.ts](../../app/use-level-notifications.ts) — `useLevelNotifications`

## lib/auth (1 archivos)

Identidad firmada y control de acceso.

- [lib/auth/cloudflare-access.ts](../../lib/auth/cloudflare-access.ts) — `AccessConfiguration`, `AccessIdentity`, `AccessFailureReason`, `ACCESS_IDENTITY_HEADERS`, `hasAccessConfiguration`, `createAccessVerifier`, `verifyAccessRequest`, `injectVerifiedAccessIdentity`…

## lib/client (7 archivos)

Estado y utilidades del cliente, navegación y avisos.

- [lib/client/activity-notifications.ts](../../lib/client/activity-notifications.ts) — `ACTIVITY_NOTIFICATION_LIMIT`, `ActivityNotificationStorage`, `ActivityNotificationOptions`, `ActivityNotificationSnapshot`, `ActivityNotificationStore`, `createActivityNotificationStore`, `activityNotificationNavigation`
- [lib/client/district-controls.ts](../../lib/client/district-controls.ts) — `DistrictJoystickInput`, `DistrictManualNavigationIntent`, `DistrictManualNavigationCommand`, `DISTRICT_MANUAL_RENEW_MS`, `DistrictManualQuote`, `DistrictManualCommit`, `sendDistrictManualCommand`, `createDistrictManualNavigation`…
- [lib/client/level-notifications.ts](../../lib/client/level-notifications.ts) — `LevelNotificationStorage`, `LevelNotificationOptions`, `LevelNotificationRange`, `LevelNotificationSnapshot`, `LevelNotificationStore`, `createLevelNotificationStore`
- [lib/client/navigation.ts](../../lib/client/navigation.ts) — `GameTab`, `GameWorldLocation`, `GameNavigation`, `GameNavigationLocation`, `NavigationProfile`, `NavigationAccess`, `GAME_NAVIGATION_ROUTES`, `isGamePathname`…
- [lib/client/quick-command.ts](../../lib/client/quick-command.ts) — `isQuickHabitableCommand`
- [lib/client/royal-harbor-trade.ts](../../lib/client/royal-harbor-trade.ts) — `RoyalPendingTrade`, `royalSnapshotIsNewer`, `canRoyalTrade`, `newRoyalTrade`
- [lib/client/stock-options.ts](../../lib/client/stock-options.ts) — `usableQuantity`, `ownedItemOptions`

## lib/audio (4 archivos)

Motor WebAudio y emisores.

- [lib/audio/engine.ts](../../lib/audio/engine.ts) — `AudioSnapshot`, `FrontierAudio`, `gameAudio`
- [lib/audio/model.ts](../../lib/audio/model.ts) — `AudioChannel`, `AudioSettings`, `AUDIO_STORAGE_KEY`, `DEFAULT_AUDIO`, `audioSettings`, `AudioPoint`, `FootSurface`, `SoundKind`…
- [lib/audio/venue-dialogue.ts](../../lib/audio/venue-dialogue.ts) — `speakVenue`, `stopVenueSpeech`
- [lib/audio/world-sounds.ts](../../lib/audio/world-sounds.ts) — `tutorialSounds`, `villageSounds`, `fishingSounds`

## lib/graphics (130 archivos)

Escenas, terreno, ciudad, modelos, movimiento y colisiones.

- [lib/graphics/atlas-data.ts](../../lib/graphics/atlas-data.ts) — `ATLAS_SCALE`, `atlasWorldBounds`, `globalToAtlas`, `atlasToGlobal`, `settlementFootprint`, `settlementTile`, `settlementSceneSignature`
- [lib/graphics/biome-settlement-models.ts](../../lib/graphics/biome-settlement-models.ts) — `BiomeStructureKind`, `BiomeSettlementLibrary`, `createBiomeSettlementLibrary`
- [lib/graphics/camera-bounds.ts](../../lib/graphics/camera-bounds.ts) — `CameraBounds`, `PARCEL_CAMERA_BOUNDS`, `ATLAS_CAMERA_BOUNDS`, `clampTarget`, `parcelCameraLimits`, `atlasCameraLimits`
- [lib/graphics/cinematic.ts](../../lib/graphics/cinematic.ts) — `createCinematicPipeline`
- [lib/graphics/city-granary.ts](../../lib/graphics/city-granary.ts) — `createCityGranary`
- [lib/graphics/city-shop-driving.ts](../../lib/graphics/city-shop-driving.ts) — `shopDrivingAllowed`
- [lib/graphics/city-shop-interior.ts](../../lib/graphics/city-shop-interior.ts) — `createShopInterior`
- [lib/graphics/city-shop-layout.ts](../../lib/graphics/city-shop-layout.ts) — `ROYAL_SHOP`, `shopReservedAt`, `shopInside`, `shopYardAt`, `shopAssetPosition`, `shopAssetObstacles`, `shopNearCounter`, `shopNearPickup`…
- [lib/graphics/city-shop-model.ts](../../lib/graphics/city-shop-model.ts) — `createCityShopModel`
- [lib/graphics/city-shop-road-signs.ts](../../lib/graphics/city-shop-road-signs.ts) — `createShopRoadSigns`
- [lib/graphics/city-shop-route.ts](../../lib/graphics/city-shop-route.ts) — `shopTradeRoad`, `shopRoadNear`, `shopLocalPath`
- [lib/graphics/city-shop-sites.ts](../../lib/graphics/city-shop-sites.ts) — `ShopCity`, `SHOP_SITES`, `siteOffset`, `sitePoint`, `nearestShop`, `tradingGround`, `tradingSiteContains`
- [lib/graphics/city-shop-stable-layout.ts](../../lib/graphics/city-shop-stable-layout.ts) — `CITY_STABLE`, `stableInside`, `cityStableObstacles`
- [lib/graphics/city-shop-stable.ts](../../lib/graphics/city-shop-stable.ts) — `createCityStable`
- [lib/graphics/city-shop-transport.ts](../../lib/graphics/city-shop-transport.ts) — `SHOP_DRIVER_SEAT`, `createTransportOdometer`, `createShopTransport`
- [lib/graphics/continuous-landscape.ts](../../lib/graphics/continuous-landscape.ts) — `ContinuousLandscape`, `createContinuousLandscape`
- [lib/graphics/continuous-layout.ts](../../lib/graphics/continuous-layout.ts) — `LANDSCAPE_HALF_EXTENT`, `LANDSCAPE_BOUNDS`, `continuousGroundHeight`, `valleyRoadCenter`, `sceneryHasGround`, `isValleyTreePosition`
- [lib/graphics/district-navigation.ts](../../lib/graphics/district-navigation.ts) — `DistrictCameraMode`, `DistrictNavigationInput`, `DistrictPoint3`, `DistrictCameraObstacle`, `DISTRICT_WALK_INTERVAL`, `DISTRICT_EYE_HEIGHT`, `normalizeDistrictInput`, `districtMovement`…
- [lib/graphics/exploration-district.ts](../../lib/graphics/exploration-district.ts) — `explorationRenderGround`, `districtFloatingOrigin`, `createExplorationWorldContext`, `explorationPlayerBodies`
- [lib/graphics/exploration-infrastructure.ts](../../lib/graphics/exploration-infrastructure.ts) — `createExplorationInfrastructureChunk`
- [lib/graphics/exploration-traffic-layer.ts](../../lib/graphics/exploration-traffic-layer.ts) — `ExplorationTrafficLayerOptions`, `createExplorationTrafficLayer`
- [lib/graphics/exploration-transport.ts](../../lib/graphics/exploration-transport.ts) — `ExplorationVehicleMode`, `ExplorationVehiclePose`, `createExplorationTransportLayer`
- [lib/graphics/fishing-community-data.ts](../../lib/graphics/fishing-community-data.ts) — `FishingBoatState`, `FishingWorkerState`, `FishingCartState`, `FishingStructure`, `FishingProp`, `FishingPath`, `FishingCrew`, `FishingBoatPose`…
- [lib/graphics/fishing-community-models.ts](../../lib/graphics/fishing-community-models.ts) — `FishingStructureKind`, `FishingBoatPose`, `FishingHaulagePose`, `FishingBoat`, `FishingHaulage`, `FishingModelLibrary`, `FISHING_MODEL_DIMENSIONS`, `createHarbourSurfaceTexture`…
- [lib/graphics/fishing-community.ts](../../lib/graphics/fishing-community.ts) — `FishingActivity`, `FishingState`, `FishingRenderSnapshot`, `FishingRenderSite`, `FishingCommunityOptions`, `FishingCommunityController`, `fishingActivityState`, `fishingStateForSnapshot`…
- [lib/graphics/fishing-network-data.ts](../../lib/graphics/fishing-network-data.ts) — `FishingNetworkPlace`, `FishingCommunityDefinition`, `FishingNetworkStructure`, `FishingNetworkProp`, `FishingNetworkPath`, `FishingNetworkSnapshot`, `FISHING_COMMUNITIES`, `FISHING_NETWORK_PLACES`…
- [lib/graphics/fishing-network.ts](../../lib/graphics/fishing-network.ts) — `createFishingNetworkRenderer`
- [lib/graphics/graphics-build.ts](../../lib/graphics/graphics-build.ts) — `GraphicsBuildEnvironment`, `GraphicsBuildOptions`, `finishGraphicsBuild`, `runGraphicsBuild`, `createTerrainHeightCache`
- [lib/graphics/habitable-buildings.ts](../../lib/graphics/habitable-buildings.ts) — `habitableBuildingLevelAt`, `habitableConstructionSupplyAt`, `habitableBuildingVisualAt`, `createHabitableBuildingLibrary`, `createHabitableBuildingLayer`
- [lib/graphics/habitable-commerce.ts](../../lib/graphics/habitable-commerce.ts) — `HabitableCommerceClip`, `HabitableCommerceOptions`, `habitableCommerceRouteKey`, `habitableCommerceActive`, `createHabitableCommerceModelLibrary`, `createHabitableCommerceLayer`
- [lib/graphics/habitable-construction.ts](../../lib/graphics/habitable-construction.ts) — `habitableConstructionAt`, `createHabitableConstructionLibrary`, `createHabitableUpgradeLayer`
- [lib/graphics/habitable-district.ts](../../lib/graphics/habitable-district.ts) — `HabitablePlacement`, `HabitableLandPresentation`, `HabitableDistrict`, `HabitableDistrictOptions`, `habitablePreviewAllowed`, `createHabitableDistrict`
- [lib/graphics/habitable-house.ts](../../lib/graphics/habitable-house.ts) — `HabitableHouseVoxel`, `createHabitableHouseTemplate`
- [lib/graphics/habitable-industry.ts](../../lib/graphics/habitable-industry.ts) — `createHabitableIndustryTemplate`
- [lib/graphics/habitable-network.ts](../../lib/graphics/habitable-network.ts) — `createHabitableNetworkLayer`
- [lib/graphics/habitable-shed.ts](../../lib/graphics/habitable-shed.ts) — `createHabitableShedLevelTwo`
- [lib/graphics/habitable-worker-models.ts](../../lib/graphics/habitable-worker-models.ts) — `HabitableWorkerRole`, `HabitableWorkerActivity`, `HabitableWorkerModel`, `createHabitableWorkerModelLibrary`
- [lib/graphics/habitable-workers.ts](../../lib/graphics/habitable-workers.ts) — `habitableWorkerDailyAt`, `habitableWorkerActionAt`, `createHabitableWorkerLayer`
- [lib/graphics/inhabited-world-data.ts](../../lib/graphics/inhabited-world-data.ts) — `InhabitedSurface`, `InhabitedProfile`, `InhabitedPlace`, `InhabitedBuilding`, `InhabitedPath`, `InhabitedPathSegment`, `InhabitedResident`, `InhabitedProp`…
- [lib/graphics/inhabited-world.ts](../../lib/graphics/inhabited-world.ts) — `InhabitedWorldChunk`, `InhabitedWorldOptions`, `createInhabitedWorldChunk`
- [lib/graphics/item-atlas.ts](../../lib/graphics/item-atlas.ts) — `ItemAtlas`, `getItemAtlas`, `getAtlasIndex`
- [lib/graphics/kinematic-physics.ts](../../lib/graphics/kinematic-physics.ts) — `PhysicsPoint`, `PhysicalObstacle`, `PhysicalCapsule`, `PHYSICAL_PLAYER_RADIUS`, `pointSegmentDistance`, `segmentDistance`, `obstacleSeparation`, `obstacleAllowsEgress`…
- [lib/graphics/land-development.ts](../../lib/graphics/land-development.ts) — `landDevelopmentActive`, `createLandDevelopmentLayer`
- [lib/graphics/land-infrastructure-models.ts](../../lib/graphics/land-infrastructure-models.ts) — `createLandInfrastructureLibrary`
- [lib/graphics/land-infrastructure.ts](../../lib/graphics/land-infrastructure.ts) — `LAND_BRIDGE_PRESETS`, `LandBridgePreset`, `LandBridgeStateLike`, `LandInfrastructureLike`, `LandInfrastructureStateLike`, `landBridgePreset`, `landBridgeProgressAt`, `landBridgeDeckHeight`…
- [lib/graphics/land-terrain.ts](../../lib/graphics/land-terrain.ts) — `LAND_CELL_METERS`, `LandCellStateLike`, `LandWorkVisual`, `LandVisualLike`, `LandTerrainStateLike`, `LandCellGeometry`, `landCellGeometry`, `landCellAt`…
- [lib/graphics/landmark-model-data.ts](../../lib/graphics/landmark-model-data.ts) — `LandmarkModelBox`, `CAVE_MODEL_BOXES`, `stoneRockModelBoxes`
- [lib/graphics/living-actors.ts](../../lib/graphics/living-actors.ts) — `LivingActorRole`, `LivingActor`, `LivingCart`, `LivingActorLibrary`, `createLivingActorLibrary`, `createLivingActor`, `createLivingCart`
- [lib/graphics/living-zone-data.ts](../../lib/graphics/living-zone-data.ts) — `LivingPoint`, `LivingPlace`, `LivingPath`, `LivingBuilding`, `LivingResident`, `LIVING_ZONE`, `LIVING_PATHS`, `LIVING_BUILDINGS`…
- [lib/graphics/living-zone.ts](../../lib/graphics/living-zone.ts) — `LivingZoneChunk`, `LivingZoneOptions`, `createLivingZoneChunk`
- [lib/graphics/maritime-water.ts](../../lib/graphics/maritime-water.ts) — `maritimeTime`, `maritimeWave`, `maritimeBoatPose`, `createMaritimeWaterTexture`, `createMaritimeFoamTexture`, `MaritimeWaterOptions`, `createMaritimeWaterMotion`
- [lib/graphics/models.ts](../../lib/graphics/models.ts) — `createTree`, `createRock`, `createBuilding`, `createUnit`, `createItem`, `disposeModelResources`
- [lib/graphics/palette.ts](../../lib/graphics/palette.ts) — `VOXEL_COLORS`, `VoxelColor`
- [lib/graphics/planet-data.ts](../../lib/graphics/planet-data.ts) — `PLANET_RADIUS`, `PLANET_ANCHOR`, `UNITS_PER_DEGREE`, `GeoPoint`, `PlanetVector`, `WorldPoint`, `PlanetZoomLevel`, `PlanetNPCSettlement`…
- [lib/graphics/planet-renderer.ts](../../lib/graphics/planet-renderer.ts) — `PlanetController`, `PlanetState`, `ObservedLocation`, `PlanetCallbacks`, `createPlanetRendererAsync`, `createPlanetRenderer`
- [lib/graphics/planet-surface.ts](../../lib/graphics/planet-surface.ts) — `PlanetSurface`, `planetTextureWidth`, `createPlanetSurface`, `createPlanetSurfaceAsync`
- [lib/graphics/public-station-bounds.json](../../lib/graphics/public-station-bounds.json)
- [lib/graphics/public-station-layout.ts](../../lib/graphics/public-station-layout.ts) — `PublicStationLayoutInput`, `PublicStationPlacement`, `publicStationLayout`, `publicStationObstacles`
- [lib/graphics/renderer.ts](../../lib/graphics/renderer.ts) — `FrontierController`, `REGIONAL_UNIT_SCALE`, `createFrontierRendererAsync`, `createFrontierRenderer`
- [lib/graphics/royal-canal-layout.ts](../../lib/graphics/royal-canal-layout.ts) — `ROYAL_GRAND_BRIDGE`, `royalRiver`, `royalChannelWaterY`, `royalBridgeDeck`, `royalAvenueDeck`, `royalBridgeClearance`, `ROYAL_SEA_ROUTE`, `royalSeaTrafficPose`
- [lib/graphics/royal-citadel-flags.ts](../../lib/graphics/royal-citadel-flags.ts) — `ROYAL_CITADEL_FLAG_PLAN`, `createRoyalCitadelFlags`
- [lib/graphics/royal-citadel-gardens.ts](../../lib/graphics/royal-citadel-gardens.ts) — `RoyalCitadelGroundHeight`, `RoyalCitadelGardenObstacle`, `ROYAL_CITADEL_PUBLIC_PLAZA`, `ROYAL_CITADEL_WORK_SITES`, `createRoyalCitadelGardens`
- [lib/graphics/royal-citadel-interior-layout.ts](../../lib/graphics/royal-citadel-interior-layout.ts) — `RoyalInteriorPoint`, `RoyalInteriorRect`, `ROYAL_INTERIOR_FLOOR`, `ROYAL_INTERIOR_ROOMS`, `ROYAL_INTERIOR_STAIRS`, `ROYAL_INTERIOR_DAIS`, `ROYAL_INTERIOR_TOWER`, `royalTowerStepPoint`…
- [lib/graphics/royal-citadel-interior-life.ts](../../lib/graphics/royal-citadel-interior-life.ts) — `RoyalCitadelInteriorWaypoint`, `RoyalCitadelInteriorPost`, `RoyalCitadelInteriorRoute`, `RoyalCitadelInteriorPeoplePlan`, `royalCitadelInteriorRoutePose`, `createRoyalCitadelInteriorLife`
- [lib/graphics/royal-citadel-interior.ts](../../lib/graphics/royal-citadel-interior.ts) — `createRoyalCitadelInterior`
- [lib/graphics/royal-citadel-layout.ts](../../lib/graphics/royal-citadel-layout.ts) — `ROYAL_CITADEL_BASELINE`, `ROYAL_CITADEL_TRANSFORM`, `ROYAL_CITADEL_FLIGHT_STEPS`, `citadelWorldPoint`, `citadelLocalPoint`, `ROYAL_CITADEL_COURT_Y`, `ROYAL_CITADEL_SIDE_CROSSING_Z`, `ROYAL_CITADEL_ASCENTS`…
- [lib/graphics/royal-citadel-life.ts](../../lib/graphics/royal-citadel-life.ts) — `RoyalCitadelBody`, `RoyalCitadelPose`, `RoyalCitadelLife`, `royalCitadelPatrolRoute`, `royalCitadelPatrolPose`, `royalCitadelGardenerPose`, `createRoyalCitadelLife`
- [lib/graphics/royal-citadel-terraces.ts](../../lib/graphics/royal-citadel-terraces.ts) — `createRoyalCitadelTerraces`
- [lib/graphics/royal-galleon.ts](../../lib/graphics/royal-galleon.ts) — `createBoardableRoyalGalleon`
- [lib/graphics/royal-grand-bridge.ts](../../lib/graphics/royal-grand-bridge.ts) — `createRoyalGrandBridge`
- [lib/graphics/royal-harbor-activity.ts](../../lib/graphics/royal-harbor-activity.ts) — `RoyalHarborPoint`, `RoyalHarborPose`, `RoyalHarborBody`, `RoyalHarborActivity`, `ROYAL_FISHING_ROUTE`, `ROYAL_FREIGHT_ROUTE`, `sampleRoyalHarborRoute`, `royalHarborVisualClock`…
- [lib/graphics/royal-harbor-castle.ts](../../lib/graphics/royal-harbor-castle.ts) — `RoyalCitadelLocalSurface`, `RoyalCitadelLocalCollider`, `ROYAL_CITADEL_MONUMENT_SCALE`, `ROYAL_CITADEL_DEFENSIVE_TOWERS`, `ROYAL_CITADEL_LOCAL_PLAN`, `createRoyalCitadel`, `createRoyalArchBridge`, `disposeRoyalHarborCastleResources`
- [lib/graphics/royal-harbor-layout.ts](../../lib/graphics/royal-harbor-layout.ts) — `ROYAL_CAMERA_MAX_POLAR`, `royalRiverEdge`, `royalQuayLane`, `RoyalObstacle`, `royalWalkHeight`, `moveRoyalWalker`, `clipRoyalCameraBoom`
- [lib/graphics/royal-harbor-materials.ts](../../lib/graphics/royal-harbor-materials.ts) — `RoyalSurfaceKind`, `applyRoyalSurfaceDetail`
- [lib/graphics/royal-harbor-renderer.ts](../../lib/graphics/royal-harbor-renderer.ts) — `RoyalQuality`, `RoyalHarborStats`, `RoyalWalkMode`, `RoyalVisitArea`, `RoyalHarborController`, `createRoyalHarborRenderer`
- [lib/graphics/royal-harbor-scene.ts](../../lib/graphics/royal-harbor-scene.ts) — `ROYAL_HARBOR`, `RoyalHarborView`, `ROYAL_HARBOR_CAMERAS`, `createRoyalHarborScene`
- [lib/graphics/royal-harbor-ships.ts](../../lib/graphics/royal-harbor-ships.ts) — `RoyalGalleonOptions`, `RoyalShipLibrary`, `ROYAL_GALLEON_DIMENSIONS`, `createRoyalShipLibrary`, `createRoyalGalleon`, `disposeRoyalGalleon`
- [lib/graphics/royal-harbor-town.ts](../../lib/graphics/royal-harbor-town.ts) — `RoyalTownKind`, `createRoyalTownLibrary`
- [lib/graphics/royal-harbor-water.ts](../../lib/graphics/royal-harbor-water.ts) — `ROYAL_HARBOR_WATER_EXTENT`, `royalHarborBankEdge`, `royalHarborWaterAt`, `createRoyalHarborWaterGeometry`
- [lib/graphics/royal-human-palace.ts](../../lib/graphics/royal-human-palace.ts) — `createHumanRoyalPalace`
- [lib/graphics/royal-maritime-layout.ts](../../lib/graphics/royal-maritime-layout.ts) — `ROYAL_GALLEON`, `ROYAL_FISH_DOCK`, `ROYAL_WORKING_WATER_ROUTE`, `ROYAL_FISH_CART_ROUTE`, `ROYAL_GALLEON_WALK_ROUTE`, `royalFishingCrewLocalPose`, `royalMaritimeWalkHeight`, `royalMaritimeLocation`…
- [lib/graphics/royal-navigation.generated.json](../../lib/graphics/royal-navigation.generated.json)
- [lib/graphics/royal-navigation.ts](../../lib/graphics/royal-navigation.ts) — `RoyalPose`, `ROYAL_RECEPTION`, `ROYAL_WORKS`, `ROYAL_GATE`, `ROYAL_NAV_OBSTACLES`, `RoyalTarget`, `royalTarget`, `royalNavigation`
- [lib/graphics/royal-old-town-plan.ts](../../lib/graphics/royal-old-town-plan.ts) — `OLD_TOWN_STREETS`, `OLD_TOWN_SQUARE`, `OldTownVenueId`, `OldTownVenue`, `OLD_TOWN_VENUES`, `oldTownVenue`, `oldTownInside`, `oldTownWalkHeight`…
- [lib/graphics/royal-old-town.ts](../../lib/graphics/royal-old-town.ts) — `createRoyalOldTown`
- [lib/graphics/royal-palace-shell.ts](../../lib/graphics/royal-palace-shell.ts) — `openRoyalPalaceShell`
- [lib/graphics/royal-palace-structure.ts](../../lib/graphics/royal-palace-structure.ts) — `PalaceBox`, `royalPalaceStructure`, `royalPalaceShellVoids`, `royalInsidePublicPalace`, `openRoyalPalaceColliders`
- [lib/graphics/royal-player-appearance.ts](../../lib/graphics/royal-player-appearance.ts) — `royalPlayerActor`
- [lib/graphics/royal-proportions.ts](../../lib/graphics/royal-proportions.ts) — `ROYAL_ARCHITECTURE_SCALE`, `ROYAL_PORT_OFFSET`, `ROYAL_CASTLE_SCALE`, `ROYAL_CASTLE_BASE`, `ROYAL_COURT_Y`, `ROYAL_HUMAN_HEIGHT`, `royalCompact`, `HUMAN_ASCENTS`…
- [lib/graphics/royal-regional-terrain.ts](../../lib/graphics/royal-regional-terrain.ts) — `ROYAL_CITY_PLAN`, `royalApproachY`, `royalRegionalTerrain`, `royalCityRoad`, `royalVegetationAllowed`, `royalRoadDeck`
- [lib/graphics/royal-urban-district.ts](../../lib/graphics/royal-urban-district.ts) — `createRoyalUrbanDistrict`
- [lib/graphics/royal-urban-plan.ts](../../lib/graphics/royal-urban-plan.ts) — `RoyalStreetPoint`, `RoyalStreet`, `ROYAL_SERVICE_GATE`, `ROYAL_BRIDGE_APPROACH`, `ROYAL_COURT_SERVICE_LANE`, `ROYAL_PALACE_AVENUE`, `ROYAL_BRIDGE_TO_PALACE`, `ROYAL_CEREMONIAL_WALK`…
- [lib/graphics/royal-visit-stream.ts](../../lib/graphics/royal-visit-stream.ts) — `royalTownVisitObstacles`, `createRoyalVisitStream`
- [lib/graphics/royal-worksite.ts](../../lib/graphics/royal-worksite.ts) — `ROYAL_CLERK`, `ROYAL_REPAIR`, `ROYAL_CARGO_PICKUP`, `royalWorkPose`
- [lib/graphics/royal-world-activity.ts](../../lib/graphics/royal-world-activity.ts) — `royalActivityPoint`, `createRoyalWorldActivity`
- [lib/graphics/royal-world-context.ts](../../lib/graphics/royal-world-context.ts) — `createRoyalWorldContext`
- [lib/graphics/royal-world-layer.ts](../../lib/graphics/royal-world-layer.ts) — `createRoyalWorldLayer`
- [lib/graphics/royal-world-location.ts](../../lib/graphics/royal-world-location.ts) — `ROYAL_WORLD_LOCATION`, `ROYAL_WORLD_SCALE`, `ROYAL_WORLD_BOUNDS`, `ROYAL_WORLD_ORIGIN`, `royalLocalToWorld`, `royalWorldContains`, `royalWorldVisible`, `royalViewHalfHeight`…
- [lib/graphics/royal-world-palace.ts](../../lib/graphics/royal-world-palace.ts)
- [lib/graphics/royal-world-surface.ts](../../lib/graphics/royal-world-surface.ts) — `ROYAL_WORLD_BASE_Y`, `createRoyalSurface`, `ROYAL_REGIONAL_ROUTES`, `ROYAL_TOWN_TO_THRONE`
- [lib/graphics/scene-data.ts](../../lib/graphics/scene-data.ts) — `SceneMode`, `RenderQuality`, `SceneInput`, `RenderStats`, `TILE_SIZE`, `BUILDING_ORDER`, `TileVisual`, `stableSeed`…
- [lib/graphics/scene-structure.ts](../../lib/graphics/scene-structure.ts) — `habitableLandscapeShape`, `stationLandscapeSignature`
- [lib/graphics/settlement-architecture.ts](../../lib/graphics/settlement-architecture.ts) — `SettlementPalette`, `ArchitectureBox`, `ArchitectureOptions`, `DwellingKind`, `addDwellingArchitecture`, `addCargoCrate`, `addTiledRoof`, `addMarketArchitecture`…
- [lib/graphics/settlement-layout.ts](../../lib/graphics/settlement-layout.ts) — `SETTLEMENT_CELL`, `SETTLEMENT_HALF_WIDTH`, `SETTLEMENT_HALF_DEPTH`, `sceneryNoise`, `islandContains`, `riverCenter`, `riverWidth`, `isSceneryWater`…
- [lib/graphics/settlement.ts](../../lib/graphics/settlement.ts) — `DetailedSettlement`, `SettlementInput`, `createSettlement`, `createSettlementAsync`
- [lib/graphics/ship-camera.ts](../../lib/graphics/ship-camera.ts) — `clipTripoShipCamera`
- [lib/graphics/shop-handling-motion.ts](../../lib/graphics/shop-handling-motion.ts) — `HandlingPoint`, `ShopHandlingSchedule`, `shopHandlingSchedule`, `shopHandlingPose`, `shopDriverSeatBlend`
- [lib/graphics/shop-merchant-motion.ts](../../lib/graphics/shop-merchant-motion.ts) — `createShopMerchantMotion`
- [lib/graphics/shop-packer-motion.ts](../../lib/graphics/shop-packer-motion.ts) — `shopPackerMotion`
- [lib/graphics/tavern-supply-route.ts](../../lib/graphics/tavern-supply-route.ts) — `TavernPoint`, `TAVERN_RECEIVING`, `TAVERN_COUNTER`, `TAVERN_DELIVERY_ROUTE`, `TavernSupplySchedule`, `tavernSupplySchedule`, `tavernSupplyPose`
- [lib/graphics/terrain-ramps.ts](../../lib/graphics/terrain-ramps.ts) — `TerrainRamp`, `TerrainVertex`, `terrainRampsForChunk`, `clipTerrainRampFace`
- [lib/graphics/terrain-surface.ts](../../lib/graphics/terrain-surface.ts) — `TerrainSurfaceCell`, `TerrainSurfaceGrid`, `createTerrainSurfaceGrid`
- [lib/graphics/trade-routes.ts](../../lib/graphics/trade-routes.ts) — `TRADE_DESTINATION`, `TRADE_BAY`, `TRADE_GATEWAY`, `tradeGroundHeight`, `sampleTradePath`, `tradePathLength`, `planHabitableTradeRoute`
- [lib/graphics/tripo-resident.ts](../../lib/graphics/tripo-resident.ts) — `TRIPO_RESIDENT_URL`, `TRIPO_RESIDENT_HEIGHT`, `bindTripoResident`, `createTripoResidentLibrary`
- [lib/graphics/tripo-ship-assets.ts](../../lib/graphics/tripo-ship-assets.ts) — `TRIPO_SHIP_ASSETS`
- [lib/graphics/tripo-ship.ts](../../lib/graphics/tripo-ship.ts) — `createTripoShip`, `createTripoMooredFleet`
- [lib/graphics/tripo-transport.ts](../../lib/graphics/tripo-transport.ts) — `TRIPO_TRANSPORT_URLS`, `horseHoofOffset`, `bindTripoHorse`, `createTripoTransportAppearance`
- [lib/graphics/tripo-voxel-pilot.ts](../../lib/graphics/tripo-voxel-pilot.ts) — `VoxelPlacement`, `VoxelPilotSpec`, `VOXEL_PILOT_SPECS`, `finishVoxelMaterial`, `voxelPlacementMatrix`, `voxelFitMatrix`, `voxelFallbackInstances`, `createTripoVoxelPilot`
- [lib/graphics/urban-detail.ts](../../lib/graphics/urban-detail.ts) — `createUrbanMasonryMaterial`, `architectureFootprintScale`, `urbanPavingLayout`
- [lib/graphics/viewer-lifecycle.ts](../../lib/graphics/viewer-lifecycle.ts) — `GraphicsDeviceHints`, `effectiveGraphicsQuality`, `viewerNeedsConsent`, `graphicsDeviceHints`, `createViewerFrameLoop`, `ViewerVisibility`, `observeViewerVisibility`
- [lib/graphics/world-camera.ts](../../lib/graphics/world-camera.ts) — `CameraMode`, `WORLD_CAMERA_FOV`, `WORLD_CAMERA_DEFAULT_TILT`, `cameraTilt`, `flushCameraMomentum`, `worldViewHalfHeight`, `worldCameraFrame`, `worldStreamWindow`…
- [lib/graphics/world-collision.ts](../../lib/graphics/world-collision.ts) — `PhysicalWorldContext`, `WorldFlora`, `PhysicalNpcPose`, `WorldWildlife`, `worldFloraChunk`, `physicalObstaclesNear`, `physicalDeckHeightAt`, `physicalTerrainSample`…
- [lib/graphics/world-geography.ts](../../lib/graphics/world-geography.ts) — `WorldBiome`, `WorldSample`, `BiomeStyle`, `WorldLandmark`, `WorldSettlement`, `WORLD_CHUNK_SIZE`, `planetTerrainAt`, `sampleWorld`…
- [lib/graphics/world-landmark-geometry.ts](../../lib/graphics/world-landmark-geometry.ts) — `LandmarkPlacement`, `landmarkPlacements`, `landmarkObstacles`
- [lib/graphics/world-models.ts](../../lib/graphics/world-models.ts) — `WorldAsset`, `WorldAssetLibrary`, `animateWorldAsset`, `createWorldAssetLibrary`
- [lib/graphics/world-navigation.ts](../../lib/graphics/world-navigation.ts) — `planetVectorToGeo`, `planetVectorToWorld`, `geographicWorldBounds`, `clampWorldPoint`
- [lib/graphics/world-scenery-clearance.ts](../../lib/graphics/world-scenery-clearance.ts) — `createTradeSceneryClearance`
- [lib/graphics/world-sky.ts](../../lib/graphics/world-sky.ts) — `createWorldSky`
- [lib/graphics/world-terrain-height.ts](../../lib/graphics/world-terrain-height.ts) — `OwnPatch`, `TerrainPlateau`, `waterfallPool`, `continuousTerrainHeight`
- [lib/graphics/world-terrain-renderer.ts](../../lib/graphics/world-terrain-renderer.ts) — `WorldTerrainController`, `WorldTerrainDistrict`, `WorldTerrainCallbacks`, `buildWorldTerrainGeometry`, `createWorldTerrainRendererAsync`, `createWorldTerrainRenderer`

## lib/mvp (82 archivos)

Reglas económicas, mundo persistente, producción y almacenamiento.

- [lib/mvp/activity-progression.ts](../../lib/mvp/activity-progression.ts) — `ActivityKind`, `ActivityCompletion`, `ActivityProgressionView`, `ACTIVITY_COMPLETION_LIMIT`, `ACTIVITY_XP`, `activityLevelThreshold`, `activityProgressionForXp`, `ActivityXpEntry`…
- [lib/mvp/boost-passes.ts](../../lib/mvp/boost-passes.ts) — `BoostPassReward`, `BoostPassWallet`, `BoostPassRewardQuote`, `BOOST_PASS_HISTORY_LIMIT`, `getBoostPassWallet`
- [lib/mvp/boost-reservations.ts](../../lib/mvp/boost-reservations.ts) — `TEST_BOOST_WINDOW_SECONDS`, `TEST_BOOST_LIMIT_SECONDS`, `TEST_BOOST_MAX_REDUCTION_PERCENT`, `TestBoostReservation`, `jobTestBoost`
- [lib/mvp/catalog.ts](../../lib/mvp/catalog.ts) — `CONFIG`, `ITEMS`, `ITEM_CATALOG`, `RECIPES`, `RECIPE_CATALOG`, `BUILDING_LABELS`, `BIOME_LABELS`, `TERRAIN_LABELS`…
- [lib/mvp/city-shop-commerce.ts](../../lib/mvp/city-shop-commerce.ts) — `executeShopCommerce`
- [lib/mvp/city-shop-handling.ts](../../lib/mvp/city-shop-handling.ts) — `ShopHandling`, `shopHandlingBusy`, `cityWorkerBusy`, `settleShopHandling`, `startShopHandling`
- [lib/mvp/city-shop-production-data.ts](../../lib/mvp/city-shop-production-data.ts) — `ShopProductionPlan`, `activeShopContract`, `commercialLot`, `reservedShopLot`, `refreshShopProduction`, `shopProductionNeed`, `shopLoaderReserved`, `shopLoadingWorker`…
- [lib/mvp/city-shop-production.ts](../../lib/mvp/city-shop-production.ts) — `authorizeShopProduction`, `packShopProduction`
- [lib/mvp/city-shop-service.ts](../../lib/mvp/city-shop-service.ts) — `readCityShop`, `executeCityShop`
- [lib/mvp/city-shop-transfers.ts](../../lib/mvp/city-shop-transfers.ts) — `completeShopCollection`, `completeShopDelivery`, `completeShopSale`
- [lib/mvp/city-shop.ts](../../lib/mvp/city-shop.ts) — `SHOP_GOODS`, `ShopGood`, `ShopAssetKind`, `shopGoods`, `shopGood`, `ShopAsset`, `ShopOrder`, `TRADE_REQUESTS`…
- [lib/mvp/city-tavern.ts](../../lib/mvp/city-tavern.ts) — `TAVERN_SUPPLY`, `TavernShipment`, `tavernUnloading`, `tavernDemandLeft`, `tavernPresence`, `tavernSnapshot`, `dispatchTavernSupply`, `settleTavernSupply`…
- [lib/mvp/engine.ts](../../lib/mvp/engine.ts) — `MvpServiceError`, `buildMvpView`, `settleMvpPlayer`, `readMvpView`, `VerifiedQuoteAuthorization`, `executeMvp`, `quoteMvp`, `validateMvpQuote`
- [lib/mvp/entity-values.ts](../../lib/mvp/entity-values.ts) — `deriveClosedEntityValues`
- [lib/mvp/entity-versions.ts](../../lib/mvp/entity-versions.ts) — `EntityVersions`, `deriveEntityValues`, `advanceEntityVersions`, `commandVersionKeys`, `selectEntityVersions`, `selectPlayerViewVersionKeys`
- [lib/mvp/exploration-data.ts](../../lib/mvp/exploration-data.ts) — `ExplorationPoint`, `ExplorationTransport`, `ExplorationMovementLeg`, `ExplorationTrafficHold`, `ExplorationMovement`, `ExplorationState`, `PublicExplorationState`, `ExplorationDestinationView`…
- [lib/mvp/exploration-network-data.ts](../../lib/mvp/exploration-network-data.ts) — `NetworkPoint`, `PublicLanding`, `PublicRiverBridge`, `PublicNetworkNode`, `PublicNetworkEdge`, `PublicTerrainRamp`, `PublicTownGate`, `ExplorationNetworkData`…
- [lib/mvp/exploration-network.generated.json](../../lib/mvp/exploration-network.generated.json)
- [lib/mvp/exploration-network.ts](../../lib/mvp/exploration-network.ts) — `JourneyPiece`, `TRANSPORT_SPEED`, `MAX_JOURNEY_POINTS`, `networkTravelSeconds`, `networkDestinationEnabled`, `nearestNetworkDestination`, `networkJourney`, `NetworkAttachment`…
- [lib/mvp/exploration-timing.ts](../../lib/mvp/exploration-timing.ts) — `ExplorationTimedSegment`, `blockingTrafficHold`, `explorationHoldAt`, `explorationTimedSegments`, `explorationTimedPosition`, `explorationTimedHeading`
- [lib/mvp/exploration-traffic.ts](../../lib/mvp/exploration-traffic.ts) — `TRAFFIC_HEADWAY_MS`, `TrafficActor`, `TrafficOptions`, `reserveTrafficMovement`, `worldTrafficActors`, `reserveExplorationJourney`, `manualTrafficLineClear`, `settleExplorationTraffic`
- [lib/mvp/exploration-vessel.ts](../../lib/mvp/exploration-vessel.ts) — `explorationBoatDuration`, `explorationBoatLegPositionAt`, `ExplorationBoatPose`, `explorationBoatPoseAt`
- [lib/mvp/exploration.ts](../../lib/mvp/exploration.ts) — `explorationWorldLineClear`, `planExplorationRoute`, `getHomeAccess`, `explorationWorldBodies`, `planExplorationJourney`, `planReturnJourney`, `dispatchExploration`, `settleExploration`…
- [lib/mvp/first-trade.ts](../../lib/mvp/first-trade.ts) — `FirstTradeStage`, `FirstTradeView`, `getFirstTradeView`
- [lib/mvp/habitable-buildings.ts](../../lib/mvp/habitable-buildings.ts) — `HabitableFacilityRecipeView`, `HabitableFacilityOperationView`, `HabitableFacilityLogisticsView`, `HabitableFacilityView`, `getHabitableBuildingVisual`, `publicHabitableBuilding`, `habitableStateWithVisuals`, `getHabitableFacilities`…
- [lib/mvp/habitable-commerce.ts](../../lib/mvp/habitable-commerce.ts) — `TradePoint`, `HabitableTradeRoute`, `HabitableTradeCollection`, `HabitableCaravanVisual`, `HabitableTradePhase`, `HabitableTradePose`, `HabitableTrade`, `HabitableTradeView`…
- [lib/mvp/habitable-construction.ts](../../lib/mvp/habitable-construction.ts) — `planHabitableConstruction`, `settleHabitableConstruction`
- [lib/mvp/habitable-daily.ts](../../lib/mvp/habitable-daily.ts) — `HABITABLE_DAILY_SECONDS`, `HabitableDailyView`, `habitableDailyBusy`, `habitableDailyProductionReason`, `planHabitableDaily`, `dispatchHabitableDaily`, `settleHabitableDaily`, `getHabitableDailyView`…
- [lib/mvp/habitable-data.ts](../../lib/mvp/habitable-data.ts) — `HabitablePoint`, `HabitableDailyLeg`, `HabitableDailySchedule`, `HabitableDailyJourney`, `HabitableDailyState`, `HabitableAppearance`, `HabitableProfession`, `HabitableTemplateId`…
- [lib/mvp/habitable-industry.ts](../../lib/mvp/habitable-industry.ts) — `HABITABLE_FORESTRY_SECONDS_PER_UNIT`, `HABITABLE_SAWMILL_SECONDS`, `HABITABLE_SAWMILL_INPUTS`, `HABITABLE_SAWMILL_OUTPUTS`, `HabitableIndustryView`, `habitableForestSource`, `getHabitableForestSources`, `getHabitableIndustryView`…
- [lib/mvp/habitable-logistics.ts](../../lib/mvp/habitable-logistics.ts) — `HABITABLE_CARRIER_SPEED`, `habitableReservedStorage`, `habitableLogisticsBusy`, `getHabitableWorkers`, `habitableWorkerObstacles`, `habitableWorkStand`, `giveHabitableOutput`, `guardHabitableWorkerMovement`…
- [lib/mvp/habitable-manager-balance.ts](../../lib/mvp/habitable-manager-balance.ts) — `ManagerBalanceRow`, `ManagerBalanceView`, `ManagerBalanceState`, `createManagerBalance`, `recordManagerProducedLot`, `recordManagerShipmentDelivery`, `observeManagerBalance`, `getManagerBalanceView`
- [lib/mvp/habitable-manager-forecast.ts](../../lib/mvp/habitable-manager-forecast.ts) — `ManagerForecast`, `getHabitableManagerForecast`, `getManagerForecast`
- [lib/mvp/habitable-manager-operator.ts](../../lib/mvp/habitable-manager-operator.ts) — `ManagerOperatorJob`, `ManagerOperatorConfig`, `ManagerOperatorState`, `ManagerOperatorChoice`, `ManagerOperatorView`, `isManagerOperatorReserved`, `isManagerOperatorBuildingReserved`, `managerOperatorCanCover`…
- [lib/mvp/habitable-manager-priorities.ts](../../lib/mvp/habitable-manager-priorities.ts) — `ManagerPriority`, `ManagerPriorityPlan`, `managerPriorityOrder`, `classifyManagerDelivery`
- [lib/mvp/habitable-manager-reservations.ts](../../lib/mvp/habitable-manager-reservations.ts) — `ManagerMaterialAllocation`, `ManagerBuildReservationView`, `reservedManagerLot`, `freeManagerLot`, `freeManagerMaterial`, `managerBuildReservationView`, `refreshManagerMaterialReservations`, `managerReservedMaterials`
- [lib/mvp/habitable-manager-transport.ts](../../lib/mvp/habitable-manager-transport.ts) — `ManagerTransportState`, `ManagerTransportView`, `ManagerCourierChoice`, `MANAGER_DELIVERY_AGING_MS`, `isManagerCourierReserved`, `getManagerCourierChoices`, `initializeManagerTransport`, `settleManagerTransport`…
- [lib/mvp/habitable-manager.ts](../../lib/mvp/habitable-manager.ts) — `ManagerGoalItem`, `ManagerRecipeId`, `ManagerReserveItem`, `ManagerReserveView`, `ManagerBuildTemplate`, `ManagerGoals`, `ManagerForestryAuthority`, `ManagerForestSourceView`…
- [lib/mvp/habitable-network.ts](../../lib/mvp/habitable-network.ts) — `HabitableConstructionSourceView`, `HabitableNetworkNode`, `HabitableNetworkEdge`, `HabitableNetworkView`, `HabitableNetworkVisual`, `getConstructionSources`, `getHabitableNetworkView`, `getHabitableNetworkVisual`
- [lib/mvp/habitable-residents.ts](../../lib/mvp/habitable-residents.ts) — `HabitableResidentView`, `HabitableResidentsView`, `habitableResidentBusy`, `habitableAssignedResident`, `requireHabitableResident`, `planHabitableResidentRelocation`, `getHabitableResidentsView`, `settleHabitableResidents`…
- [lib/mvp/habitable-shed-upgrades.ts](../../lib/mvp/habitable-shed-upgrades.ts) — `HABITABLE_SHED_UPGRADE_COSTS`, `HABITABLE_SHED_UPGRADE_SECONDS`, `HabitableShedUpgradeView`, `getHabitableShedUpgradeView`, `dispatchHabitableShedUpgrade`, `settleHabitableShedUpgrades`
- [lib/mvp/habitable-supplies.ts](../../lib/mvp/habitable-supplies.ts) — `HabitableSupplySourceView`, `HabitableSuppliesView`, `habitableWorkerReason`, `planHabitableSupply`, `getHabitableSupplySources`, `takeHabitableSupply`, `getHabitableSuppliesView`, `cancelHabitableSupply`…
- [lib/mvp/habitable.ts](../../lib/mvp/habitable.ts) — `settleHabitable`, `guardHabitableCommand`, `dispatchHabitable`, `HabitableView`, `getPublicHabitableActor`, `getHabitableView`
- [lib/mvp/helpers.ts](../../lib/mvp/helpers.ts) — `MvpError`, `integer`, `text`, `item`, `actor`, `field`, `available`, `nextLotId`…
- [lib/mvp/http.ts](../../lib/mvp/http.ts) — `actionSchema`, `apiJson`, `actionRequest`, `apiFailure`
- [lib/mvp/invitations.ts](../../lib/mvp/invitations.ts) — `invitationCodeForPlayer`, `resolveInvitationPlayerId`
- [lib/mvp/land-civil.ts](../../lib/mvp/land-civil.ts) — `LAND_ROAD_UNIT_COSTS`, `LAND_ROAD_SECONDS`, `LAND_BRIDGE_COSTS`, `LAND_BRIDGE_SECONDS`, `LAND_DEMOLITION_SECONDS`, `demolitionReason`, `demolitionRecovery`, `demolitionAccess`…
- [lib/mvp/land-crews.ts](../../lib/mvp/land-crews.ts) — `LAND_CREW_SPEED`, `planLandCrew`
- [lib/mvp/land-expansion.ts](../../lib/mvp/land-expansion.ts) — `dispatchLandExpansion`, `settleLandExpansion`, `getLandView`
- [lib/mvp/land-grid.ts](../../lib/mvp/land-grid.ts) — `LAND_GRID_SIZE`, `LAND_CELL_SIZE`, `LAND_CORE_SIZE`, `LAND_BATCH_LIMIT`, `LAND_RULES_EFFECTIVE_AT`, `LandMethod`, `LandOperation`, `LandCrewLeg`…
- [lib/mvp/land-paths.ts](../../lib/mvp/land-paths.ts) — `preferredLandPath`
- [lib/mvp/level-unlocks.ts](../../lib/mvp/level-unlocks.ts) — `UNLOCK_RULES_EFFECTIVE_AT`, `UnlockAccess`, `LevelMilestone`, `LevelUnlockView`, `RECIPE_UNLOCK_LEVELS`, `BUILDING_UNLOCK_LEVELS`, `FREE_UNLOCK_POLICY`, `recipeUnlockAccess`…
- [lib/mvp/manual-navigation.ts](../../lib/mvp/manual-navigation.ts) — `MANUAL_NAVIGATION_LEASE_MS`, `ManualNavigationOptions`, `dispatchManualNavigation`
- [lib/mvp/operation-ids.ts](../../lib/mvp/operation-ids.ts) — `beginVillageOperation`, `nextWorldId`, `lastWorldId`, `nextSocialId`, `cloneOperationWorld`
- [lib/mvp/partitioned-codec.ts](../../lib/mvp/partitioned-codec.ts) — `WorldRecord`, `worldRecordKey`, `serializeWorldRecords`, `decodeWorldRecords`, `splitUtf8`, `hashRecord`
- [lib/mvp/partitioned-store.ts](../../lib/mvp/partitioned-store.ts) — `PartitionD1Result`, `PartitionD1Statement`, `PartitionD1Database`, `PartitionedStoreOptions`, `createPartitionedMvpStore`
- [lib/mvp/player-progress.ts](../../lib/mvp/player-progress.ts) — `PlayerProgressView`, `PlayerReportView`, `getPlayerProgress`, `getPlayerReports`
- [lib/mvp/player-read-model.ts](../../lib/mvp/player-read-model.ts) — `PlayerReadModelOptions`, `PlayerProjectionRecord`, `ReadModelWriteGuard`, `guardedReadModelRows`, `playerReadNextDueAt`, `createPlayerReadModel`
- [lib/mvp/production.ts](../../lib/mvp/production.ts) — `dispatchProduction`, `settleProduction`
- [lib/mvp/reference-config.json](../../lib/mvp/reference-config.json)
- [lib/mvp/royal-harbor-service.ts](../../lib/mvp/royal-harbor-service.ts) — `RoyalHarborTradeCommand`, `RoyalHarborTradeRequest`, `readRoyalHarbor`, `executeRoyalHarborTrade`
- [lib/mvp/royal-harbor.ts](../../lib/mvp/royal-harbor.ts) — `RoyalHarborGood`, `RoyalHarborPhase`, `ROYAL_HARBOR_CYCLE_MS`, `ROYAL_HARBOR_FISHERY_BUDGET`, `ROYAL_HARBOR_CREDIT_RESERVE`, `ROYAL_HARBOR_BATCH`, `ROYAL_HARBOR_STOCK_LIMIT`, `ROYAL_HARBOR_GOODS`…
- [lib/mvp/royal-kingdom-service.ts](../../lib/mvp/royal-kingdom-service.ts) — `royalKingdomSnapshot`, `readRoyalKingdom`, `executeRoyalKingdom`
- [lib/mvp/royal-kingdom.ts](../../lib/mvp/royal-kingdom.ts) — `ROYAL_SUPPLY`, `royalCharacterPresent`, `RoyalSupplyContract`, `RoyalPlayerState`, `RoyalKingdomState`, `RoyalKingdomSnapshot`
- [lib/mvp/settlements.ts](../../lib/mvp/settlements.ts) — `PARCEL_WIDTH`, `PARCEL_DEPTH`, `PARCEL_SPACING`, `WORLD_SECTOR_SPAN`, `STARTER_PROTECTION_MS`, `globalToTile`, `tileToGlobal`, `plotForIndex`…
- [lib/mvp/social.ts](../../lib/mvp/social.ts) — `SocialState`, `createSocialState`, `settleSocial`, `dispatchSocial`, `areAllied`, `getSocialView`, `SocialView`
- [lib/mvp/station-upgrades.ts](../../lib/mvp/station-upgrades.ts) — `StationUpgradeVisual`, `STATION_UPGRADE_SECONDS_PER_LEVEL`, `getStationUpgradeVisuals`, `getStationUpgradeWorkers`, `dispatchStationUpgrade`, `settleStationUpgrades`
- [lib/mvp/storage-availability.ts](../../lib/mvp/storage-availability.ts) — `MvpStorageUnavailableError`, `isMvpStorageUnavailableError`, `isTransientD1Error`, `D1_READ_RETRY_DELAYS_MS`, `D1ReadRetryOptions`, `readD1WithRetry`, `writeD1Once`
- [lib/mvp/store.ts](../../lib/mvp/store.ts) — `MvpRecord`, `MvpCommitContext`, `MvpVillageCommitContext`, `MvpStore`, `getMvpStore`
- [lib/mvp/tavern-public-view.ts](../../lib/mvp/tavern-public-view.ts) — `tavernPublicView`
- [lib/mvp/tavern-settlement.ts](../../lib/mvp/tavern-settlement.ts) — `settleDueTavernSupplies`
- [lib/mvp/territory.ts](../../lib/mvp/territory.ts) — `TERRITORY_PARAMETERS`, `OutpostHistory`, `Outpost`, `settleTerritory`, `dispatchTerritory`, `resolveOutpostBattle`, `getOutpostRouteFactor`, `getOutpostSurveyFactor`
- [lib/mvp/test-boosts.ts](../../lib/mvp/test-boosts.ts) — `TEST_BOOST_COMMANDS`, `TEST_BOOST_RECIPE_IDS`, `TestBoostView`, `TestBoostQuote`, `guardTestBoostCommand`, `getTestBoostsView`, `planTestBoost`, `testBoostQuote`
- [lib/mvp/types.ts](../../lib/mvp/types.ts) — `ItemId`, `Faction`, `Biome`, `Terrain`, `Weather`, `BuildingType`, `ItemAmount`, `InventoryLot`…
- [lib/mvp/view.ts](../../lib/mvp/view.ts) — `PublicPlayer`, `PublicSettlement`, `AdminView`, `MvpView`, `ActionQuote`
- [lib/mvp/village-evidence.ts](../../lib/mvp/village-evidence.ts) — `VillageIdentity`, `ExtractionReservationFact`, `VillageEvidence`, `VillageDependencyError`, `attachVillageEvidence`, `getVillageEvidence`, `copyVillageEvidence`, `playerIdentity`…
- [lib/mvp/village-execution.ts](../../lib/mvp/village-execution.ts) — `villageTarget`, `villageReadVersions`
- [lib/mvp/village-read-index.ts](../../lib/mvp/village-read-index.ts) — `IndexedRecord`, `createVillageReadIndex`
- [lib/mvp/village-semantics.ts](../../lib/mvp/village-semantics.ts) — `deriveVillageEntityValues`, `villageInvalidatedAggregateKeys`, `deriveVillageVersionChanges`, `supportsVillageCommand`, `assertVillageExecutionClosure`
- [lib/mvp/village-settlement-scope.ts](../../lib/mvp/village-settlement-scope.ts) — `settlementPlayers`, `VillageBuildingSettlementScope`
- [lib/mvp/village-snapshot.ts](../../lib/mvp/village-snapshot.ts) — `VillageReadQuery`, `VillageMaintenanceQuery`, `VillageReadReason`, `VillageReadOutcome`, `VillageLeaseRef`, `VillageMaintenanceRecord`, `VillageMaintenanceRetry`, `VillageIdentity`…
- [lib/mvp/world.ts](../../lib/mvp/world.ts) — `WEATHER_WINDOW`, `HOME_TILE`, `weatherFor`, `createMvpWorld`, `createPlayer`, `neighboring`, `routeTo`

## components (62 archivos)

Primitivas de interfaz reutilizables.

- [components/connector-error.tsx](../../components/connector-error.tsx) — `ConnectorError`
- [components/ui/accordion.tsx](../../components/ui/accordion.tsx)
- [components/ui/alert-dialog.tsx](../../components/ui/alert-dialog.tsx)
- [components/ui/alert.tsx](../../components/ui/alert.tsx)
- [components/ui/aspect-ratio.tsx](../../components/ui/aspect-ratio.tsx)
- [components/ui/attachment.tsx](../../components/ui/attachment.tsx)
- [components/ui/avatar.tsx](../../components/ui/avatar.tsx)
- [components/ui/badge.tsx](../../components/ui/badge.tsx)
- [components/ui/breadcrumb.tsx](../../components/ui/breadcrumb.tsx)
- [components/ui/bubble.tsx](../../components/ui/bubble.tsx)
- [components/ui/button-group.tsx](../../components/ui/button-group.tsx)
- [components/ui/button.tsx](../../components/ui/button.tsx)
- [components/ui/calendar.tsx](../../components/ui/calendar.tsx)
- [components/ui/card.tsx](../../components/ui/card.tsx)
- [components/ui/carousel.tsx](../../components/ui/carousel.tsx)
- [components/ui/chart.tsx](../../components/ui/chart.tsx) — `ChartConfig`
- [components/ui/checkbox.tsx](../../components/ui/checkbox.tsx)
- [components/ui/collapsible.tsx](../../components/ui/collapsible.tsx)
- [components/ui/combobox.tsx](../../components/ui/combobox.tsx)
- [components/ui/command.tsx](../../components/ui/command.tsx)
- [components/ui/context-menu.tsx](../../components/ui/context-menu.tsx)
- [components/ui/dialog.tsx](../../components/ui/dialog.tsx)
- [components/ui/direction.tsx](../../components/ui/direction.tsx)
- [components/ui/drawer.tsx](../../components/ui/drawer.tsx)
- [components/ui/dropdown-menu.tsx](../../components/ui/dropdown-menu.tsx)
- [components/ui/empty.tsx](../../components/ui/empty.tsx)
- [components/ui/field.tsx](../../components/ui/field.tsx)
- [components/ui/form.tsx](../../components/ui/form.tsx)
- [components/ui/hover-card.tsx](../../components/ui/hover-card.tsx)
- [components/ui/input-group.tsx](../../components/ui/input-group.tsx)
- [components/ui/input-otp.tsx](../../components/ui/input-otp.tsx)
- [components/ui/input.tsx](../../components/ui/input.tsx)
- [components/ui/item.tsx](../../components/ui/item.tsx)
- [components/ui/kbd.tsx](../../components/ui/kbd.tsx)
- [components/ui/label.tsx](../../components/ui/label.tsx)
- [components/ui/marker.tsx](../../components/ui/marker.tsx)
- [components/ui/menubar.tsx](../../components/ui/menubar.tsx)
- [components/ui/message-scroller.tsx](../../components/ui/message-scroller.tsx)
- [components/ui/message.tsx](../../components/ui/message.tsx)
- [components/ui/native-select.tsx](../../components/ui/native-select.tsx)
- [components/ui/navigation-menu.tsx](../../components/ui/navigation-menu.tsx)
- [components/ui/pagination.tsx](../../components/ui/pagination.tsx)
- [components/ui/popover.tsx](../../components/ui/popover.tsx)
- [components/ui/progress.tsx](../../components/ui/progress.tsx)
- [components/ui/radio-group.tsx](../../components/ui/radio-group.tsx)
- [components/ui/resizable.tsx](../../components/ui/resizable.tsx)
- [components/ui/scroll-area.tsx](../../components/ui/scroll-area.tsx)
- [components/ui/select.tsx](../../components/ui/select.tsx)
- [components/ui/separator.tsx](../../components/ui/separator.tsx)
- [components/ui/sheet.tsx](../../components/ui/sheet.tsx)
- [components/ui/sidebar.tsx](../../components/ui/sidebar.tsx)
- [components/ui/skeleton.tsx](../../components/ui/skeleton.tsx)
- [components/ui/slider.tsx](../../components/ui/slider.tsx)
- [components/ui/sonner.tsx](../../components/ui/sonner.tsx)
- [components/ui/spinner.tsx](../../components/ui/spinner.tsx)
- [components/ui/switch.tsx](../../components/ui/switch.tsx)
- [components/ui/table.tsx](../../components/ui/table.tsx)
- [components/ui/tabs.tsx](../../components/ui/tabs.tsx)
- [components/ui/textarea.tsx](../../components/ui/textarea.tsx)
- [components/ui/toggle-group.tsx](../../components/ui/toggle-group.tsx)
- [components/ui/toggle.tsx](../../components/ui/toggle.tsx)
- [components/ui/tooltip.tsx](../../components/ui/tooltip.tsx)

## hooks (1 archivos)

Hooks compartidos.

- [hooks/use-mobile.ts](../../hooks/use-mobile.ts) — `useIsMobile`

## build (6 archivos)

Entrada Cloudflare Worker y adaptadores de compilación.

- [build/cloudflare-worker.ts](../../build/cloudflare-worker.ts)
- [build/connector-preview-plugin.mjs](../../build/connector-preview-plugin.mjs) — `connectorPreview`
- [build/connector-preview-worker.mjs](../../build/connector-preview-worker.mjs) — `ConnectorPreview`
- [build/sites-vite-plugin.LICENSE](../../build/sites-vite-plugin.LICENSE)
- [build/sites-vite-plugin.ts](../../build/sites-vite-plugin.ts) — `sites`
- [build/sites-worker.ts](../../build/sites-worker.ts)

## db (6 archivos)

Esquema ORM y candidato experimental de persistencia por entidad.

- [db/bounded-village-reads.sql](../../db/bounded-village-reads.sql)
- [db/index.ts](../../db/index.ts) — `getDb`
- [db/partitioned-world.sql](../../db/partitioned-world.sql)
- [db/player-read-model.sql](../../db/player-read-model.sql)
- [db/schema.ts](../../db/schema.ts) — `worldState`
- [db/village-writes.sql](../../db/village-writes.sql)

## drizzle (3 archivos)

Migración activa y snapshots de esquema; no contiene datos de jugadores.

- [drizzle/0000_odd_warlock.sql](../../drizzle/0000_odd_warlock.sql)
- [drizzle/meta/0000_snapshot.json](../../drizzle/meta/0000_snapshot.json)
- [drizzle/meta/_journal.json](../../drizzle/meta/_journal.json)

## public (48 archivos)

Activos gráficos, GLB, audio, fuentes y avisos.

- [public/audio/v1/axe.mp3](../../public/audio/v1/axe.mp3)
- [public/audio/v1/coins.mp3](../../public/audio/v1/coins.mp3)
- [public/audio/v1/crate.mp3](../../public/audio/v1/crate.mp3)
- [public/audio/v1/creak.mp3](../../public/audio/v1/creak.mp3)
- [public/audio/v1/credits.txt](../../public/audio/v1/credits.txt)
- [public/audio/v1/exploration.mp3](../../public/audio/v1/exploration.mp3)
- [public/audio/v1/forest.mp3](../../public/audio/v1/forest.mp3)
- [public/audio/v1/hammer.mp3](../../public/audio/v1/hammer.mp3)
- [public/audio/v1/harvest.mp3](../../public/audio/v1/harvest.mp3)
- [public/audio/v1/hoof.mp3](../../public/audio/v1/hoof.mp3)
- [public/audio/v1/manifest.json](../../public/audio/v1/manifest.json)
- [public/audio/v1/saw.mp3](../../public/audio/v1/saw.mp3)
- [public/audio/v1/shop-north-welcome.mp3](../../public/audio/v1/shop-north-welcome.mp3)
- [public/audio/v1/shop-thanks.mp3](../../public/audio/v1/shop-thanks.mp3)
- [public/audio/v1/shop-welcome.mp3](../../public/audio/v1/shop-welcome.mp3)
- [public/audio/v1/splash.mp3](../../public/audio/v1/splash.mp3)
- [public/audio/v1/step-carpet-0.mp3](../../public/audio/v1/step-carpet-0.mp3)
- [public/audio/v1/step-carpet-1.mp3](../../public/audio/v1/step-carpet-1.mp3)
- [public/audio/v1/step-carpet-2.mp3](../../public/audio/v1/step-carpet-2.mp3)
- [public/audio/v1/step-grass-0.mp3](../../public/audio/v1/step-grass-0.mp3)
- [public/audio/v1/step-grass-1.mp3](../../public/audio/v1/step-grass-1.mp3)
- [public/audio/v1/step-grass-2.mp3](../../public/audio/v1/step-grass-2.mp3)
- [public/audio/v1/step-snow-0.mp3](../../public/audio/v1/step-snow-0.mp3)
- [public/audio/v1/step-snow-1.mp3](../../public/audio/v1/step-snow-1.mp3)
- [public/audio/v1/step-snow-2.mp3](../../public/audio/v1/step-snow-2.mp3)
- [public/audio/v1/step-stone-0.mp3](../../public/audio/v1/step-stone-0.mp3)
- [public/audio/v1/step-stone-1.mp3](../../public/audio/v1/step-stone-1.mp3)
- [public/audio/v1/step-stone-2.mp3](../../public/audio/v1/step-stone-2.mp3)
- [public/audio/v1/step-wood-0.mp3](../../public/audio/v1/step-wood-0.mp3)
- [public/audio/v1/step-wood-1.mp3](../../public/audio/v1/step-wood-1.mp3)
- [public/audio/v1/step-wood-2.mp3](../../public/audio/v1/step-wood-2.mp3)
- [public/audio/v1/water.mp3](../../public/audio/v1/water.mp3)
- [public/favicon.svg](../../public/favicon.svg)
- [public/file.svg](../../public/file.svg)
- [public/fonts/dm-sans-latin.woff2](../../public/fonts/dm-sans-latin.woff2)
- [public/fonts/dmsans-OFL.txt](../../public/fonts/dmsans-OFL.txt)
- [public/fonts/marcellus-OFL.txt](../../public/fonts/marcellus-OFL.txt)
- [public/fonts/marcellus-latin.woff2](../../public/fonts/marcellus-latin.woff2)
- [public/globe.svg](../../public/globe.svg)
- [public/models/tripo-v1/cart.glb](../../public/models/tripo-v1/cart.glb)
- [public/models/tripo-v1/fishing.glb](../../public/models/tripo-v1/fishing.glb)
- [public/models/tripo-v1/galleon.glb](../../public/models/tripo-v1/galleon.glb)
- [public/models/tripo-v1/horse.glb](../../public/models/tripo-v1/horse.glb)
- [public/models/tripo-v1/pine.glb](../../public/models/tripo-v1/pine.glb)
- [public/models/tripo-v1/shelf.glb](../../public/models/tripo-v1/shelf.glb)
- [public/models/tripo-v1/stable.glb](../../public/models/tripo-v1/stable.glb)
- [public/models/tripo-v1/worker.glb](../../public/models/tripo-v1/worker.glb)
- [public/window.svg](../../public/window.svg)

## scripts (61 archivos)

Herramientas de desarrollo, preparación, empaquetado y verificación.

- [scripts/audit-publication.mjs](../../scripts/audit-publication.mjs)
- [scripts/board-exploration-network.mjs](../../scripts/board-exploration-network.mjs)
- [scripts/build-verified.sh](../../scripts/build-verified.sh)
- [scripts/catalog-modules.mjs](../../scripts/catalog-modules.mjs)
- [scripts/classify-exploration-vehicles.mjs](../../scripts/classify-exploration-vehicles.mjs)
- [scripts/complete-tripo-fleet.mjs](../../scripts/complete-tripo-fleet.mjs)
- [scripts/connect-world-maritime.mjs](../../scripts/connect-world-maritime.mjs)
- [scripts/connector-preview/connector-preview-session.mjs](../../scripts/connector-preview/connector-preview-session.mjs)
- [scripts/connector-preview/host-binding.mjs](../../scripts/connector-preview/host-binding.mjs) — `createPreviewBinding`, `readBounded`
- [scripts/connector-preview/protocol.mjs](../../scripts/connector-preview/protocol.mjs) — `invocationSchema`, `grantSchema`, `grantsSchema`, `sessionOptionsSchema`, `driverMessageSchema`
- [scripts/execution-profile.mjs](../../scripts/execution-profile.mjs) — `readExecutionProfile`
- [scripts/export-package.mjs](../../scripts/export-package.mjs)
- [scripts/export-royal-navigation.mjs](../../scripts/export-royal-navigation.mjs)
- [scripts/generate-exploration-network.mjs](../../scripts/generate-exploration-network.mjs)
- [scripts/grade-exploration-network.mjs](../../scripts/grade-exploration-network.mjs)
- [scripts/inspect-tripo-ships.mjs](../../scripts/inspect-tripo-ships.mjs)
- [scripts/install-ci.mjs](../../scripts/install-ci.mjs)
- [scripts/install-ci.sh](../../scripts/install-ci.sh)
- [scripts/install-pnpm.sh](../../scripts/install-pnpm.sh)
- [scripts/integrate-tripo-ships.mjs](../../scripts/integrate-tripo-ships.mjs)
- [scripts/lib/exploration-network-geometry.mjs](../../scripts/lib/exploration-network-geometry.mjs) — `seaHullLineClear`, `coachBodyClear`, `validateNetworkGeometry`
- [scripts/load-test-baseline.json](../../scripts/load-test-baseline.json)
- [scripts/load-test-compare.mjs](../../scripts/load-test-compare.mjs) — `compareLoadReports`
- [scripts/load-test-identity.mjs](../../scripts/load-test-identity.mjs) — `inspectLoadEngine`
- [scripts/load-test-index-health.mjs](../../scripts/load-test-index-health.mjs) — `readPartitionedIndexHealth`
- [scripts/load-test-partitioned.mjs](../../scripts/load-test-partitioned.mjs) — `createLoadStore`
- [scripts/load-test-request-metrics.mjs](../../scripts/load-test-request-metrics.mjs) — `summarizeStoreRequests`
- [scripts/load-test-settlement-verifier.mjs](../../scripts/load-test-settlement-verifier.mjs) — `SHARED_SETTLEMENT_BUDGET_ERROR`, `expiredSharedLeaseKeys`, `readSettlementWithProgress`
- [scripts/load-test-support.mjs](../../scripts/load-test-support.mjs) — `DEFAULT_ROW_LIMIT_BYTES`, `summary`, `seededSchedule`, `createLoadStore`, `economicInventory`, `assertScenarioIntegrity`, `assertLoadWorldIdentifiers`
- [scripts/load-test.README.md](../../scripts/load-test.README.md)
- [scripts/load-test.mjs](../../scripts/load-test.mjs)
- [scripts/npm-install.mjs](../../scripts/npm-install.mjs) — `NpmCacheProgress`, `runNpmInstall`
- [scripts/pnpm-install.mjs](../../scripts/pnpm-install.mjs) — `InstallProgress`
- [scripts/polish-tripo-ships.mjs](../../scripts/polish-tripo-ships.mjs) — `RoyalHarborController`
- [scripts/prepare-audio-assets.mjs](../../scripts/prepare-audio-assets.mjs)
- [scripts/prepare-tripo-cart.mjs](../../scripts/prepare-tripo-cart.mjs)
- [scripts/prepare-tripo-ships.mjs](../../scripts/prepare-tripo-ships.mjs) — `TRIPO_SHIP_ASSETS`
- [scripts/prepare-tripo-stable.mjs](../../scripts/prepare-tripo-stable.mjs)
- [scripts/private-pc-backup.mjs](../../scripts/private-pc-backup.mjs) — `backupPrivatePcProfile`
- [scripts/private-pc-camera-baseline.mjs](../../scripts/private-pc-camera-baseline.mjs) — `getMvpStore`
- [scripts/private-pc-camera-release-check.mjs](../../scripts/private-pc-camera-release-check.mjs) — `getMvpStore`
- [scripts/private-pc-camera-save-check.mjs](../../scripts/private-pc-camera-save-check.mjs) — `compareCameraSaveStates`, `comparePrivatePcCameraBackups`
- [scripts/private-pc-control.ps1](../../scripts/private-pc-control.ps1)
- [scripts/private-pc-exploration-checkpoint.mjs](../../scripts/private-pc-exploration-checkpoint.mjs) — `compareExplorationCheckpoints`, `inspectPrivatePcExplorationCheckpoint`
- [scripts/private-pc-exploration-release-check.mjs](../../scripts/private-pc-exploration-release-check.mjs) — `compareExplorationReleaseSources`, `qualifiesExplorationBuild`, `qualifiesPinnedExplorationRuntime`, `checkPrivatePcExplorationRelease`, `getMvpStore`
- [scripts/private-pc-exploration-save-check.mjs](../../scripts/private-pc-exploration-save-check.mjs) — `validManualNavigationSave`, `validExplorationSave`, `compareExplorationSaveStates`, `comparePrivatePcExplorationBackups`
- [scripts/private-pc-origin-check.mjs](../../scripts/private-pc-origin-check.mjs)
- [scripts/private-pc-preservation.mjs](../../scripts/private-pc-preservation.mjs)
- [scripts/private-pc-runtime.mjs](../../scripts/private-pc-runtime.mjs) — `settingsValid`, `localConfig`
- [scripts/private-pc-scheduled-run.ps1](../../scripts/private-pc-scheduled-run.ps1)
- [scripts/private-pc-supervisor.mjs](../../scripts/private-pc-supervisor.mjs) — `powerShellEnvironment`, `splitWindowsCommandLine`, `sanitizeLogText`, `retryDelay`, `identityMatches`, `validateScheduledSupervisorTask`, `validatePrivateOriginResponse`, `probePrivateOrigin`…
- [scripts/refine-exploration-infrastructure.mjs](../../scripts/refine-exploration-infrastructure.mjs)
- [scripts/refine-exploration-network.mjs](../../scripts/refine-exploration-network.mjs)
- [scripts/rehearse-partitioned-store.mjs](../../scripts/rehearse-partitioned-store.mjs)
- [scripts/reviewed-village-id-contract.json](../../scripts/reviewed-village-id-contract.json)
- [scripts/run-framework.mjs](../../scripts/run-framework.mjs)
- [scripts/sites-env.mjs](../../scripts/sites-env.mjs) — `projectRoot`
- [scripts/sites-env.sh](../../scripts/sites-env.sh)
- [scripts/test-partitioned-preload.mjs](../../scripts/test-partitioned-preload.mjs) — `sqlBridge`, `recordEngineEntry`
- [scripts/test-partitioned-store.mjs](../../scripts/test-partitioned-store.mjs)
- [scripts/validate-exploration-network.mjs](../../scripts/validate-exploration-network.mjs)

## tests (198 archivos)

Casos de regresión y contratos de dominio/persistencia/gráficos.

- [tests/audio-engine.test.ts](../../tests/audio-engine.test.ts)
- [tests/audio-world.test.ts](../../tests/audio-world.test.ts)
- [tests/client-activity-notifications.test.ts](../../tests/client-activity-notifications.test.ts)
- [tests/client-level-notifications.test.ts](../../tests/client-level-notifications.test.ts)
- [tests/client-navigation.test.ts](../../tests/client-navigation.test.ts)
- [tests/client-quick-command.test.ts](../../tests/client-quick-command.test.ts)
- [tests/client-royal-harbor-trade.test.ts](../../tests/client-royal-harbor-trade.test.ts)
- [tests/client-stock-options.test.ts](../../tests/client-stock-options.test.ts)
- [tests/cloudflare-access.test.ts](../../tests/cloudflare-access.test.ts)
- [tests/cloudflare-worker.test.ts](../../tests/cloudflare-worker.test.ts)
- [tests/district-controls.test.ts](../../tests/district-controls.test.ts)
- [tests/exploration-panel-ssr.test.ts](../../tests/exploration-panel-ssr.test.ts)
- [tests/fixtures/manager-operator.ts](../../tests/fixtures/manager-operator.ts)
- [tests/graphics-async-viewer.test.ts](../../tests/graphics-async-viewer.test.ts)
- [tests/graphics-atlas.test.ts](../../tests/graphics-atlas.test.ts)
- [tests/graphics-biome-settlement-models.test.ts](../../tests/graphics-biome-settlement-models.test.ts)
- [tests/graphics-build.test.ts](../../tests/graphics-build.test.ts)
- [tests/graphics-city-granary.test.ts](../../tests/graphics-city-granary.test.ts)
- [tests/graphics-city-shop.test.ts](../../tests/graphics-city-shop.test.ts)
- [tests/graphics-city-stable.test.ts](../../tests/graphics-city-stable.test.ts)
- [tests/graphics-continuous.test.ts](../../tests/graphics-continuous.test.ts)
- [tests/graphics-district-navigation.test.ts](../../tests/graphics-district-navigation.test.ts)
- [tests/graphics-district-renderer-lifecycle.test.ts](../../tests/graphics-district-renderer-lifecycle.test.ts)
- [tests/graphics-exploration-district.test.ts](../../tests/graphics-exploration-district.test.ts)
- [tests/graphics-exploration-traffic-layer.test.ts](../../tests/graphics-exploration-traffic-layer.test.ts)
- [tests/graphics-exploration-transport.test.ts](../../tests/graphics-exploration-transport.test.ts)
- [tests/graphics-fishing-community-data.test.ts](../../tests/graphics-fishing-community-data.test.ts)
- [tests/graphics-fishing-community-models.test.ts](../../tests/graphics-fishing-community-models.test.ts)
- [tests/graphics-fishing-community.test.ts](../../tests/graphics-fishing-community.test.ts)
- [tests/graphics-fishing-network-data.test.ts](../../tests/graphics-fishing-network-data.test.ts)
- [tests/graphics-fishing-network.test.ts](../../tests/graphics-fishing-network.test.ts)
- [tests/graphics-habitable-circuit.test.ts](../../tests/graphics-habitable-circuit.test.ts)
- [tests/graphics-habitable-commerce.test.ts](../../tests/graphics-habitable-commerce.test.ts)
- [tests/graphics-habitable-economy.test.ts](../../tests/graphics-habitable-economy.test.ts)
- [tests/graphics-habitable-industry.test.ts](../../tests/graphics-habitable-industry.test.ts)
- [tests/graphics-habitable-needs.test.ts](../../tests/graphics-habitable-needs.test.ts)
- [tests/graphics-habitable-workers.test.ts](../../tests/graphics-habitable-workers.test.ts)
- [tests/graphics-habitable.test.ts](../../tests/graphics-habitable.test.ts)
- [tests/graphics-inhabited-world-data.test.ts](../../tests/graphics-inhabited-world-data.test.ts)
- [tests/graphics-inhabited-world.test.ts](../../tests/graphics-inhabited-world.test.ts)
- [tests/graphics-land-development.test.ts](../../tests/graphics-land-development.test.ts)
- [tests/graphics-land-infrastructure.test.ts](../../tests/graphics-land-infrastructure.test.ts)
- [tests/graphics-land-terrain.test.ts](../../tests/graphics-land-terrain.test.ts)
- [tests/graphics-living-actor-lod.test.ts](../../tests/graphics-living-actor-lod.test.ts)
- [tests/graphics-living-actors.test.ts](../../tests/graphics-living-actors.test.ts)
- [tests/graphics-living-zone.test.ts](../../tests/graphics-living-zone.test.ts)
- [tests/graphics-maritime-water.test.ts](../../tests/graphics-maritime-water.test.ts)
- [tests/graphics-models.test.ts](../../tests/graphics-models.test.ts)
- [tests/graphics-planet-data.test.ts](../../tests/graphics-planet-data.test.ts)
- [tests/graphics-planet-lifecycle.test.ts](../../tests/graphics-planet-lifecycle.test.ts)
- [tests/graphics-planet-surface.test.ts](../../tests/graphics-planet-surface.test.ts)
- [tests/graphics-public-infrastructure.test.ts](../../tests/graphics-public-infrastructure.test.ts)
- [tests/graphics-public-station-layout.test.ts](../../tests/graphics-public-station-layout.test.ts)
- [tests/graphics-regional-scale.test.ts](../../tests/graphics-regional-scale.test.ts)
- [tests/graphics-royal-citadel-flags.test.ts](../../tests/graphics-royal-citadel-flags.test.ts)
- [tests/graphics-royal-citadel-gardens.test.ts](../../tests/graphics-royal-citadel-gardens.test.ts)
- [tests/graphics-royal-citadel-interior-coherence.test.ts](../../tests/graphics-royal-citadel-interior-coherence.test.ts)
- [tests/graphics-royal-citadel-interior-layout.test.ts](../../tests/graphics-royal-citadel-interior-layout.test.ts)
- [tests/graphics-royal-citadel-interior-life.test.ts](../../tests/graphics-royal-citadel-interior-life.test.ts)
- [tests/graphics-royal-citadel-interior.test.ts](../../tests/graphics-royal-citadel-interior.test.ts)
- [tests/graphics-royal-citadel-life.test.ts](../../tests/graphics-royal-citadel-life.test.ts)
- [tests/graphics-royal-citadel-navigation.test.ts](../../tests/graphics-royal-citadel-navigation.test.ts)
- [tests/graphics-royal-citadel-terraces.test.ts](../../tests/graphics-royal-citadel-terraces.test.ts)
- [tests/graphics-royal-connected-travel.test.ts](../../tests/graphics-royal-connected-travel.test.ts)
- [tests/graphics-royal-gameplay.test.ts](../../tests/graphics-royal-gameplay.test.ts)
- [tests/graphics-royal-grand-bridge.test.ts](../../tests/graphics-royal-grand-bridge.test.ts)
- [tests/graphics-royal-harbor-activity.test.ts](../../tests/graphics-royal-harbor-activity.test.ts)
- [tests/graphics-royal-harbor-castle.test.ts](../../tests/graphics-royal-harbor-castle.test.ts)
- [tests/graphics-royal-harbor-layout.test.ts](../../tests/graphics-royal-harbor-layout.test.ts)
- [tests/graphics-royal-harbor-materials.test.ts](../../tests/graphics-royal-harbor-materials.test.ts)
- [tests/graphics-royal-harbor-scene.test.ts](../../tests/graphics-royal-harbor-scene.test.ts)
- [tests/graphics-royal-harbor-ships.test.ts](../../tests/graphics-royal-harbor-ships.test.ts)
- [tests/graphics-royal-harbor-town.test.ts](../../tests/graphics-royal-harbor-town.test.ts)
- [tests/graphics-royal-harbor-water.test.ts](../../tests/graphics-royal-harbor-water.test.ts)
- [tests/graphics-royal-human-scale.test.ts](../../tests/graphics-royal-human-scale.test.ts)
- [tests/graphics-royal-integration.test.ts](../../tests/graphics-royal-integration.test.ts)
- [tests/graphics-royal-old-town.test.ts](../../tests/graphics-royal-old-town.test.ts)
- [tests/graphics-royal-palace-coherence.test.ts](../../tests/graphics-royal-palace-coherence.test.ts)
- [tests/graphics-royal-regional-coherence.test.ts](../../tests/graphics-royal-regional-coherence.test.ts)
- [tests/graphics-royal-urban-plan.test.ts](../../tests/graphics-royal-urban-plan.test.ts)
- [tests/graphics-royal-world.test.ts](../../tests/graphics-royal-world.test.ts)
- [tests/graphics-scene.test.ts](../../tests/graphics-scene.test.ts)
- [tests/graphics-settlement-architecture.test.ts](../../tests/graphics-settlement-architecture.test.ts)
- [tests/graphics-settlement.test.ts](../../tests/graphics-settlement.test.ts)
- [tests/graphics-shop-handling.test.ts](../../tests/graphics-shop-handling.test.ts)
- [tests/graphics-shop-packer-motion.test.ts](../../tests/graphics-shop-packer-motion.test.ts)
- [tests/graphics-tavern-supply.test.ts](../../tests/graphics-tavern-supply.test.ts)
- [tests/graphics-terrain-ramps.test.ts](../../tests/graphics-terrain-ramps.test.ts)
- [tests/graphics-terrain-surface.test.ts](../../tests/graphics-terrain-surface.test.ts)
- [tests/graphics-trade-routes.test.ts](../../tests/graphics-trade-routes.test.ts)
- [tests/graphics-tripo-resident.test.ts](../../tests/graphics-tripo-resident.test.ts)
- [tests/graphics-tripo-ships.test.ts](../../tests/graphics-tripo-ships.test.ts)
- [tests/graphics-tripo-transport.test.ts](../../tests/graphics-tripo-transport.test.ts)
- [tests/graphics-tripo-voxel-pilot.test.ts](../../tests/graphics-tripo-voxel-pilot.test.ts)
- [tests/graphics-urban-detail.test.ts](../../tests/graphics-urban-detail.test.ts)
- [tests/graphics-viewer-lifecycle.test.ts](../../tests/graphics-viewer-lifecycle.test.ts)
- [tests/graphics-viewer-ssr.test.ts](../../tests/graphics-viewer-ssr.test.ts)
- [tests/graphics-world-camera.test.ts](../../tests/graphics-world-camera.test.ts)
- [tests/graphics-world-collision.test.ts](../../tests/graphics-world-collision.test.ts)
- [tests/graphics-world-geography.test.ts](../../tests/graphics-world-geography.test.ts)
- [tests/graphics-world-landmarks.test.ts](../../tests/graphics-world-landmarks.test.ts)
- [tests/graphics-world-navigation.test.ts](../../tests/graphics-world-navigation.test.ts)
- [tests/graphics-world-npc-yield.test.ts](../../tests/graphics-world-npc-yield.test.ts)
- [tests/graphics-world-sky.test.ts](../../tests/graphics-world-sky.test.ts)
- [tests/graphics-world-terrain.test.ts](../../tests/graphics-world-terrain.test.ts)
- [tests/helpers/glb-offline.ts](../../tests/helpers/glb-offline.ts) — `readOfflineGlb`
- [tests/load-testing.test.ts](../../tests/load-testing.test.ts) — `version`, `scoped`
- [tests/mvp-activity-progression.test.ts](../../tests/mvp-activity-progression.test.ts)
- [tests/mvp-availability-http.test.ts](../../tests/mvp-availability-http.test.ts) — `getChatGPTUser`
- [tests/mvp-boost-passes.test.ts](../../tests/mvp-boost-passes.test.ts)
- [tests/mvp-boost-quote-transition.test.ts](../../tests/mvp-boost-quote-transition.test.ts)
- [tests/mvp-bounded-engine-reads.test.ts](../../tests/mvp-bounded-engine-reads.test.ts)
- [tests/mvp-bounded-load-metrics.test.ts](../../tests/mvp-bounded-load-metrics.test.ts)
- [tests/mvp-bounded-maintenance.test.ts](../../tests/mvp-bounded-maintenance.test.ts)
- [tests/mvp-bounded-production.test.ts](../../tests/mvp-bounded-production.test.ts)
- [tests/mvp-bounded-read-audit.test.ts](../../tests/mvp-bounded-read-audit.test.ts)
- [tests/mvp-central-village.test.ts](../../tests/mvp-central-village.test.ts)
- [tests/mvp-city-shop-commerce.test.ts](../../tests/mvp-city-shop-commerce.test.ts)
- [tests/mvp-city-shop-production.test.ts](../../tests/mvp-city-shop-production.test.ts)
- [tests/mvp-city-shop.test.ts](../../tests/mvp-city-shop.test.ts)
- [tests/mvp-commerce-accounting.test.ts](../../tests/mvp-commerce-accounting.test.ts)
- [tests/mvp-config.test.ts](../../tests/mvp-config.test.ts)
- [tests/mvp-construction-supply.test.ts](../../tests/mvp-construction-supply.test.ts)
- [tests/mvp-engine.test.ts](../../tests/mvp-engine.test.ts)
- [tests/mvp-entity-versions.test.ts](../../tests/mvp-entity-versions.test.ts)
- [tests/mvp-exploration-network.test.ts](../../tests/mvp-exploration-network.test.ts)
- [tests/mvp-exploration-traffic.test.ts](../../tests/mvp-exploration-traffic.test.ts)
- [tests/mvp-exploration-vessel.test.ts](../../tests/mvp-exploration-vessel.test.ts)
- [tests/mvp-exploration.test.ts](../../tests/mvp-exploration.test.ts)
- [tests/mvp-first-trade.test.ts](../../tests/mvp-first-trade.test.ts)
- [tests/mvp-habitable-buildings.test.ts](../../tests/mvp-habitable-buildings.test.ts)
- [tests/mvp-habitable-commerce.test.ts](../../tests/mvp-habitable-commerce.test.ts)
- [tests/mvp-habitable-daily.test.ts](../../tests/mvp-habitable-daily.test.ts)
- [tests/mvp-habitable-industry.test.ts](../../tests/mvp-habitable-industry.test.ts)
- [tests/mvp-habitable-logistics.test.ts](../../tests/mvp-habitable-logistics.test.ts)
- [tests/mvp-habitable.test.ts](../../tests/mvp-habitable.test.ts)
- [tests/mvp-invitations.test.ts](../../tests/mvp-invitations.test.ts)
- [tests/mvp-land-civil.test.ts](../../tests/mvp-land-civil.test.ts)
- [tests/mvp-land-expansion.test.ts](../../tests/mvp-land-expansion.test.ts)
- [tests/mvp-level-unlocks.test.ts](../../tests/mvp-level-unlocks.test.ts)
- [tests/mvp-load-index-health.test.ts](../../tests/mvp-load-index-health.test.ts)
- [tests/mvp-load-settlement-verification.test.ts](../../tests/mvp-load-settlement-verification.test.ts)
- [tests/mvp-manager-forecast.test.ts](../../tests/mvp-manager-forecast.test.ts)
- [tests/mvp-manager-industry.test.ts](../../tests/mvp-manager-industry.test.ts)
- [tests/mvp-manager-operator.test.ts](../../tests/mvp-manager-operator.test.ts)
- [tests/mvp-manager-quotes.test.ts](../../tests/mvp-manager-quotes.test.ts)
- [tests/mvp-manager-reservations.test.ts](../../tests/mvp-manager-reservations.test.ts)
- [tests/mvp-manager-supply.test.ts](../../tests/mvp-manager-supply.test.ts)
- [tests/mvp-manager-transport.test.ts](../../tests/mvp-manager-transport.test.ts)
- [tests/mvp-manual-navigation.test.ts](../../tests/mvp-manual-navigation.test.ts)
- [tests/mvp-partitioned-store.test.ts](../../tests/mvp-partitioned-store.test.ts)
- [tests/mvp-player-collision.test.ts](../../tests/mvp-player-collision.test.ts)
- [tests/mvp-player-progress.test.ts](../../tests/mvp-player-progress.test.ts)
- [tests/mvp-player-reads.test.ts](../../tests/mvp-player-reads.test.ts)
- [tests/mvp-production-manager.test.ts](../../tests/mvp-production-manager.test.ts) — `getChatGPTUser`
- [tests/mvp-production.test.ts](../../tests/mvp-production.test.ts)
- [tests/mvp-projection-load-observation.test.ts](../../tests/mvp-projection-load-observation.test.ts)
- [tests/mvp-projection-request-metrics.test.ts](../../tests/mvp-projection-request-metrics.test.ts)
- [tests/mvp-projection-reuse.test.ts](../../tests/mvp-projection-reuse.test.ts)
- [tests/mvp-resident-relocation.test.ts](../../tests/mvp-resident-relocation.test.ts)
- [tests/mvp-road-routes.test.ts](../../tests/mvp-road-routes.test.ts)
- [tests/mvp-royal-harbor.test.ts](../../tests/mvp-royal-harbor.test.ts)
- [tests/mvp-royal-kingdom.test.ts](../../tests/mvp-royal-kingdom.test.ts)
- [tests/mvp-scoped-quotes.test.ts](../../tests/mvp-scoped-quotes.test.ts)
- [tests/mvp-settlements.test.ts](../../tests/mvp-settlements.test.ts)
- [tests/mvp-shop-handling.test.ts](../../tests/mvp-shop-handling.test.ts)
- [tests/mvp-social.test.ts](../../tests/mvp-social.test.ts)
- [tests/mvp-station-upgrades.test.ts](../../tests/mvp-station-upgrades.test.ts)
- [tests/mvp-tavern-supply.test.ts](../../tests/mvp-tavern-supply.test.ts)
- [tests/mvp-territory.test.ts](../../tests/mvp-territory.test.ts)
- [tests/mvp-test-boosts.test.ts](../../tests/mvp-test-boosts.test.ts)
- [tests/mvp-transferable-craft.test.ts](../../tests/mvp-transferable-craft.test.ts)
- [tests/mvp-village-account-allowance.test.ts](../../tests/mvp-village-account-allowance.test.ts)
- [tests/mvp-village-account-bootstrap.test.ts](../../tests/mvp-village-account-bootstrap.test.ts)
- [tests/mvp-village-boost-identity.test.ts](../../tests/mvp-village-boost-identity.test.ts)
- [tests/mvp-village-chronicle-index.test.ts](../../tests/mvp-village-chronicle-index.test.ts)
- [tests/mvp-village-concurrent-index-health.test.ts](../../tests/mvp-village-concurrent-index-health.test.ts)
- [tests/mvp-village-engine.test.ts](../../tests/mvp-village-engine.test.ts)
- [tests/mvp-village-fixture-metadata.test.ts](../../tests/mvp-village-fixture-metadata.test.ts)
- [tests/mvp-village-index-coverage.test.ts](../../tests/mvp-village-index-coverage.test.ts)
- [tests/mvp-village-load-bridge.test.ts](../../tests/mvp-village-load-bridge.test.ts)
- [tests/mvp-village-maintenance-store.test.ts](../../tests/mvp-village-maintenance-store.test.ts)
- [tests/mvp-village-maintenance.test.ts](../../tests/mvp-village-maintenance.test.ts)
- [tests/mvp-village-read-freshness.test.ts](../../tests/mvp-village-read-freshness.test.ts)
- [tests/mvp-village-semantics.test.ts](../../tests/mvp-village-semantics.test.ts)
- [tests/mvp-village-settlement.test.ts](../../tests/mvp-village-settlement.test.ts)
- [tests/mvp-village-snapshot-store.test.ts](../../tests/mvp-village-snapshot-store.test.ts)
- [tests/mvp-village-writes.test.ts](../../tests/mvp-village-writes.test.ts)
- [tests/private-pc-camera-save-check.test.ts](../../tests/private-pc-camera-save-check.test.ts)
- [tests/private-pc-exploration-checkpoint.test.ts](../../tests/private-pc-exploration-checkpoint.test.ts)
- [tests/private-pc-exploration-release-check.test.ts](../../tests/private-pc-exploration-release-check.test.ts)
- [tests/private-pc-exploration-save-check.test.ts](../../tests/private-pc-exploration-save-check.test.ts)
- [tests/private-pc-runtime.test.ts](../../tests/private-pc-runtime.test.ts)
- [tests/private-pc-supervisor.test.ts](../../tests/private-pc-supervisor.test.ts)
- [tests/storage-availability.test.ts](../../tests/storage-availability.test.ts) — `env`
- [tests/support/d1-sqlite.ts](../../tests/support/d1-sqlite.ts) — `SqliteQueryTrace`, `SqliteCall`, `SqliteFault`, `SqliteD1Options`, `SqliteD1`, `SqliteD1Statement`, `createSqliteD1`
- [tests/support/read-audit-d1.ts](../../tests/support/read-audit-d1.ts) — `AuditedRead`, `auditReadD1`
- [tests/travel-physics-lab.test.ts](../../tests/travel-physics-lab.test.ts)

## docs (42 archivos)

Diseños, límites e informes históricos redactados.

- [docs/BOUNDED-READS-QA.md](../../docs/BOUNDED-READS-QA.md)
- [docs/BOUNDED-VILLAGE-READS.md](../../docs/BOUNDED-VILLAGE-READS.md)
- [docs/CAMINOS-PUENTE-Y-RECICLAJE.md](../../docs/CAMINOS-PUENTE-Y-RECICLAJE.md)
- [docs/CLOUDFLARE-VERIFICACION.md](../../docs/CLOUDFLARE-VERIFICACION.md)
- [docs/COMUNIDAD-PESQUERA.md](../../docs/COMUNIDAD-PESQUERA.md)
- [docs/DISENO-MUNDO-HABITABLE.md](../../docs/DISENO-MUNDO-HABITABLE.md)
- [docs/DISTRITO-JUGABLE.md](../../docs/DISTRITO-JUGABLE.md)
- [docs/EXPANSION-TERRITORIAL.md](../../docs/EXPANSION-TERRITORIAL.md)
- [docs/GAME-MVP.md](../../docs/GAME-MVP.md)
- [docs/INDUSTRIA-Y-COMERCIO.md](../../docs/INDUSTRIA-Y-COMERCIO.md)
- [docs/JORNADA-Y-ALMACEN.md](../../docs/JORNADA-Y-ALMACEN.md)
- [docs/LEVEL-UNLOCKS.md](../../docs/LEVEL-UNLOCKS.md)
- [docs/MUNDO-CONTINUO.md](../../docs/MUNDO-CONTINUO.md)
- [docs/MUNDO-PLANETARIO.md](../../docs/MUNDO-PLANETARIO.md)
- [docs/NOTIFICATIONS-XP.md](../../docs/NOTIFICATIONS-XP.md)
- [docs/PLAYER-READS-AND-VERSIONS.md](../../docs/PLAYER-READS-AND-VERSIONS.md)
- [docs/POBLADOS-POR-BIOMA.md](../../docs/POBLADOS-POR-BIOMA.md)
- [docs/PRIVATE-PC-CAMERAS.md](../../docs/PRIVATE-PC-CAMERAS.md)
- [docs/PRIVATE-PC-EXPLORATION-RELEASE.md](../../docs/PRIVATE-PC-EXPLORATION-RELEASE.md)
- [docs/PRIVATE-PC-EXPLORATION.md](../../docs/PRIVATE-PC-EXPLORATION.md)
- [docs/PRIVATE-PC-SERVER.md](../../docs/PRIVATE-PC-SERVER.md)
- [docs/PRIVATE-PC-TRAFFIC.md](../../docs/PRIVATE-PC-TRAFFIC.md)
- [docs/PRIVATE-PC-WORLD-TRAVEL.md](../../docs/PRIVATE-PC-WORLD-TRAVEL.md)
- [docs/PROJECTION-AND-SHARED-EXPIRY.md](../../docs/PROJECTION-AND-SHARED-EXPIRY.md)
- [docs/PROJECTION-EXPIRY-QA.md](../../docs/PROJECTION-EXPIRY-QA.md)
- [docs/RUTA-DEL-AMBAR.md](../../docs/RUTA-DEL-AMBAR.md)
- [docs/SCALABILITY-PLAN.md](../../docs/SCALABILITY-PLAN.md)
- [docs/TEST-BOOSTERS.md](../../docs/TEST-BOOSTERS.md)
- [docs/VILLAGE-WRITE-STORAGE.md](../../docs/VILLAGE-WRITE-STORAGE.md)
- [docs/VILLAGE-WRITES-AND-SETTLEMENT.md](../../docs/VILLAGE-WRITES-AND-SETTLEMENT.md)
- [docs/architecture/MODULES.md](../../docs/architecture/MODULES.md)
- [docs/architecture/OPERATIONS.md](../../docs/architecture/OPERATIONS.md)
- [docs/architecture/PRODUCTION.md](../../docs/architecture/PRODUCTION.md)
- [docs/architecture/PUBLICATION.md](../../docs/architecture/PUBLICATION.md)
- [docs/audio-stage1.md](../../docs/audio-stage1.md)
- [docs/royal-grand-bridge-stage1.md](../../docs/royal-grand-bridge-stage1.md)
- [docs/royal-old-town-stage1.md](../../docs/royal-old-town-stage1.md)
- [docs/royal-tavern-supply-stage2.md](../../docs/royal-tavern-supply-stage2.md)
- [docs/royal-urban-plan-stage1.md](../../docs/royal-urban-plan-stage1.md)
- [docs/shop-freight-stage1.md](../../docs/shop-freight-stage1.md)
- [docs/tripo-ships-stage1.md](../../docs/tripo-ships-stage1.md)
- [docs/tripo-stable-stage1.md](../../docs/tripo-stable-stage1.md)

## examples (2 archivos)

Ejemplo D1 independiente.

- [examples/d1/app/api/notes/route.ts](../../examples/d1/app/api/notes/route.ts) — `GET`, `POST`
- [examples/d1/db/schema.ts](../../examples/d1/db/schema.ts) — `notes`

## vendor (2 archivos)

Recursos de terceros con sus avisos.

- [vendor/shadcn-tailwind-4.13.0.LICENSE.md](../../vendor/shadcn-tailwind-4.13.0.LICENSE.md)
- [vendor/shadcn-tailwind-4.13.0.css](../../vendor/shadcn-tailwind-4.13.0.css)

## root (25 archivos)

Configuración, dependencias, seguridad y documentación principal.

- [.gitignore](../../.gitignore)
- [.npmrc](../../.npmrc)
- [DEPLOY-CLOUDFLARE.md](../../DEPLOY-CLOUDFLARE.md)
- [README.md](../../README.md)
- [SECURITY.md](../../SECURITY.md)
- [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)
- [cloudflare-env.d.ts](../../cloudflare-env.d.ts)
- [components.json](../../components.json)
- [drizzle.config.ts](../../drizzle.config.ts)
- [eslint.config.mjs](../../eslint.config.mjs)
- [framework-env.d.ts](../../framework-env.d.ts)
- [lib/connector-context.ts](../../lib/connector-context.ts) — `runWithConnectorBinding`, `getConnectorBinding`
- [lib/connector-contract.mts](../../lib/connector-contract.mts) — `Json`, `ConnectorFailureStatus`, `ConnectorContent`, `ConnectorResult`, `ConnectorBinding`, `ConnectorContext`, `createConnectors`
- [lib/connector-errors.mts](../../lib/connector-errors.mts) — `connectorResponse`, `connectorErrorRecovery`
- [lib/connector-preview.d.ts](../../lib/connector-preview.d.ts)
- [lib/connectors.ts](../../lib/connectors.ts) — `connectorsForRequest`
- [lib/utils.ts](../../lib/utils.ts) — `cn`
- [next.config.ts](../../next.config.ts)
- [package-lock.json](../../package-lock.json)
- [package.json](../../package.json)
- [postcss.config.mjs](../../postcss.config.mjs)
- [tsconfig.json](../../tsconfig.json)
- [vite.config.ts](../../vite.config.ts)
- [wrangler.example.jsonc](../../wrangler.example.jsonc)
- [wrangler.jsonc](../../wrangler.jsonc)

