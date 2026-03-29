import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      const req = context.switchToHttp().getRequest();
      console.error(`[JwtAuthGuard] REJECTED ${req.url} | err=${err?.message} | info=${info?.message || info?.name || JSON.stringify(info)}`);
    }
    return super.handleRequest(err, user, info, context);
  }
}
