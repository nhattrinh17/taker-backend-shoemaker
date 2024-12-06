import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullQueueService } from './bullQueue.service';
import { QUEUE_NAMES } from '@common/constants';
import { BullQueueTripsConsumer } from './bullQueueTrip.consumer';
import { BullQueueNotificationConsumer } from './bullQueueNotification.consumer';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FirebaseService } from '@common/index';
import { Customer, Notification, Shoemaker, Trip } from '@entities/index';
import { UpdateLocationConsumer } from './bullQueueUpdateLocation.consumer';
import { UpdateStatusConsumer } from './bullQueueUpdateStatus.consumer';
import { WorkStatusConsumer } from './bullQueueWorkStatus.consumer';
import { SocketModule } from '@modules/socket/socket.module';
import RedisService from '@common/services/redis.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, Customer, Shoemaker, Trip]),
    SocketModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        return {
          prefix: `{bull-queue}`,
          redis: {
            host: configService.get('QUEUE_HOST'),
            port: parseInt(configService.get('QUEUE_PORT'), 10),
            password: String(configService.get('QUEUE_PASS')),
          },
          defaultJobOptions: {
            attempts: 20,
            removeOnComplete: 100,
            removeOnFail: {
              age: 60 * 60,
              count: 100,
            },
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.LEAVE_ROOM,
      },
      {
        name: QUEUE_NAMES.NOTIFICATION,
      },
      {
        name: QUEUE_NAMES.CUSTOMERS_TRIP,
      },
      {
        name: QUEUE_NAMES.UPDATE_LOCATION,
      },
      {
        name: QUEUE_NAMES.UPDATE_STATUS,
      },
      {
        name: QUEUE_NAMES.WORK_STATUS,
      },
    ),
  ],
  providers: [
    FirebaseService,
    RedisService,
    BullQueueService,
    // Consumer
    BullQueueTripsConsumer,
    UpdateLocationConsumer,
    UpdateStatusConsumer,
    WorkStatusConsumer,
    BullQueueNotificationConsumer,
  ],
  exports: [BullQueueService],
})
export class BullQueueModule {}
