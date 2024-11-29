import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, VerifiedCallback } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { IShoemaker } from '@common/index';
import RedisService from '@common/services/redis.service';

import { AuthenticationService } from './authentication.service';
import { REDIS_PREFIX } from './constants';
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'shoemakers-jwt') {
  constructor(
    private configService: ConfigService,
    private readonly redis: RedisService,
    private readonly authService: AuthenticationService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET'),
      ignoreExpiration: false,
    });
  }

  async validate(payload: IShoemaker, done: VerifiedCallback) {
    try {
      const key = `${REDIS_PREFIX}${payload.sub}`;
      const check = await this.redis.get(key);
      if (!check) {
        return done(new UnauthorizedException(), false);
      }
      return done(null, payload);
    } catch (error) {
      throw new BadRequestException(error?.message);
    }
  }
}
