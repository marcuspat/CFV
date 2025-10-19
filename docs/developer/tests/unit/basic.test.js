/**
 * Basic unit tests to verify test infrastructure
 */

describe('Basic Test Infrastructure', () => {
  test('should pass a simple assertion', () => {
    expect(1 + 1).toBe(2);
  });

  test('should handle async operations', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });

  test('should handle object equality', () => {
    const obj = { name: 'test', value: 123 };
    expect(obj).toEqual({ name: 'test', value: 123 });
  });

  test('should handle array operations', () => {
    const arr = [1, 2, 3];
    expect(arr).toContain(2);
    expect(arr.length).toBe(3);
  });
});