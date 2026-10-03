import type { MongoClient } from "mongodb";

export class HealthRepository {
  constructor(private readonly client: MongoClient) {}

  async ping(): Promise<void> {
    await this.client.db().command({ ping: 1 });
  }
}
