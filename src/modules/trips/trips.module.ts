import { Customer, Notification, Shoemaker, Transaction, Trip, TripCancellation, Wallet } from '@entities/index';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { QUEUE_NAMES } from '@common/constants/app.constant';
import { FirebaseService } from '@common/services/firebase.service';
import { TripsConsumer } from './consumer/trips.consumer';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripCancellationRepository } from 'src/database/repository/tripCancellation.repository';
import { SocketModule } from '@modules/socket/socket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trip, Shoemaker, Notification, Wallet, Transaction, Customer, TripCancellation]),
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.NOTIFICATION,
      },
      {
        name: QUEUE_NAMES.CUSTOMERS_TRIP,
      },
    ),
    SocketModule,
  ],
  controllers: [TripsController],
  providers: [
    TripsService,
    FirebaseService,
    TripsConsumer,
    {
      provide: 'TripCancellationRepositoryInterface',
      useClass: TripCancellationRepository,
    },
  ],
})
export class TripsModule {}
