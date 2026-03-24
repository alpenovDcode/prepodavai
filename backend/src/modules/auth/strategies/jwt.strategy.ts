import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: (req: any) => {
        let token = null;
        if (req && req.cookies) {
          token = req.cookies['prepodavai_token'];
        }

        // Debugging 401: log if cookie is missing
        if (!token && process.env.NODE_ENV !== 'production') {
          console.debug(`[JwtStrategy] No cookie found in request for ${req.url}`);
        }

        return token || ExtractJwt.fromAuthHeaderAsBearerToken()(req);
      },
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.authService.validateUser(payload);
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      userId: user.id,
      role: payload.role,
      teacherId: payload.role === 'student' ? (user as any).class?.teacherId : undefined,
    };
  }
}
