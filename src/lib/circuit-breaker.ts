import { createRedisClient } from "./redis";
import { logger } from "./logger";

const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class CircuitBreaker {
  private redis = createRedisClient();

  private getFailureKey(url: string) {
    return `circuit_breaker:failures:${url}`;
  }

  async recordSuccess(url: string): Promise<void> {
    try {
      const key = this.getFailureKey(url);
      await this.redis.del(key);
      logger.debug("Circuit breaker success recorded", { url });
    } catch (error) {
      logger.error("Failed to record circuit breaker success", { url, error });
    }
  }

  async recordFailure(url: string): Promise<number> {
    try {
      const key = this.getFailureKey(url);
      const failures = await this.redis.incr(key);
      if (failures === 1) {
        await this.redis.pexpire(key, RESET_TIMEOUT_MS);
      }
      logger.warn("Circuit breaker failure recorded", { url, failures });
      return failures;
    } catch (error) {
      logger.error("Failed to record circuit breaker failure", { url, error });
      return 0; // Fail open
    }
  }

  async isCircuitOpen(url: string): Promise<boolean> {
    try {
      const key = this.getFailureKey(url);
      const failuresStr = await this.redis.get(key);
      const failures = failuresStr ? parseInt(failuresStr, 10) : 0;
      const isOpen = failures >= FAILURE_THRESHOLD;
      
      if (isOpen) {
        logger.warn("Circuit is OPEN", { url, failures });
      }
      
      return isOpen;
    } catch (error) {
      logger.error("Failed to check circuit breaker status", { url, error });
      return false; // Fail open (allow requests if Redis is down)
    }
  }
}

export const circuitBreaker = new CircuitBreaker();
