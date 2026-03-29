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

        // Debugging 401: log cookies presence
        if (!token) {
          const cookieHeader = req.headers?.cookie || 'none';
          console.debug(`[JwtStrategy] No token in cookies for ${req.url}. Cookies: ${cookieHeader.substring(0, 50)}...`);
        } else {
          console.debug(`[JwtStrategy] Found token in cookies for ${req.url}`);
        }

        return token || ExtractJwt.fromAuthHeaderAsBearerToken()(req);
      },
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    console.debug(`[JwtStrategy] validate() called, sub=${payload?.sub}, role=${payload?.role}`);
    try {
      const user = await this.authService.validateUser(payload);
      if (!user) {
        console.debug(`[JwtStrategy] validateUser returned null for sub=${payload?.sub}, role=${payload?.role}`);
        throw new UnauthorizedException();
      }
      console.debug(`[JwtStrategy] validateUser OK, user.id=${user.id}`);
      return {
        id: user.id,
        userId: user.id,
        role: payload.role,
        teacherId: payload.role === 'student' ? (user as any).class?.teacherId : undefined,
      };
    } catch (err) {
      console.error(`[JwtStrategy] validate() error for sub=${payload?.sub}:`, err?.message || err);
      throw err;
    }
  }
}
