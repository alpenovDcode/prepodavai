import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { AuthService } from './src/modules/auth/auth.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const authService = app.get(AuthService);

  // login(username: string, pass: string) — передаём оба аргумента
  const result = await authService.login('test-user', 'test-password');
  console.log('---BEGINTMK---');
  console.log(result.token);   // поле называется token, а не access_token
  console.log('---ENDTMK---');
  await app.close();
}

bootstrap();
