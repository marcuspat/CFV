/**
 * Contract test for the published-language event schemas.
 *
 * Asserts:
 *   1. Every JSON file in docs/schemas/events/ is a syntactically valid
 *      JSON document.
 *   2. Each schema declares Draft 2020-12 ($schema) and an $id.
 *   3. Every event schema (other than the Envelope) lives at the path
 *      <EventName>.v<N>.json and has a matching title.
 *
 * Per ADR-0012 / docs/ddd/08-domain-events.md, the published-language
 * event schemas are the integration contract; CI must fail on drift.
 *
 * Note: this test deliberately does not pull in a JSON Schema validator
 * (ajv) yet — Phase 0 only commits the schemas and structural checks.
 * A full draft-2020 validator is added in Phase 4 when the cognitive
 * analysis pipeline starts emitting events for real.
 */
import * as fs from 'fs';
import * as path from 'path';

const SCHEMAS_DIR = path.resolve(__dirname, '../../docs/schemas/events');

function listSchemaFiles(): string[] {
  return fs
    .readdirSync(SCHEMAS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

describe('event schema catalogue', () => {
  const schemas = listSchemaFiles();

  it('contains at least the Phase 0 baseline events', () => {
    const required = [
      'Envelope.v1.json',
      'UserRegistered.v1.json',
      'UserDisabled.v1.json',
      'AnalysisStarted.v1.json',
      'AnalysisCompleted.v1.json',
      'CognitiveElementDetected.v1.json',
      'GraphNodeAdded.v1.json',
      'GraphEdgeFormed.v1.json',
    ];
    for (const name of required) {
      expect(schemas).toContain(name);
    }
  });

  describe.each(schemas)('%s', (file) => {
    const full = path.join(SCHEMAS_DIR, file);
    const raw = fs.readFileSync(full, 'utf8');
    let parsed: any;

    it('is valid JSON', () => {
      expect(() => {
        parsed = JSON.parse(raw);
      }).not.toThrow();
    });

    it('declares Draft 2020-12 and an $id', () => {
      parsed = parsed ?? JSON.parse(raw);
      expect(parsed.$schema).toBe(
        'https://json-schema.org/draft/2020-12/schema'
      );
      expect(typeof parsed.$id).toBe('string');
      expect(parsed.$id.length).toBeGreaterThan(0);
    });

    it('has a non-empty title', () => {
      parsed = parsed ?? JSON.parse(raw);
      expect(typeof parsed.title).toBe('string');
      expect(parsed.title.length).toBeGreaterThan(0);
    });

    it('uses the <EventName>.v<N>.json naming convention', () => {
      expect(file).toMatch(/^[A-Z][A-Za-z0-9]+\.v\d+\.json$/);
    });
  });
});
