const { loadEnv, assertEnv, ENV_PATH } = require('./config/env');

const envInfo = loadEnv();
let envReport;
try {
  envReport = assertEnv();
} catch (err) {
  console.error(`\n[config] ${err.message}\n`);
  process.exit(1);
}

const app = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const { startExpiryJob } = require('./jobs/expiryJob');
const { startNotificationJob } = require('./jobs/notificationJob');

const PORT = parseInt(process.env.PORT, 10) || 5000;
let server;

const start = async () => {
  console.log(envInfo.found ? `[config] loaded ${ENV_PATH}` : '[config] no server/.env found - using process environment only');
  envReport.warnings.forEach((w) => console.warn(`[config] WARNING: ${w}`));

  await connectDB();
  startExpiryJob();
  startNotificationJob();

  server = app.listen(PORT, () => {
    console.log(`\nShareHope server running on port ${PORT} (${process.env.NODE_ENV})`);
    console.log(`  API:    http://localhost:${PORT}/api`);
    console.log(`  Health: http://localhost:${PORT}/health\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use - another copy of the server is probably running.`);
      console.error('  Windows: netstat -ano | findstr :' + PORT + '   then   taskkill /PID <pid> /F');
      console.error('  Mac/Linux: lsof -i :' + PORT + '   then   kill <pid>   (or set a different PORT in .env)\n');
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });
};

const shutdown = async (signal) => {
  console.log(`\n${signal} received - shutting down...`);
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  process.exit(1);
});

start().catch((err) => {
  console.error(`\n[startup] ${err.message}\n`);
  if (err.isDbConnectError) {
    console.error('Tip: run "npm run db:check" for a full database diagnosis, or force one database with');
    console.error('     "npm run dev:local" (local MongoDB) / "npm run dev:atlas" (Atlas).\n');
  }
  process.exit(1);
});
