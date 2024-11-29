import RedisService from '@common/services/redis.service';
import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bull';
import { Redis } from 'ioredis';

import { Location, QUEUE_NAMES } from '@common/index';

@Injectable()
export class UpdateLocationListener {
  private readonly logger = new Logger(UpdateLocationListener.name);

  constructor(
    private readonly redis: RedisService,
    @InjectQueue(QUEUE_NAMES.UPDATE_LOCATION) private queue: Queue,
  ) {}

  @OnEvent('shoemaker-update-location')
  async handleUpdateLocationListener(data: Location & { userId: string }) {
    try {
      this.queue.add('shoemaker-update-location', data, {
        removeOnComplete: true,
      });
      //TODO update to duration time: 30 minutes
      // this.redis.setExpire(data.userId, 'online', 60 * 15);
    } catch (error) {
      this.logger.error(error);
    }
  }
}
