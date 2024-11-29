import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthenticationController } from './authentication.controller';
import { AuthenticationService } from './authentication.service';
import { ShoemakerUpdatedListener } from './listeners/shoemaker-updated.listener';

import { S3Service, SmsService, StringeeService } from '@common/index';
import { Device, Option, Shoemaker } from '@entities/index';

import { JwtStrategy } from './jwt.strategy';
import { DeviceRepository } from 'src/database/repository/device.repository';
import RedisService from '@common/services/redis.service';
import { BonusPointModule } from '@modules/bonus_point/bonus_point.module';
@Module({
  imports: [
    BonusPointModule,
    TypeOrmModule.forFeature([Shoemaker, Option, Device]),
    JwtModule.registerAsync({
      global: true,
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRATION_TIME'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthenticationController],
  providers: [
    AuthenticationService,
    ShoemakerUpdatedListener,
    StringeeService,
    JwtStrategy,
    S3Service,
    SmsService,
    RedisService,
    {
      provide: 'DeviceRepositoryInterface',
      useClass: DeviceRepository,
    },
  ],
})
export class AuthenticationModule {}
