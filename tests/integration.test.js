/**
 * Simple integration test for the exponential back-off functionality
 */

const Warpmind = require('../src/warpmind.js');
const { TimeoutError, utils } = require('../src/warpmind.js');

describe('Exponential Back-off Integration Test', () => {
  let warpmind;

  beforeEach(() => {
    warpmind = new Warpmind({
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1'
    });
  });

  test('TimeoutError is properly exported', () => {
    expect(TimeoutError).toBeDefined();
    expect(new TimeoutError('test')).toBeInstanceOf(Error);
    expect(new TimeoutError('test').name).toBe('TimeoutError');
  });

  test('Helper methods work correctly', () => {
    // Test retry status check
    expect(utils.shouldRetry(429)).toBe(true);
    expect(utils.shouldRetry(502)).toBe(true);
    expect(utils.shouldRetry(503)).toBe(true);
    expect(utils.shouldRetry(524)).toBe(true);
    expect(utils.shouldRetry(400)).toBe(false);
    expect(utils.shouldRetry(500)).toBe(false);

    // Test jitter addition
    const baseDelay = 1000;
    const delayWithJitter = utils.addJitter(baseDelay);
    expect(delayWithJitter).toBeGreaterThanOrEqual(baseDelay);
    expect(delayWithJitter).toBeLessThanOrEqual(baseDelay + 250);

    // Test delay calculation
    const delay0 = utils.calculateRetryDelay(0);
    const delay1 = utils.calculateRetryDelay(1);
    const delay2 = utils.calculateRetryDelay(2);

    expect(delay0).toBeGreaterThanOrEqual(500);
    expect(delay0).toBeLessThanOrEqual(750);
    expect(delay1).toBeGreaterThanOrEqual(1000);
    expect(delay1).toBeLessThanOrEqual(1250);
    expect(delay2).toBeGreaterThanOrEqual(2000);
    expect(delay2).toBeLessThanOrEqual(2250);

    // Test Retry-After header
    const delayWithRetryAfter = utils.calculateRetryDelay(0, '5');
    expect(delayWithRetryAfter).toBe(5000);
  });

  test('Timeout controller creates AbortController', () => {
    const { controller, timeoutId } = utils.createTimeoutController(1000);
    
    expect(controller).toBeInstanceOf(AbortController);
    expect(timeoutId).toBeDefined();
    
    // Clean up
    clearTimeout(timeoutId);
  });

  test('Default configuration is applied correctly', () => {
    expect(warpmind.defaultTimeoutMs).toBe(30000);
    expect(warpmind.apiKey).toBe('test-key');
    expect(warpmind.baseURL).toBe('https://api.test.com/v1');
  });

  test('makeRequest accepts timeout options', async () => {
    // Mock fetch to immediately resolve
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ test: 'data' })
    });

    const result = await warpmind.makeRequest('/test', {}, { timeoutMs: 5000 });
    expect(result).toEqual({ test: 'data' });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/v1/test',
      expect.objectContaining({
        signal: expect.any(AbortSignal)
      })
    );
  });
});
