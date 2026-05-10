# 11. Three.js for 3D Visualization

- **Status:** Accepted
- **Date:** 2024-05-13
- **Deciders:** Core maintainers, frontend lead
- **Related:** ADR-0024

## Context

The product's core differentiator is an interactive 3D cognitive map that
animates how cognitive threads weave together as a conversation evolves.
Performance targets are aggressive: 120 FPS on consumer hardware, 240 FPS on
high-end GPUs, smooth interaction with 500+ nodes, real-time updates with
<50 ms latency. The UX requires camera controls, picking, post-processing,
and animated transitions when new nodes and edges appear.

Three primary options exist in the browser today: raw WebGL/WebGPU,
Three.js (high-level abstraction over WebGL with a WebGPU backend), and
Babylon.js. SVG/HTML-based libraries (D3 force layouts) cannot meet the
3D and frame-rate targets.

## Decision

We adopt **Three.js** as the 3D rendering engine for the cognitive map and
**D3.js** for 2D auxiliary visualisations (timelines, small charts, the
temporal evolution panel).

1. **Rendering.** Three.js with the WebGPU backend where available, falling
   back to WebGL2.
2. **Layout.** Force-directed layouts are computed off the main thread in a
   Web Worker; node positions are streamed into the Three.js scene.
3. **Picking.** GPU-side picking for performance at 500+ nodes.
4. **State.** The scene is *derived* from the application state (ADR-0024);
   it is not a parallel source of truth.
5. **Animations.** Transitions on graph mutations use a small custom
   tweening layer rather than a heavy animation framework.
6. **Accessibility.** A non-3D fallback view (D3-based) is provided for
   users who cannot run WebGL or who require keyboard/screen-reader access.

## Consequences

### Positive

- Meets frame-rate targets with reasonable engineering effort.
- Large community, mature tooling, well-understood performance profile.
- Web Worker layout keeps the main thread responsive.

### Negative

- Three.js abstracts WebGL but is still a non-trivial dependency to keep
  current; major-version upgrades require visual regression review.
- 3D visualisations carry an accessibility cost; the fallback must be
  maintained alongside.
- WebGPU is still maturing; the WebGL2 fallback path must be tested
  continuously.

### Neutral

- We do not adopt a high-level scene-graph framework (e.g. R3F) yet; the
  scene is small enough that direct Three.js usage is clearer. We will
  reconsider if scene complexity grows.

## Alternatives Considered

### Babylon.js

Rejected: stronger for game-like scenes, weaker for the data-vis ergonomics
we need; smaller community in our subdomain.

### Raw WebGL/WebGPU

Rejected: implementation cost out of proportion to the benefit at our
scale.

### D3 force-directed in 2D only

Rejected: 3D is a product differentiator and the temporal layering is
hard to express in 2D.

## Compliance and Verification

- Visual regression tests via Playwright on a representative graph fixture.
- Performance benchmark in CI asserts 120 FPS on the reference hardware
  profile.
- Accessibility audit covers the 2D fallback view.

## References

- `src/client/components/`
- ADR-0024: Frontend state management
