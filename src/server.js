import { createApp } from './app.js';
import { loadEnvFile } from './lib/env.js';

loadEnvFile();

const port = Number(process.env.PORT ?? 3000);

const app = createApp();

app.listen(port, () => {
  console.log(`Persistence adapter: ${app.persistenceAdapterName}`);
  console.log(`Localive API server listening on http://localhost:${port}`);
});
