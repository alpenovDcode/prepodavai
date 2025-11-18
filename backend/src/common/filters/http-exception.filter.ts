import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

/**
 * Глобальный exception filter для санитизации ошибок
 * Скрывает детали ошибок в production
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    const isDevelopment = nodeEnv === 'development';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exception.message;
        // В development показываем больше деталей
        if (isDevelopment) {
          details = exceptionResponse;
        }
      }
    } else if (exception instanceof Error) {
      message = isDevelopment ? exception.message : 'Internal server error';
      // В development показываем stack trace
      if (isDevelopment) {
        details = {
          stack: exception.stack,
          name: exception.name,
        };
      }
    }

    // Логируем ошибку (без чувствительных данных)
    if (!isDevelopment) {
      console.error('Error:', {
        status,
        message,
        path: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error('Error details:', exception);
    }

    // Формируем безопасный ответ
    const errorResponse: any = {
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Добавляем детали только в development
    if (isDevelopment && details) {
      errorResponse.details = details;
    }

    response.status(status).json(errorResponse);
  }
}

