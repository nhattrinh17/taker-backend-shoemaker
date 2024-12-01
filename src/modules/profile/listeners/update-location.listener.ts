import RedisService from '@common/services/redis.service';
import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bull';
import { Redis } from 'ioredis';

import { Location, QUEUE_NAMES, TIME_DELAY_CHANGE_STATUS_ONLINE } from '@common/index';
import { BullQueueService } from '@modules/bullQueue/bullQueue.service';

@Injectable()
export class UpdateLocationListener {
  private readonly logger = new Logger(UpdateLocationListener.name);

  constructor(
    private readonly redis: RedisService,
    private readonly bullQueueService: BullQueueService,
  ) {}

  @OnEvent('shoemaker-update-location')
  async handleUpdateLocationListener(data: Location & { userId: string }) {
    try {
      this.bullQueueService.addUpdateLocationQueue('shoemaker-update-location', data);
      this.redis.setExpire(data.userId, 'online', TIME_DELAY_CHANGE_STATUS_ONLINE);
    } catch (error) {
      this.logger.error(error);
    }
  }
}
