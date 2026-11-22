import { createApp } from './app';
import { config, paymentsMocked } from './config';
import { ensureProductIndex } from './lib/elastic';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { enableInMemorySessions } from './middleware/auth';

async function main() {
  await prisma.$connect();
  await redis.connect().catch((e) => {
    console.warn('[redis] not connected:', e.message);
    if (config.env === 'development') {
      redis.disconnect();
      enableInMemorySessions();
      console.warn(
        '[local] Using in-memory sessions and carts for development; they are lost when the API stops.',
      );
    }
  });
  await ensureProductIndex().catch((e) =>
    console.warn('[elastic] index not ready, search will use the database fallback:', e.message),
  );

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Marketplace API running on http://localhost:${config.port}`);
    console.log(`Payments mode: ${paymentsMocked ? 'MOCK (no Stripe key set)' : 'Stripe test mode'}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
