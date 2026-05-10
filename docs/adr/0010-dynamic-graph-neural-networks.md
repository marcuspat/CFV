# 10. Dynamic Graph Neural Networks for Thread Evolution

- **Status:** Accepted
- **Date:** 2024-05-09
- **Deciders:** Core maintainers, ML lead
- **Related:** ADR-0005, ADR-0009, ADR-0013

## Context

Cognitive elements detected by the decomposer (ADR-0009) form a graph that
**evolves over time**: new nodes appear as the conversation progresses, edges
are formed when later turns refer back to earlier ideas, and *threads*
emerge as coherent trajectories through the graph. Static GNNs operate on a
fixed graph and cannot model these dynamics. Heuristic edge-formation
(cosine similarity over embeddings, fixed thresholds) was tried in early
prototypes; it produced graphs that were either too dense to read or too
sparse to be useful, and it could not predict where a thread would extend
next.

Dynamic Graph Neural Networks (DGNNs) handle exactly this problem: the
graph at time `t` is conditioned on the graph at time `t-1`, and the model
predicts both the next nodes and the next edges, with confidence.

## Decision

We adopt a **DGNN-based thread predictor** for the cognitive graph:

1. **Graph evolution model** (`src/ml/dgnn.py`,
   `src/ml/graph_evolution.py`). The model takes the graph state at turn
   `t-1` plus the new cognitive elements at turn `t` and outputs:
   - Edge probabilities between new and existing nodes.
   - Cluster / thread assignments.
   - A short-horizon prediction of the next thread extension.
2. **Integration** (`src/ml/cognitive_dgnn_integration.py`). The DGNN
   consumes the symbolic-stage output and emits domain events
   (`GraphNodeAdded`, `GraphEdgeFormed`, `ThreadEvolved`).
3. **Storage.** Realised graph state is persisted in Neo4j; predicted edges
   are stored separately with a `predicted=true` flag and a confidence
   weight, so visualisation can render them with a different style.
4. **Confidence.** All predictions carry an uncertainty estimate (ADR-0013).
   The frontend visually distinguishes high-confidence and low-confidence
   edges.
5. **Training.** Models are trained offline on labelled conversation
   corpora, versioned in the model registry, and shadow-deployed before
   production cutover.

## Consequences

### Positive

- Threads emerge from a principled model rather than handcrafted heuristics.
- Predictions enable a "next likely connection" UX in the visualisation.
- Inter-turn temporal structure is first-class, not a post-hoc projection.

### Negative

- Adds a heavy ML dependency (PyTorch + a graph library) on the Python
  sidecar.
- Graph predictions can mislead users; we always render confidence and
  separate "predicted" from "observed" edges.
- Training data quality is the bottleneck for further accuracy gains.

### Neutral

- DGNN inference is more expensive than the symbolic layer; we cache
  per-conversation graph snapshots and only recompute on new turns.

## Alternatives Considered

### Heuristic embedding-similarity edges

Rejected: produced unusable graphs in early prototypes (too dense or too
sparse, depending on the threshold).

### Static GNN with retraining

Rejected: cannot represent evolution; would force re-emission of the entire
graph on each turn.

### Rule-based threading only

Rejected: cannot capture the long-range dependencies typical of the
target conversations.

## Compliance and Verification

- Eval suite reports thread-prediction precision/recall on a held-out set.
- Predicted-edge confidence calibration is tested with reliability diagrams
  on each release.
- Production drift is monitored via alert thresholds on the predicted-vs-
  realised edge ratio.

## References

- `src/ml/dgnn.py`, `src/ml/thread_predictor.py`
- ADR-0009: Neuro-symbolic cognitive decomposition
- ADR-0013: Confidence scoring and uncertainty quantification
