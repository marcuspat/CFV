# 23. Export Formats and Explainability

- **Status:** Accepted
- **Date:** 2024-06-25
- **Deciders:** Core maintainers, frontend lead
- **Related:** ADR-0009, ADR-0011, ADR-0013

## Context

Users want to take CFV outputs out of the application: into reports,
research papers, dashboards, knowledge bases. They also need to **trust**
the outputs they take with them, which means an export must include the
information necessary to audit a result, not just the result itself.

The repository already exposes export routes (`src/server/routes/export.ts`)
and an `explanation_exporter.py`; we want to formalise the catalogue and
the explainability commitments.

## Decision

We adopt the following export catalogue and explainability posture:

1. **Visual exports.**
   - **PNG**: rasterised snapshot of the current 3D scene (ADR-0011).
   - **SVG**: vector export of the 2D fallback view, suitable for
     publication.
   - **Interactive HTML**: self-contained bundle that includes a frozen
     copy of the data and a stripped Three.js viewer; works offline.
2. **Data exports.**
   - **JSON**: canonical export with the full cognitive graph (nodes,
     edges, threads), confidence scores, and provenance.
   - **CSV**: a flattened element-per-row view for spreadsheets and BI
     tools.
3. **Provenance.** Every export embeds a `provenance` block:
   - Source `conversationId`, `analysisId`.
   - Active model bundle version (ADR-0022).
   - Timestamp and exporting user.
   - Summary of pipeline stages and their durations.
4. **Explainability bundle.** A separate "explanation" export rendered
   from `explanation_exporter.py` includes, for each element:
   - Supporting span (verbatim text, with offsets).
   - Symbolic rules that fired.
   - Ensemble member outputs and agreement.
   - Confidence and uncertainty (ADR-0013).
5. **Stable export schema.** JSON / CSV exports follow a versioned schema;
   breaking changes require a major version bump and a one-release
   deprecation window.
6. **Privacy.** Exports respect tenant retention and PII rules
   (ADR-0021); raw media is never included unless the requesting tenant
   has explicitly enabled retention.

## Consequences

### Positive

- Users can audit any exported result.
- BI/spreadsheet workflows are first-class, not derivative.
- Provenance protects against post-hoc disputes.

### Negative

- Multiple export formats to maintain.
- Explanation bundles can be large; we paginate / chunk for big graphs.

### Neutral

- We do not export raw provider responses; the ACL (ADR-0017) mediates
  what is exposed to users.

## Alternatives Considered

### JSON only

Rejected: BI/spreadsheet users want CSV; researchers want SVG; managers
want interactive HTML.

### Single "everything" zip bundle

Considered as a convenience layer on top of the catalogue, not a
replacement.

## Compliance and Verification

- A snapshot test asserts that every export format matches its schema.
- A privacy test asserts that PII redaction propagates into exports.
- Round-trip: a JSON export imported back into the system reproduces the
  same graph.

## References

- `src/server/routes/export.ts`
- `src/ml/explanation_exporter.py`
- `src/ml/explainability.py`
