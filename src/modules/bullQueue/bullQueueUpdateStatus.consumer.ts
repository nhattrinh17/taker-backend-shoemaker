import { Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { QUEUE_NAMES, TIME_DELAY_CHANGE_STATUS_ONLINE } from '@common/index';

import { Shoemaker } from '@entities/index';
import RedisService from '@common/services/redis.service';

@Processor(QUEUE_NAMES.UPDATE_STATUS)
export class UpdateStatusConsumer {
  private readonly logger = new Logger(UpdateStatusConsumer.name);

  constructor(
    @InjectRepository(Shoemaker)
    private readonly shoemakerRepository: Repository<Shoemaker>,
    private readonly redisService: RedisService,
  ) {}

  @Process('shoemaker-update-status')
  async handleUpdateStatus(job: Job<unknown>) {
    try {
      const { isOnline, userId } = job.data as {
        userId: string;
        isOnline: boolean;
      };

      await this.shoemakerRepository.update(
        { id: userId },
        {
          isOnline,
        },
      );

      if (isOnline) {
        console.log('Update isOnline to true for shoemakers ', userId);
        const key = await this.redisService.setExpire(userId, 'online', TIME_DELAY_CHANGE_STATUS_ONLINE);
        console.log('Set Expire for key: ', await this.redisService.getExpired(userId));
      }
    } catch (error) {
      this.logger.error(error);
      // TODO: Add error handling to sentry
    }
  }
}
