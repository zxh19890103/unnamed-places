# Lancang-Mekong Streaming Geodata Pipeline Design

Date: 2026-05-20  
Status: Draft for review

## 1. Scope and Goals

### 1.1 Product Context
This project is an Electron + React + Three.js + Leaflet application that renders geospatial worlds with local server-backed terrain and OSM routes.

### 1.2 Chosen Scope
This design focuses on the first sub-project for a full end-to-end Lancang-Mekong vision:
- Streaming geodata pipeline only
- Efficiency-first runtime behavior
- River-following corridor chunking
- High-end desktop baseline for v1

### 1.3 In Scope
- Corridor-based chunk indexing and streaming manifests
- Two LOD tiers per chunk
- Server chunk assembly and cache strategy
- Client scheduling, memory budgets, and eviction
- Runtime degradation and recovery strategy
- Observability and acceptance criteria

### 1.4 Out of Scope
- Final cinematic flight controls and camera polish
- Full visual art pass for terrain/water/atmosphere
- Production legal/commercial imagery provider onboarding
- Route-wide final content QA across every country segment

## 2. Architecture

### 2.1 Primary Approach
Use a two-tier corridor streaming architecture.

Why:
- Better bandwidth efficiency than fixed global tiles for a long, narrow river route
- Lower implementation risk than fully adaptive irregular windows
- Directly aligns with efficiency-first constraints

### 2.2 Core Components

#### Server-side
- CorridorIndexer
  - Converts canonical river centerline into ordered chunk graph
  - Produces stable chunk IDs and neighbor relationships
- ChunkAssembler
  - Fetches source terrain/vector windows and normalizes into a chunk-local frame
- LODBuilder
  - Emits Tier A (coarse) and Tier B (detailed) artifacts
- ChunkCache
  - Multi-level cache keyed by chunk ID + layer + LOD + version
- StreamAPI
  - Returns forward-window manifests and payload references

#### Client-side
- StreamScheduler
  - Chooses which chunk/LOD to fetch based on camera progress and runtime budgets
- ChunkStore
  - Holds resident chunks under strict memory budgets
- SeamResolver
  - Maintains continuity across chunk boundaries and LOD transitions
- LayerCompositor
  - Combines terrain, rivers, roads, and buildings into render-ready data

### 2.3 Data Contracts
- Versioned chunk manifest schema
- Deterministic chunk key format
- Explicit downgrade path from Tier B to Tier A
- Provider-abstract imagery adapter interface (Google treated as future target)

## 3. Data Flow and Runtime Budgeting

### 3.1 Corridor Preprocessing
Input:
- Canonical source-to-mouth river centerline

Output:
- Versioned corridor index artifact with:
  - chunk IDs
  - chunk hulls
  - neighbor links
  - distance along route
  - expected LOD costs

### 3.2 Server Packaging Flow
For each chunk:
1. Resolve source windows for terrain and vectors.
2. Normalize layers to chunk-local coordinates.
3. Build Tier A and Tier B artifacts.
4. Publish immutable artifact blobs and manifest entries.

### 3.3 Client Streaming Windows
Three forward windows:
- Hot window: visible and near-term chunks (prefer Tier B)
- Warm window: soon-visible chunks (Tier A first)
- Cold window: manifest-only look-ahead

Priority order:
1. New Tier A ahead
2. Missing seam support in hot window
3. Tier B upgrades
4. Non-critical enrichments

### 3.4 Memory and Bandwidth Controls
Memory budgets:
- Geometry budget
- Texture/mask budget
- Vector feature budget

Eviction rules:
1. Evict rear chunks first.
2. Within same band, evict Tier B before Tier A.
3. Keep seam-supporting overlaps until neighbors stabilize.

Bandwidth controls:
- Per-layer concurrency caps
- Timeout/error backoff
- Optional bytes-per-second governor

### 3.5 Observability
Required metrics:
- Request count and cache hit ratio
- Bytes per kilometer traveled
- Tier A/Tier B residency ratio
- Visible pop-in event count
- Streaming/decode frame-time cost

Debug overlay:
- Chunk boundaries
- Hot/warm/cold window states
- Per-layer memory usage

## 4. Error Handling and Resilience

### 4.1 Failure Classes
- Upstream fetch failure:
  - Serve last-known artifact if available
  - Otherwise serve minimal Tier A placeholder (terrain shell + river centerline)
- Chunk build failure:
  - Mark degraded, retry with exponential backoff and per-chunk cooldown
- Partial layer failure:
  - Render available layers; never block full chunk on optional layer

### 4.2 Client Degradation Ladder
1. Pause Tier B promotion.
2. Shrink warm window distance.
3. Reduce non-critical vector density.
4. Run hot window in Tier A survival mode.

Recovery:
- Restore higher modes only after sustained healthy throughput/latency window

### 4.3 Continuity Safeguards
- Seam blend strips when adjacent LODs mismatch
- Temporal fade for chunk upgrades
- Never unload both sides of an active seam in one frame
- Hold-last-good for recently visible chunks during transient failures

### 4.4 Schema and Compatibility Handling
- Validate manifest schema at boundary
- Log structured errors with chunk key and producer version
- Allow compatibility adapter for known previous version only
- Skip incompatible chunk and continue neighbor path traversal

## 5. Testing Strategy and Acceptance Criteria

### 5.1 Test Levels
Unit tests:
- Chunk indexing determinism
- LOD selection correctness
- Eviction priority correctness

Integration tests:
- ChunkAssembler output schema validity
- Manifest compatibility behavior
- Cache hit/miss and invalidation behavior

System tests:
- Long corridor forward flight simulation
- Degradation and recovery transitions
- Seam continuity under LOD changes

### 5.2 Acceptance Criteria
Functional:
- Continuous forward traversal without hard stop when non-critical layers fail
- Tier A fallback always maintains flyable continuity

Efficiency-first:
- Bandwidth per distance at least 30% lower than fixed-tile baseline on the same route and speed profile
- Client streaming memory (geometry + textures/masks + vectors) capped at 2.5 GB with no monotonic growth over a 30-minute traversal

Stability:
- No fatal streaming pipeline crash under transient upstream failures in test profiles
- Validation failures isolated to affected chunks with actionable logs

Observability:
- Required metrics are emitted and queryable during tests
- Debug overlay accurately reflects chunk/window state

## 6. Notes for Planning Phase
Values to lock in during implementation planning:
- Startup flyable-segment deadline: <= 8 seconds on baseline test machine
- Streaming frame-time budget contribution: <= 4 ms average in steady flight
- Cache TTL default: 7 days for chunk artifacts, invalidated by routeVersion changes
- Target artifact sizes:
  - Tier A: <= 2 MB per chunk
  - Tier B: <= 12 MB per chunk
