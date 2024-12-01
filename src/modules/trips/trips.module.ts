import { Customer, Notification, Shoemaker, Transaction, Trip, TripCancellation, Wallet } from '@entities/index';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FirebaseService } from '@common/services/firebase.service';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripCancellationRepository } from 'src/database/repository/tripCancellation.repository';
import { SocketModule } from '@modules/socket/socket.module';
import { BullQueueModule } from '@modules/bullQueue/bullQueue.module';

@Module({
  imports: [
    //
    TypeOrmModule.forFeature([Trip, Shoemaker, Notification, Wallet, Transaction, TripCancellation]),
    SocketModule,
    BullQueueModule,
  ],
  controllers: [TripsController],
  providers: [
    TripsService,
    FirebaseService,
    {
      provide: 'TripCancellationRepositoryInterface',
      useClass: TripCancellationRepository,
    },
  ],
})
export class TripsModule {}
