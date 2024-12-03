import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bull';
import * as h3 from 'h3-js';
import { Repository } from 'typeorm';

import { Location, QUEUE_NAMES, RESOLUTION } from '@common/index';

import { Shoemaker } from '@entities/index';
import { SocketService } from '@modules/socket/socket.service';

@Processor(QUEUE_NAMES.UPDATE_LOCATION)
export class UpdateLocationConsumer {
  private readonly logger = new Logger(UpdateLocationConsumer.name);

  constructor(
    @InjectRepository(Shoemaker)
    private readonly shoemakerRepository: Repository<Shoemaker>,
    private readonly socketService: SocketService,
  ) {}

  @Process({
    name: 'shoemaker-update-location',
    concurrency: 5,
  })
  async handleFindClosestShoemakers(job: Job<unknown>) {
    try {
      const { lat, lng, userId } = job.data as Location & {
        userId: string;
      };

      if (!lat || !lng) return;

      const h = h3.latLngToCell(lat, lng, RESOLUTION);
      console.log('h', h);
      const socketId = await this.socketService.getSocketIdByUserId(userId);
      if (socketId) {
        this.logger.log('socketId: ', socketId);
        await this.socketService.sendMessageToRoom({
          roomName: userId,
          event: 'update-location',
          data: { lat, lng },
        });
      }
      await this.shoemakerRepository.update(
        { id: userId },
        {
          latitude: lat.toString(),
          longitude: lng.toString(),
          latLongToCell: h,
          isOnline: true,
        },
      );
    } catch (error) {
      this.logger.error(error);
      // TODO: Add error handling to sentry
    }
  }
}
