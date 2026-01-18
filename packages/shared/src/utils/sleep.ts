/**
 * @fileoverview Simple async delay utility
 *
 * WHY THIS EXISTS:
 * Many operations need to wait before retrying (like failed HTTP requests).
 * Instead of using callbacks or complex timer logic, we use async/await with
 * this simple Promise-based sleep function.
 *
 * EXAMPLE USAGE:
 * ```typescript
 * import { sleep } from '@restart/shared';
 *
 * async function retryOperation() {
 *   for (let attempt = 1; attempt <= 3; attempt++) {
 *     try {
 *       return await doSomething();
 *     } catch (err) {
 *       // Wait longer between each retry (exponential backoff)
 *       await sleep(100 * attempt); // 100ms, 200ms, 300ms
 *     }
 *   }
 * }
 * ```
 */

/**
 * Pauses execution for a specified number of milliseconds.
 *
 * This is useful for:
 * - Adding delays between retry attempts
 * - Rate limiting API calls
 * - Simulating network latency in tests
 *
 * @param ms - Number of milliseconds to wait
 * @returns A Promise that resolves after the specified time
 *
 * @example
 * // Wait 1 second before continuing
 * await sleep(1000);
 * console.log('This prints after 1 second');
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
