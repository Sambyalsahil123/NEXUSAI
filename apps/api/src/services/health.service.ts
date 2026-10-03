import type { HealthRepository } from "../repositories/health.repository.js";

export type HealthReport = { status: "ok"; mongo: "up" } | { status: "degraded"; mongo: "down" };

export class HealthService {
  constructor(private readonly healthRepository: Pick<HealthRepository, "ping">) {}

  async check(): Promise<HealthReport> {
    try {
      await this.healthRepository.ping();
      return { status: "ok", mongo: "up" };
    } catch {
      return { status: "degraded", mongo: "down" };
    }
  }
}
