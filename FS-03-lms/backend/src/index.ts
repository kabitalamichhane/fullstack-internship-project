import http from 'http';
import { createApp } from './app';
import { config, paymentsMocked } from './config';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { initSocket } from './socket';

async function main() {
  await prisma.$connect();
  await redis.connect().catch((e) => console.warn('[redis]', e.message));

  const server = http.createServer(createApp());
  initSocket(server); // Socket.io chat for live classes shares the same port

  server.listen(config.port, () => {
    console.log(`LMS API running on http://localhost:${config.port}`);
    console.log(`Payments mode: ${paymentsMocked ? 'MOCK (no Stripe key set)' : 'Stripe test mode'}`);
    console.log('Remember to start the video worker too: npm run dev:worker');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
