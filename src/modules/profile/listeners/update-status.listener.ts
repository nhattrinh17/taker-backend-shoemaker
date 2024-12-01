import RedisService from '@common/services/redis.service';
import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bull';
import { Redis } from 'ioredis';

import { QUEUE_NAMES, TIME_DELAY_CHANGE_STATUS_ONLINE } from '@common/index';
import { BullQueueService } from '@modules/bullQueue/bullQueue.service';

@Injectable()
export class UpdateStatusListener {
  private readonly logger = new Logger(UpdateStatusListener.name);

  constructor(
    private readonly redis: RedisService,
    private readonly bullQueueService: BullQueueService,
  ) {}

  @OnEvent('shoemaker-update-status')
  async handleUpdateLocationListener(data: { userId: string; isOnline: boolean }) {
    try {
      this.bullQueueService.addUpdateStatusShoemakerToQueue('shoemaker-update-status', data, {
        removeOnComplete: true,
      });
      if (data.isOnline) {
        console.log('Update isOnline to true for shoemakers ', data.userId);
        const key = await this.redis.setExpire(data.userId, 'online', TIME_DELAY_CHANGE_STATUS_ONLINE);
        console.log('Set Expire for key: ', await this.redis.getExpired(data.userId));
      }
    } catch (error) {
      this.logger.error(error);
    }
  }
}
