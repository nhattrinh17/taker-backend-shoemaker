import { S3Service } from '@common/index';
import { Notification, Shoemaker, Trip } from '@entities/index';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FirebaseService } from '@common/services/firebase.service';
import { UpdateLocationListener, UpdateStatusListener } from './listeners';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import RedisService from '@common/services/redis.service';
import { SocketModule } from '@modules/socket/socket.module';
import { BullQueueModule } from '@modules/bullQueue/bullQueue.module';
import { ShoemakersListenerService } from './shoemakers-listener.service';

@Module({
  imports: [TypeOrmModule.forFeature([Shoemaker, Trip, Notification]), BullQueueModule, SocketModule],
  controllers: [ProfileController],
  providers: [
    //
    ProfileService,
    ShoemakersListenerService,
    S3Service,
    UpdateLocationListener,
    UpdateStatusListener,
    FirebaseService,
    RedisService,
  ],
})
export class ProfileModule {}
