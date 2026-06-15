import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import * as sanitizeHtml from 'sanitize-html';

@Injectable()
export class XssInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    if (req.body) {
      req.body = this.sanitize(req.body);
    }

    return next.handle();
  }

  private sanitize(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitize(item));
    }

    const sanitized = {};
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Known fields that allow some HTML
        const isHtmlField = ['content', 'html', 'description', 'bio'].some(
          (field) => key.toLowerCase().includes(field),
        );

        if (isHtmlField) {
          sanitized[key] = sanitizeHtml(obj[key], {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat([
              'img',
              'h1',
              'h2',
            ]),
            allowedAttributes: {
              ...sanitizeHtml.defaults.allowedAttributes,
              '*': ['class'],
              img: ['src', 'alt', 'width', 'height'],
            },
            allowedSchemes: ['http', 'https'],
            // data: разрешён только для <img src> — нужен для встроенного
            // base64-логотипа в сохранённых материалах. Без этого санитайзер
            // удаляет src у логотипа и вместо картинки рендерится alt="Logo".
            allowedSchemesByTag: { img: ['http', 'https', 'data'] },
          });
        } else {
          // Strict sanitization for other fields (no HTML allowed)
          sanitized[key] = sanitizeHtml(obj[key], {
            allowedTags: [],
            allowedAttributes: {},
          });
        }
      } else if (typeof obj[key] === 'object') {
        sanitized[key] = this.sanitize(obj[key]);
      } else {
        sanitized[key] = obj[key];
      }
    }
    return sanitized;
  }
}
