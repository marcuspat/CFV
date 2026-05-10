# 07. Value Objects

Value objects are immutable, identity-less domain types defined entirely by
their attributes. Two value objects with the same attributes are equal.
Value objects are how we encode meaning into the type system: passing a
`Confidence` instead of a `number` makes "what is this 0.83?" obvious from
the call site.

## Design Rules

1. **Immutability.** No setters, no mutation methods. "Modifications"
   return a new instance.
2. **Self-validation.** Constructors reject invalid inputs (e.g.
   `Confidence` must be in `[0, 1]`).
3. **Side-effect-free.** Value object methods compute pure transformations.
4. **Equality by value.** Implement structural equality.
5. **Serialisation symmetry.** A value object round-trips through its DTO
   without loss.

## Catalogue

### Identifiers

| Name              | Shape          | Notes                                         |
|-------------------|----------------|-----------------------------------------------|
| `ConversationId`  | UUIDv7 typed   | Stable across renames; never reused.          |
| `TurnId`          | UUIDv7 typed   | Unique within `ConversationId`.               |
| `SegmentId`       | UUIDv7 typed   | Unique within `ConversationId`.               |
| `AnalysisId`      | UUIDv7 typed   | Unique globally.                              |
| `CognitiveElementId` | UUIDv7 typed | Stable per element across re-renders.        |
| `ThreadId`        | UUIDv7 typed   | Unique per `CognitiveGraph`.                  |
| `BundleVersion`   | SemVer-like   | `MAJOR.MINOR.PATCH` with a build suffix.      |
| `UserId`, `TenantId`, `RoleId`, `ScopeId` | UUIDv7 typed | Unique globally. |
| `SnapshotId`, `ReportId`, `WebhookSubscriptionId` | UUIDv7 typed | Unique globally. |

### Cognitive Domain Value Objects

#### `Dimension`

```ts
type Dimension =
  | "FACTUAL_RETRIEVAL"
  | "LOGICAL_INFERENCE"
  | "CREATIVE_SYNTHESIS"
  | "META_COGNITION";
```

Closed enum. Adding a new dimension requires an ADR.

#### `Confidence`

```ts
class Confidence {
  readonly value: number; // [0, 1]
  static of(v: number): Confidence;        // throws if out of range
  combine(other: Confidence, w: number): Confidence;
  asPercent(): string;                     // for UI
}
```

Confidence is the calibrated probability the assertion is correct on a
held-out set ([ADR-0013](../adr/0013-confidence-scoring-and-uncertainty.md)).
Rounding for UI display happens on the boundary, not in the value object.

#### `ConfidenceInterval`

```ts
class ConfidenceInterval {
  readonly low: Confidence;
  readonly median: Confidence;
  readonly high: Confidence;
  // invariant: low.value ≤ median.value ≤ high.value
}
```

Used where uncertainty is bandable (predicted edges).

#### `Span`

```ts
class Span {
  readonly turnId: TurnId;
  readonly startOffset: number; // inclusive
  readonly endOffset: number;   // exclusive
  contains(offset: number): boolean;
  overlaps(other: Span): boolean;
}
```

Atomic evidence locator within a `Conversation`.

#### `Evidence`

```ts
class Evidence {
  readonly span: Span;
  readonly verbatim: string;       // copy of the actual text
  readonly externalCitations: Url[]; // optional supporting sources
}
```

Multiple `Evidence` may justify a single Cognitive Element.

#### `CognitiveElement` (as VO)

When emitted by the analysis pipeline before being persisted in the graph,
a Cognitive Element is a value object identified structurally by
`(analysisId, span, dimension)`:

```ts
class CognitiveElement {
  readonly analysisId: AnalysisId;
  readonly span: Span;
  readonly dimension: Dimension;
  readonly confidence: Confidence;
  readonly evidence: ReadonlyArray<Evidence>;
  readonly bundleVersion: BundleVersion;
}
```

Once persisted to Neo4j, it gains a `CognitiveElementId` and becomes an
entity in the Cognitive Graph (see [§06](06-aggregates-and-entities.md)).

#### `EnsembleAgreement`

```ts
class EnsembleAgreement {
  readonly memberCount: number;
  readonly agreeingMembers: number;
  readonly score: number; // 0..1, agreeingMembers / memberCount
}
```

Used as input to `Confidence` composition.

#### `RulePackVersion`, `MemberId`, `MemberVersion`

Version strings and identifiers for the components of an
`AnalysisBundle`.

### Conversation Value Objects

#### `SourceModality`

```ts
type SourceModality = "TEXT" | "AUDIO" | "VIDEO";
```

Closed enum.

#### `SpeakerLabel`

```ts
class SpeakerLabel {
  readonly displayName: string;
  readonly speakerType: "REAL_USER" | "DIARISED";
  readonly userId?: UserId; // present only for REAL_USER
}
```

#### `TurnIndex`

A non-negative integer wrapped to enforce monotonicity invariants on
`Conversation`.

#### `SegmentBoundary`

```ts
class SegmentBoundary {
  readonly fromTurnIndex: TurnIndex;
  readonly toTurnIndex: TurnIndex;   // inclusive
  readonly intent?: string;          // from Rasa, optional
  readonly source: "RASA" | "FALLBACK";
}
```

Includes a `source` flag so downstream consumers can degrade gracefully
on fallback (ADR-0014).

### Multimodal Value Objects

#### `MimeType`

Wrapper enforcing the supported set: `audio/wav`, `audio/mpeg`,
`audio/flac`, `video/mp4`, `video/quicktime`, plus the text JSON shape.

#### `RetentionPolicy`

```ts
class RetentionPolicy {
  readonly retainMedia: boolean;
  readonly maxAgeDays: number;
}
```

#### `NonVerbalFeatureSet`

```ts
class NonVerbalFeatureSet {
  readonly silences: ReadonlyArray<{ start: number; end: number }>;
  readonly overlaps: ReadonlyArray<{ start: number; end: number }>;
  readonly emphasis: ReadonlyArray<{ turnIndex: number; level: 1|2|3 }>;
  readonly facialTags?: ReadonlyArray<{ turnIndex: number; tag: string }>;
}
```

### Graph Value Objects

#### `EdgeType`

```ts
type EdgeType = "SUPPORTS" | "CONTRADICTS" | "EXTENDS" | "REFERENCES";
```

#### `EdgeWeight`

```ts
class EdgeWeight {
  readonly value: number;       // 0..1
  readonly source: "OBSERVED" | "PREDICTED";
}
```

#### `GraphCoordinate`

```ts
class GraphCoordinate {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
```

Computed by the layout worker; rendered by Three.js
([ADR-0011](../adr/0011-threejs-for-3d-visualization.md)).

#### `ThreadDescriptor`

```ts
class ThreadDescriptor {
  readonly threadId: ThreadId;
  readonly memberCount: number;
  readonly dominantDimension: Dimension;
  readonly meanConfidence: Confidence;
}
```

### Identity Value Objects

#### `Email`, `PasswordHash`

`Email` validates format; `PasswordHash` is opaque and never serialised
into responses.

#### `Roles` and `Scopes`

```ts
type Role = "viewer" | "analyst" | "admin" | "developer" | "service";
type Scope = string;  // e.g. "analysis:read", "analysis:start"
```

#### `AccessTokenClaims`

```ts
class AccessTokenClaims {
  readonly sub: UserId;
  readonly org: TenantId;
  readonly roles: ReadonlyArray<Role>;
  readonly scopes: ReadonlyArray<Scope>;
  readonly jti: string;
  readonly exp: number;
}
```

### Visualization & Export Value Objects

#### `ExportFormat`

```ts
type ExportFormat = "PNG" | "SVG" | "INTERACTIVE_HTML" | "JSON" | "CSV";
```

#### `Provenance`

```ts
class Provenance {
  readonly conversationId: ConversationId;
  readonly analysisId: AnalysisId;
  readonly bundleVersion: BundleVersion;
  readonly exportedAt: Date;
  readonly exportedBy: UserId;
  readonly stageDurations: ReadonlyMap<string, number>;
}
```

Embedded in every export ([ADR-0023](../adr/0023-export-formats-and-explainability.md)).

### Cross-Cutting Value Objects

#### `CorrelationId`, `CausationId`

Stringly-typed but wrapped to prevent accidental mixing with other
strings. Required on every domain event ([ADR-0019](../adr/0019-observability-and-monitoring.md)).

#### `Money` (future)

Reserved for billing if/when introduced.

## Validation Strategy

- Use a single validation library (Zod on the TS side, Pydantic on the
  Python side) to construct value objects from external input.
- Validation errors at the boundary turn into typed
  `ValidationError(field, reason)` results, never bare exceptions.
- Inside the domain, value objects are assumed valid; constructors are
  the choke point.

## Serialisation

- Each value object has a `toJSON()` and a `fromJSON()` (or equivalent).
- Wire-format names follow the public-API casing convention; the
  conversion is in the ACL layer ([§12](12-anti-corruption-layers.md)),
  not in the value object.
