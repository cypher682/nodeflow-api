import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  console.log("⚡ Bootstrapping NodeFlow local database with a test API key...");

  const rawKey = "nodeflow_test_key_" + randomBytes(8).toString("hex");
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const userId = "usr_dev_123";

  // Upsert the API key for our dev user
  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      name: "Default Dev Key",
      keyHash,
    }
  });

  console.log("\n✅ Bootstrapped successfully!");
  console.log("-----------------------------------------------------------------");
  console.log(`API Key:      ${rawKey}`);
  console.log(`User ID:      ${userId}`);
  console.log(`Key ID:       ${apiKey.id}`);
  console.log("-----------------------------------------------------------------");
  console.log("👉 Paste this API Key into the 'API Key (Bearer)' input in the Demo UI!");
  console.log("   Or use it in your curl commands: -H \"Authorization: Bearer <key>\"\n");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
