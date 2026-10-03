import { MongoClient } from "mongodb";

export async function connectMongo(uri: string): Promise<MongoClient> {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    await client.db().command({ ping: 1 });
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

export async function disconnectMongo(client: MongoClient): Promise<void> {
  await client.close();
}
