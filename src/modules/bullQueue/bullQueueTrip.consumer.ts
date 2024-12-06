import { QUEUE_NAMES } from '@common/constants/app.constant';
import { StatusEnum } from '@common/enums';
import RedisService from '@common/services/redis.service';
import { Trip } from '@entities/index';
import { SocketService } from '@modules/socket/socket.service';
import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bull';
import { Repository } from 'typeorm';

@Processor(QUEUE_NAMES.CUSTOMERS_TRIP)
export class BullQueueTripsConsumer {
  private readonly logger = new Logger(BullQueueTripsConsumer.name);

  constructor(
    @InjectRepository(Trip)
    private tripRepository: Repository<Trip>,
    private readonly socketService: SocketService,
    private readonly redisService: RedisService,
  ) {}
  /**
   * Function to handle the shoemaker-check-trip-pending event
   * @param data { userId: string }
   */
  @Process({
    name: 'shoemaker-check-trip-pending',
    concurrency: 5,
  })
  async handleShoemakerCheckTripPendingListener(job: Job<unknown>) {
    try {
      const { userId } = job.data as { userId: string };
      this.logger.log(`pendingTrip shoemakerId: ${userId}`);
      const redisClient = this.redisService.getClient();
      const pendingTrip = await this.redisService.get(`pending-trip-${userId}`);
      this.logger.log(`pendingTrip: ${pendingTrip}`);
      if (pendingTrip) {
        const ttl = await redisClient.ttl(`pending-trip-${userId}`);
        if (ttl < 2) {
          console.log('Skip pending trip TTL', ttl);
          return;
        }
        const { shoemaker, tripId, jobId, customerId, orderId, customerFcmToken, customerFullName, customerAvatar, customerPhone, scheduleTime } = JSON.parse(pendingTrip);

        const shoemakerSocketId = await this.socketService.getSocketIdByUserId(userId);

        if (!shoemakerSocketId) return;
        this.logger.log(`ttl: ${ttl}`);
        await new Promise(async (resolve) => {
          console.log('Chạy promiseeeeeee');
          //Update when shoemaker not accepted then emit data customer to shoemaker
          const trip = await this.tripRepository.findOne({
            select: {
              id: true,
              address: true,
              status: true,
              totalPrice: true,
              paymentMethod: true,
              latitude: true,
              longitude: true,
              orderId: true,
              addressNote: true,
              paymentStatus: true,
            },
            where: { id: tripId, status: StatusEnum.SEARCHING },
            relations: ['services'],
          });
          // console.log('Shoemaker', shoemaker.fullName);
          // console.log('🚀 ~ BullQueueTripConsumer ~ awaitnewPromise ~ trip:', trip, shoemakerSocket.id);

          if (shoemakerSocketId) {
            setTimeout(async () => {
              await this.socketService.sendMessageToRoom({
                data: {
                  fullName: customerFullName,
                  phone: customerPhone,
                  avatar: customerAvatar,
                  location: trip.address,
                  tripId: trip.id,
                  time: shoemaker.time,
                  latitude: trip.latitude,
                  longitude: trip.longitude,
                  services: trip.services.map(({ price, discount, name, discountPrice, quantity }) => ({
                    price,
                    discount,
                    name,
                    discountPrice,
                    quantity,
                  })),
                  totalPrice: trip.totalPrice,
                  paymentMethod: trip.paymentMethod,
                  addressNote: trip.addressNote,
                  distance: shoemaker.distance,
                  scheduleTime: +scheduleTime,
                  jobId,
                  customerId,
                  orderId,
                },
                event: 'shoemaker-request-trip',
                roomName: shoemakerSocketId,
              });
            }, 2000);
          }
        });
      }
    } catch (error) {
      console.log('🚀 ~ BullQueueTripConsumer ~ handleShoemakerCheckTripPendingListener ~ error:', error);
      this.logger.error(error);
    }
  }
}
