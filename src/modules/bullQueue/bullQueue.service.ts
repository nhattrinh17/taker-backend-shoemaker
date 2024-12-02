import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import Bull, { Queue } from 'bull';
import { QueueLeaveRoomDto } from './dto/bullQueue.dto';
import { QUEUE_NAMES } from '@common/constants';

@Injectable()
export class BullQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.LEAVE_ROOM) private readonly leaveRoomQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CUSTOMERS_TRIP) private tripQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WORK_STATUS) private workStatusQueue: Queue,
    @InjectQueue(QUEUE_NAMES.UPDATE_LOCATION) private updateLocationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.UPDATE_STATUS) private updateStatusQueue: Queue,
  ) {}

  async addQueueLeaveRoom(name: string, dto: QueueLeaveRoomDto, option?: Bull.JobOptions): Promise<Bull.Job<any>> {
    return this.leaveRoomQueue.add(name, dto, option);
  }

  async addNotificationToQueue(name: string, data: any, option?: Bull.JobOptions): Promise<Bull.Job<any>> {
    return this.notificationQueue.add(name, data, option);
  }

  async getJobTrip(jobId: string): Promise<Bull.Job<any>> {
    return this.tripQueue.getJob(jobId);
  }

  async addRequestTripToQueue(name: string, data: any, option?: Bull.JobOptions): Promise<Bull.Job<any>> {
    return this.tripQueue.add(name, data, option);
  }

  async addWorkStatusToQueue(name: string, data: any, option?: Bull.JobOptions): Promise<Bull.Job<any>> {
    return this.workStatusQueue.add(name, data, option);
  }

  async addUpdateLocationQueue(name: string, data: any, option?: Bull.JobOptions): Promise<Bull.Job<any>> {
    return this.updateLocationQueue.add(name, data, option);
  }

  async addUpdateStatusShoemakerToQueue(name: string, data: any, option?: Bull.JobOptions): Promise<Bull.Job<any>> {
    return this.updateStatusQueue.add(name, data, option);
  }
}
