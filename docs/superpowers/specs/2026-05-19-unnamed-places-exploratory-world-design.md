# Unnamed Places Exploratory World Design

Date: 2026-05-19
Status: Approved for planning
Product direction: Real-time exploratory world

## 1. Goals and Constraints

### Product goals

- Build a real-time exploratory geography renderer with a near-camera streaming window.
- Render terrain, rivers/water, roads, buildings, vegetation, and labels on-flight.
- Preserve geography-first realism with restrained artistic grading.

### Success criteria for first shippable milestone

- Visual quality: screenshots from three very different locations look consistently beautiful.
- Feature completeness: terrain/water/roads/buildings/vegetation/labels are present in most places.
- Runtime continuity: no persistent holes while moving through the world.

### Hard constraints

- Free/open data sources only for v1.
- Adaptive performance target: attempt 60 FPS and degrade gracefully toward 30 FPS under heavy load.

## 2. Architecture and Runtime Boundaries

Use a two-lane architecture with strict boundaries.

### 2.1 Streaming Core (truth lane)

Responsibilities:
- continuously provide coherent world data around camera
- schedule loading, prefetch, cache, eviction, and LOD transitions

Inputs:
- camera position, velocity, heading
- quality budget from adaptive controller

Outputs per tile:
- terrain mesh data
- hydro data (water masks/features)
- roads
- building geometry
- vegetation placement hints
- labels metadata

Rules:
- no artistic color decisions
- deterministic state transitions
- bounded memory
- graceful fallback on missing data

### 2.2 Visual Style Core (look lane)

Responsibilities:
- convert semantic tile outputs into final rendering look
- enforce scene-wide style coherence

Inputs:
- semantic tile layers from Streaming Core
- style profile and atmosphere settings

Outputs:
- shader/material parameters
- post-process grading parameters
- atmospheric scattering/fog settings

Rules:
- no network or tile scheduling
- no source-specific parsing

### 2.3 Tile runtime contract

Tile states:
- requested -> loading -> ready -> visible -> cooling -> evicted

Each tile tracks:
- geometry LOD
- semantic completeness score
- style profile version
- freshness timestamp

Missing data policy:
- missing buildings: neutral proxy massing where settlement is likely
- missing hydro: DEM-derived drainage tint fallback
- missing labels: suppress cleanly

## 3. Data Pipeline, Coverage, and Fallback

### 3.1 Multi-source stack (free-first)

- Terrain elevation: OpenTopography/SRTM path.
- Buildings/roads/water: OSM/Overpass and vector extraction.
- Landcover/vegetation guidance: raster mask analysis plus OSM natural/landuse when available.

### 3.2 Canonical internal schema

Normalize all incoming data into a canonical tile object with:
- terrain
- hydro
- roads
- buildings
- vegetationHints
- labels

Per-layer metadata:
- source
- confidence
- age
- coveragePercent

Renderer consumes canonical tiles only.

### 3.3 Coverage-aware rendering bands

Each layer has a runtime quality band:
- full: reliable data
- partial: sparse/noisy data
- absent: missing data

Rendering behavior:
- full: normal
- partial: simplified and visually de-emphasized
- absent: procedural fallback to avoid holes

### 3.4 v1 fallback rules

- Buildings absent: low-detail procedural urban mass based on road density.
- Rivers/water absent: infer valley/drainage hints from DEM slope/aspect/accumulation heuristics.
- Vegetation absent: slope and raster-index-driven sparse placement.
- Labels absent: hide labels.

### 3.5 Caching and prefetch

- Ring A: immediate visible load (highest priority).
- Ring B: predictive prefetch around likely camera movement.
- Persist processed canonical tiles with TTL and source hash.
- On network failure, render stale cache with subtle stale-data indicator.

## 4. Visual Language and Style System

### 4.1 Style pillars

- Geography is truth.
- Palette is expressive but restrained.
- Atmosphere defines mood.
- Material simplicity over texture clutter.

### 4.2 Style profiles

Profiles:
- Natural-Daylight (default v1)
- Golden-Hour
- Overcast-Cool

Profile controls:
- terrain ramps by elevation/slope
- water color/depth tint
- building albedo/roughness range
- atmosphere/fog
- post-process grade (contrast/saturation/tone curve)

### 4.3 Palette constraints for coherence

- Terrain lowlands: muted warm greens/earth.
- Terrain mids: neutral green-brown transition.
- Terrain highs: desaturated cool grays.
- Water: cooler and darker in depth, slightly brighter near shallow banks.
- Urban: narrow neutral palette band.
- Vegetation: limited hue variation; prefer value/saturation variation.

### 4.4 On-flight coherence rules

- Cross-tile ramp blending at boundaries.
- Global style profile version per session.
- LOD transition fades to avoid pop-in.
- Weather/time effects change gradually.

## 5. Performance, Adaptive Quality, and Scheduling

### 5.1 Global adaptive controller

Track rolling metrics:
- frame time
- tile load latency
- memory pressure proxy

Quality states:
- Q3 high
- Q2 medium
- Q1 low/stability floor

State transitions use hysteresis to prevent oscillation.

### 5.2 Quality knobs (degrade order)

1. vegetation density and distance
2. label density/update cadence
3. shadow resolution/distance
4. water shader complexity
5. building LOD radius
6. outer-ring terrain segment density
7. post-processing quality
8. render resolution scale (last resort)

### 5.3 Tile scheduler

Priority score factors:
- visibility/frustum
- camera motion prediction
- semantic importance bias

Queues:
- critical
- prefetch
- background

Separate concurrency caps for:
- network fetch
- CPU decode
- GPU upload

### 5.4 LOD ring model

- Ring 0: full detail
- Ring 1: reduced detail
- Ring 2: simplified proxies/masks

Bounded churn rule:
- swap/fade no more than N tiles per frame

### 5.5 Stability guards

- hard memory budget + LRU eviction with cooldown
- source-specific timeout/circuit breaker
- stale render fallback + exponential retry backoff

## 6. Error Handling and Observability

### 6.1 Fault boundaries

- Source boundary: external API and conversion failures
- Tile boundary: malformed payload/decode errors
- Render boundary: shader/material/geometry initialization issues

Behavior policy:
- never stop camera exploration on tile failure
- substitute fallback representation
- log structured error events
- quarantine repeated failing source/tile combos temporarily

### 6.2 Debug instrumentation

Toggleable debug HUD:
- FPS/frame time
- active/loading/evicted tiles
- cache hit ratio
- per-layer visible coverage
- quality state transitions

Structured logs:
- source failures and retries
- shader compile issues
- memory pressure and eviction spikes

Deterministic screenshot mode:
- fixed camera + style seed for regression checks

## 7. Testing Strategy

### 7.1 Unit tests

- tile state machine transitions
- scheduler priority scoring
- canonical schema validation
- adaptive-quality hysteresis logic

### 7.2 Integration tests

- fetch -> normalize -> cache -> render neighborhood path
- fallback behavior per missing layer

### 7.3 Scenario tests

- dense urban location
- sparse mountainous location
- coastal/water-dominant location

### 7.4 Stability run

- 15+ minute free-fly session
- no crash/hang
- no runaway memory growth
- no persistent rendering holes

## 8. Milestone Plan

### M0 Runtime Backbone

- tile state machine
- ring scheduler
- canonical schema
- disk cache

### M1 Content Completeness Baseline

- terrain/water/roads/buildings/vegetation hints/labels
- coverage bands and fallback implementations

### M2 Style Coherence Pass

- Natural-Daylight profile
- cross-tile blending and LOD transition quality

### M3 Adaptive Performance Pass

- Q3/Q2/Q1 controller
- ordered quality degradation knobs

### M4 Validation and Polish

- scenario tests
- screenshot regressions
- soak test and readiness report

## 9. Out of Scope for v1

- continent/global high-detail streaming
- paid premium data providers
- cinematic-only offline render mode
- full weather simulation and season systems

## 10. Risks and Mitigations

- OSM incompleteness risk:
  - Mitigation: canonical coverage bands + procedural fallback.
- External API latency/availability risk:
  - Mitigation: aggressive caching + stale render mode + retry backoff.
- Visual inconsistency risk across regions:
  - Mitigation: strict style profiles and palette constraints.
- Runtime instability risk under load:
  - Mitigation: adaptive quality controller + memory caps + bounded tile churn.

## 11. Approval Summary

Approved decisions captured in this spec:
- Product type: real-time exploratory world.
- Scope: near-camera streaming window.
- Data policy: free/open only for v1.
- Visual direction: geography-first realism with restrained grading.
- Priorities: visual quality plus feature completeness, with adaptive performance behavior.
