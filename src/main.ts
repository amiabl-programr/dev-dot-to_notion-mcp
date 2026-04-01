import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.FRONTEND_URL!,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'ngrok-skip-browser-warning'],
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
