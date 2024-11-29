import RedisService from '@common/services/redis.service';
import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bull';
import { Redis } from 'ioredis';

import { QUEUE_NAMES } from '@common/index';

@Injectable()
export class UpdateStatusListener {
  private readonly logger = new Logger(UpdateStatusListener.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.UPDATE_STATUS) private queue: Queue,
    private readonly redis: RedisService,
  ) {}

  @OnEvent('shoemaker-update-status')
  async handleUpdateLocationListener(data: { userId: string; isOnline: boolean }) {
    try {
      this.queue.add('shoemaker-update-status', data, {
        removeOnComplete: true,
      });
      if (data.isOnline) {
        console.log('Update isOnline to true for shoemakers ', data.userId);
        const key = await this.redis.setExpire(data.userId, 'online', 60 * 60 * 60);
        console.log('Set Expire for key: ', await this.redis.getExpired(data.userId));
      }
    } catch (error) {
      this.logger.error(error);
    }
  }
}
