import { startWebServer } from './server.js';

startWebServer().catch((error) => {
  console.error('Failed to start WCL web server:', error);
  process.exit(1);
});
