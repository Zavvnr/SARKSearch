import { app, initializeApp } from "./app.js";
import { config } from "./lib/config.js";

async function bootstrap() {
  await initializeApp();

  app.listen(config.port, config.host, () => {
    console.log(`Node API listening on http://${config.host}:${config.port}`);
  });
}

bootstrap();
