import { Module, OnModuleInit } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { FirebaseService } from '@common/services';
import { TypeOrmModule } from '@nestjs/typeorm';
import connectionSource, { typeOrmConfig } from './config/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthenticationModule } from '@modules/authentication/authentication.module';
import { ProfileModule } from '@modules/profile/profile.module';
import { ActivitiesModule } from '@modules/activities/activities.module';
import { TripsModule } from '@modules/trips/trips.module';
import { NotificationModule } from '@modules/notifications/notifications.module';
import { WalletsModule } from '@modules/wallets/wallets.module';
import { BonusPointModule } from '@modules/bonus_point/bonus_point.module';
import { OptionsModule } from '@modules/options/options.module';
import { BlogModule } from '@modules/blog/blog.module';
import { BullQueueModule } from '@modules/bullQueue/bullQueue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      expandVariables: true,
      cache: true,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        return typeOrmConfig;
      },
      dataSourceFactory: async () => {
        const dataSource = await connectionSource.initialize();
        // console.log(
        //   '🚀 ~ dataSourceFactory: ~ dataSource.isConnected:',
        //   dataSource.isConnected,
        // );
        return dataSource;
      },
    }),
    EventEmitterModule.forRoot({ verboseMemoryLeak: true }),
    BullQueueModule,
    AuthenticationModule,
    ProfileModule,
    ActivitiesModule,
    TripsModule,
    NotificationModule,
    WalletsModule,
    BonusPointModule,
    OptionsModule,
    BlogModule,
  ],
  controllers: [AppController],
  providers: [AppService, FirebaseService],
})
export class AppModule implements OnModuleInit {
  onModuleInit() {}
}
