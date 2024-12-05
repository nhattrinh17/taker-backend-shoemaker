import { QUEUE_NAMES } from '@common/constants/app.constant';
import { CUSTOMERS, NOTIFICATIONS_SCREEN } from '@common/constants/notifications.constant';
import { StatusEnum } from '@common/enums';
import { FirebaseService } from '@common/services';
import RedisService from '@common/services/redis.service';
import { Trip, Notification, Customer, Shoemaker } from '@entities/index';
import { SocketService } from '@modules/socket/socket.service';
import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bull';
import { Repository } from 'typeorm';

@Processor(QUEUE_NAMES.NOTIFICATION)
export class BullQueueTripsConsumer {
  private readonly logger = new Logger(BullQueueTripsConsumer.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private readonly firebaseService: FirebaseService,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(Shoemaker)
    private shoemakerRepository: Repository<Shoemaker>,
    @InjectRepository(Trip)
    private tripRepository: Repository<Trip>,
    private readonly socketService: SocketService,
    private readonly redisService: RedisService,
  ) {}

  @Process('after-trip-success-5-minutes')
  async handleAfterTripSuccess(job: Job<unknown>) {
    try {
      const { customerId } = job.data as { customerId: string };
      if (!customerId) return;
      const customer = await this.customerRepository.findOneBy({
        id: customerId,
      });
      const randomIndex = Math.floor(Math.random() * CUSTOMERS.TRIP_SUCCESS.length);
      const randomContent = CUSTOMERS.TRIP_SUCCESS[randomIndex];
      await this.notificationRepository.save({
        customerId,
        title: 'TAKER',
        content: randomContent,
        data: JSON.stringify({
          screen: NOTIFICATIONS_SCREEN.HOME,
        }),
      });
      if (customer.fcmToken) {
        this.firebaseService.send({
          token: customer.fcmToken,
          title: 'TAKER',
          body: randomContent,
          data: { screen: NOTIFICATIONS_SCREEN.HOME },
        });
      }
    } catch (error) {
      this.logger.error('after-trip-success-5-minutes:', error);
    }
  }

  @Process('update-wallet')
  async handleUpdateWallet(job: Job<unknown>) {
    try {
      const { shoemakerId, message } = job.data as {
        shoemakerId: string;
        message: string;
      };
      if (!shoemakerId) return;
      const shoemaker = await this.shoemakerRepository.findOneBy({
        id: shoemakerId,
      });
      await this.notificationRepository.save({
        shoemakerId,
        title: 'TAKER',
        content: message,
        data: JSON.stringify({
          screen: NOTIFICATIONS_SCREEN.WALLET,
        }),
      });
      if (shoemaker.fcmToken) {
        this.firebaseService.send({
          token: shoemaker.fcmToken,
          title: 'TAKER',
          body: message,
          data: { screen: NOTIFICATIONS_SCREEN.WALLET },
        });
      }
    } catch (error) {
      this.logger.error('update-wallet:', error);
    }
  }

  /**
   * Function to handle the shoemaker-check-trip-pending event
   * @param data { userId: string }
   */
  @Process({
    name: 'shoemaker-check-trip-pending',
    concurrency: 5,
  })
  async handleShoemakerCheckTripPendingListener(data: { userId: string }) {
    try {
      const { userId } = data;
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

          // responseListener wait shoemaker socket
          // const responseListener = async (data) => {
          //   console.log('🚀 ~ BullQueueTripConsumer ~ responseListener ~ data:', data);
          //   // Check if the jobId still exists
          //   const currentTrip = await this.tripRepository.findOne({
          //     where: { id: tripId },
          //     select: {
          //       status: true,
          //       id: true,
          //     },
          //   });
          //   if (currentTrip.status != StatusEnum.SEARCHING) {
          //     // Notify the previous shoemaker that the trip has been canceled
          //     if (currentTrip.status == StatusEnum.CUSTOMER_CANCEL) {
          //       // shoemakerSocket &&
          //       //   shoemakerSocket.emit('trip-update', {
          //       //     type: 'customer-cancel',
          //       //     message: 'Trip has been canceled by the customer. You can now accept new trips.',
          //       //     tripId,
          //       //   });
          //     } else if (currentTrip.status == StatusEnum.ACCEPTED) {
          //       // shoemakerSocket &&
          //       //   shoemakerSocket.emit('trip-update', {
          //       //     type: 'timeout',
          //       //     message: 'Trip has been sent to another shoemaker due to no response',
          //       //   });
          //     }
          //     // shoemakerSocket && shoemakerSocket.off('shoemaker-response-trip', responseListener); // Remove the event listener
          //     return; // Exit the function to ensure nothing else is executed
          //   } else {
          //     // If the shoemaker accepted, resolve the promise with the shoemaker
          //     if (data.accepted) {
          //       // shoemakerSocket && shoemakerSocket.off('shoemaker-response-trip', responseListener); // Remove the event listener

          //       await this.tripRepository.update(tripId, {
          //         status: StatusEnum.ACCEPTED,
          //         shoemakerId: userId,
          //       });

          //       // const socket = await this.gateWaysService.getSocket(customerId);
          //       // socket &&
          //       //   socket.emit('find-closest-shoemakers', {
          //       //     type: 'success',
          //       //     data: {
          //       //       fullName: shoemaker?.fullName,
          //       //       time: shoemaker?.time,
          //       //       phone: shoemaker?.phone,
          //       //       avatar: shoemaker?.avatar,
          //       //       id: shoemaker?.id,
          //       //       lat: shoemaker?.latitude,
          //       //       lng: shoemaker?.longitude,
          //       //     },
          //       //   });

          //       // Update the shoemaker status to isTrip
          //       await this.shoemakerRepository.update(shoemaker.id, {
          //         isTrip: true,
          //       });
          //       // Create notification for the customer
          //       await this.notificationRepository.save({
          //         customerId,
          //         title: 'Đặt hàng thành công',
          //         content: `Bạn đã đặt hàng thành công đơn hàng ${orderId}. Thời gian dự kiến thợ đánh giày đến là ${Math.round(shoemaker.time)} phút.`,
          //       });

          //       if (customerFcmToken) {
          //         this.firebaseService
          //           .send({
          //             title: 'TAKER',
          //             body: `Bạn đã đặt hàng thành công đơn hàng ${orderId}. Thời gian dự kiến thợ đánh giày đến là ${Math.round(shoemaker.time)} phút.`,
          //             token: customerFcmToken,
          //             data: {
          //               fullName: shoemaker?.fullName,
          //               phone: shoemaker?.phone,
          //               avatar: shoemaker?.avatar,
          //               id: shoemaker?.id,
          //               lat: shoemaker?.latitude,
          //               lng: shoemaker?.longitude,
          //             },
          //           })
          //           .catch(() => {});
          //       }

          //       // Join the customer to the shoemaker room to receive updates if trip not schedule
          //       if (!scheduleTime) {
          //         // socket && socket.join(shoemaker.id);
          //       } else {
          //         // Add queue send notification if trip schedule
          //         console.log('Thêm queue chờ gửi thông báo');
          //         const delayTime = Math.max(+scheduleTime - dayjs().tz().valueOf() - 15 * 60 * 1000, 0);
          //         console.log('🚀 ~ BullQueueTripConsumer ~ processFindClosestShoemakers ~ delayTime:', delayTime);
          //         const jobIdNotice = `CUSTOMERS_TRIP_SEND_NOTICE-${trip.id}`;
          //         await this.queue.add(
          //           'trip-schedule',
          //           { tripId: trip.id, userId, statusSchedule: StatusScheduleShoemaker.sendNotification },
          //           {
          //             delay: 30 * 1000,
          //             // delay: delayTime,
          //             jobId: jobIdNotice,
          //             removeOnComplete: true,
          //           },
          //         );
          //       }

          //       try {
          //         const job = await this.queue.getJob(jobId);
          //         if (job && (await job.isActive())) {
          //           await job.moveToCompleted('Canceled by customer', true);
          //         } else if (job) {
          //           await job.remove();
          //         }
          //       } catch (error) {
          //         console.log('🚀 ~ BullQueueTripConsumer ~ responseListener ~ error:773', error);
          //       }
          //     } else {
          //       this.logger.log(`Send request to shoemaker`);
          //       // If the shoemaker declined, resolve the promise with null
          //       this.eventEmitter.emit('shoemaker-cancelation', {
          //         tripId,
          //         shoemakerId: userId,
          //       });
          //       // shoemakerSocket && shoemakerSocket.off('shoemaker-response-trip', responseListener); // Remove the event listener
          //     }
          //   }
          // };
        });
      }
    } catch (error) {
      console.log('🚀 ~ BullQueueTripConsumer ~ handleShoemakerCheckTripPendingListener ~ error:', error);
      this.logger.error(error);
    }
  }
}
