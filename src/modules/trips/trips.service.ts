import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';

import { QUEUE_NAMES, RoomNameAdmin, StatusScheduleShoemaker } from '@common/constants/app.constant';
import { NOTIFICATIONS_SCREEN, SHOEMAKER } from '@common/constants/notifications.constant';
import { PaymentEnum, PaymentStatusEnum } from '@common/enums/payment.enum';
import { TransactionSource, TransactionStatus, TransactionType } from '@common/enums/transaction.enum';
import { orderId as generateOrderId } from '@common/helpers/index';
import { DEFAULT_MESSAGES, EventEmitSocket, PartialStatusEnum, StatusEnum } from '@common/index';
import { FirebaseService } from '@common/services/firebase.service';
import { Notification, Shoemaker, Transaction, Trip, Wallet, WalletLog } from '@entities/index';
// import { GatewaysService } from '@gateways/gateways.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { CancelTripDto, UpdateTripDto } from './dto/update-trip.dto';
import { TripCancellationRepositoryInterface } from 'src/database/interface/tripCancellation.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(Shoemaker)
    private readonly shoemakerRepository: Repository<Shoemaker>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    // private readonly gateWaysService: GatewaysService,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CUSTOMERS_TRIP) private queue: Queue,
    private readonly firebaseService: FirebaseService,
    @Inject('TripCancellationRepositoryInterface')
    private readonly tripCancellationRepository: TripCancellationRepositoryInterface,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Function to update trip status
   * @param userId string
   * @param dto UpdateTripDto
   * @returns Promise<string>
   */
  async updateTripStatus(userId: string, { tripId, status, images }: UpdateTripDto) {
    try {
      // check if the trip exists
      const trip = await this.tripRepository.findOneBy({
        shoemakerId: userId,
        id: tripId,
      });
      if (!trip) throw new NotFoundException('Trip not found');
      // TODO: Update socket
      // const socket = await this.gateWaysService.getSocket(trip.customerId);
      let statusUpdate = '';
      if (status === PartialStatusEnum.MEETING && trip.status === StatusEnum.ACCEPTED) {
        statusUpdate = StatusEnum.MEETING;
        trip.status = StatusEnum.MEETING;
        // Check trip schedule and transfer to trip now
        if (trip.scheduleTime) {
          await this.shoemakerRepository.update(userId, { isTrip: true, isSchedule: false });
        }
      } else if (status === PartialStatusEnum.INPROGRESS && trip.status === StatusEnum.MEETING) {
        statusUpdate = StatusEnum.INPROGRESS;
        trip.status = StatusEnum.INPROGRESS;
        trip.receiveImages = images || [];
      } else if (status === PartialStatusEnum.COMPLETED && trip.status === StatusEnum.INPROGRESS) {
        statusUpdate = StatusEnum.COMPLETED;
        trip.status = StatusEnum.COMPLETED;
        trip.completeImages = images || [];
        trip.paymentStatus = PaymentStatusEnum.PAID;
        // update shoemaker status to available
        await this.shoemakerRepository.update(userId, { isTrip: false });
        // create notification for customer
        // await this.notificationRepository.save({
        //   customerId: trip.customerId,
        //   title: 'Hoàn thành đơn hàng',
        //   content: `Đơn hàng của bạn đã hoàn thành. Đánh giá ngay`,
        //   data: JSON.stringify({ tripId: trip.id }),
        // });
        this.notificationQueue.add(
          'after-trip-success-5-minutes',
          {
            customerId: trip.customerId,
          },
          { delay: 5 * 60 * 1000, removeOnComplete: true }, // 5 * 60 * 1000
        );
        // Update wallet
        try {
          await this.updateWallet(trip);
        } catch (error) {
          console.log('🚀 ~ TripsService ~ updateTripStatus ~ error:', error);
        }
      }
      if (statusUpdate) {
        await this.tripRepository.update(tripId, trip);
        // update to customer and shoemaker
        // if (socket) {
        //   socket.emit(EventEmitSocket.UpdateTripStatus, {
        //     type: 'success',
        //     status: StatusEnum.COMPLETED,
        //   });
        //   socket.leave(trip.shoemakerId);
        // }
        // // update to admins
        // this.gateWaysService.emitToRoomWithServer(RoomNameAdmin, EventEmitSocket.UpdateTripStatus, {
        //   id: trip.id,
        //   status: statusUpdate,
        // });
        return DEFAULT_MESSAGES.SUCCESS;
      }
      throw new BadRequestException('Invalid status');
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to update wallet
   * @param trip Trip
   * @returns Promise<void>
   */
  async updateWallet(trip: Trip) {
    try {
      // If payment method is cash payment
      if (trip.paymentMethod === PaymentEnum.OFFLINE_PAYMENT) {
        await this.dataSource.transaction(async (manager) => {
          // Update wallet for shoemaker
          const wallet = await manager.findOne(Wallet, {
            where: { shoemakerId: trip.shoemakerId },
            lock: { mode: 'pessimistic_write' },
          });
          const amount = trip.fee;
          const currentBalance = wallet.balance;
          const balance = currentBalance - amount;

          let orderId = generateOrderId();

          let foundTransaction = await this.transactionRepository.findOneBy({
            orderId,
          });

          while (foundTransaction) {
            orderId = generateOrderId();
            foundTransaction = await this.transactionRepository.findOneBy({
              orderId,
            });
          }
          // Make transaction for shoemaker
          await manager.save(Transaction, {
            walletId: wallet.id,
            amount: amount,
            description: `Trừ tiền từ đơn hàng ${trip.orderId}`,
            transactionType: TransactionType.WITHDRAW,
            transactionSource: TransactionSource.TRIP,
            status: TransactionStatus.SUCCESS,
            orderId,
            tripId: trip.id,
          });
          // Update wallet balance
          await manager.save(Wallet, { id: wallet.id, balance });
          // Create wallet log
          await manager.save(WalletLog, {
            walletId: wallet.id,
            previousBalance: currentBalance,
            currentBalance: balance,
            amount: amount,
            description: `Trừ tiền từ đơn hàng ${trip.orderId}`,
          });
          // Create notification for shoemaker
          const randomContent = SHOEMAKER.generateWalletMessage(amount, '-', trip.orderId);
          this.notificationQueue.add(
            'update-wallet',
            {
              shoemakerId: trip.shoemakerId,
              message: randomContent.mes03,
            },
            { removeOnComplete: true },
          );
        });
      } else if (trip.paymentMethod === PaymentEnum.DIGITAL_WALLET || (trip.paymentMethod === PaymentEnum.CREDIT_CARD && trip.paymentStatus === PaymentStatusEnum.PAID)) {
        await this.dataSource.transaction(async (manager) => {
          // Update wallet for shoemaker
          const wallet = await manager.findOne(Wallet, {
            where: { shoemakerId: trip.shoemakerId },
            lock: { mode: 'pessimistic_write' },
          });
          const amount = trip.income;
          const currentBalance = wallet.balance;
          const balance = currentBalance + amount;

          let orderId = generateOrderId();

          let foundTransaction = await this.transactionRepository.findOneBy({
            orderId,
          });

          while (foundTransaction) {
            orderId = generateOrderId();
            foundTransaction = await this.transactionRepository.findOneBy({
              orderId,
            });
          }
          // Make transaction for shoemaker
          await manager.save(Transaction, {
            walletId: wallet.id,
            amount: amount,
            description: `Cộng tiền từ đơn hàng ${trip.orderId}`,
            transactionType: TransactionType.DEPOSIT,
            transactionSource: TransactionSource.TRIP,
            status: TransactionStatus.SUCCESS,
            orderId,
            tripId: trip.id,
          });
          // Update wallet balance
          await manager.save(Wallet, { id: wallet.id, balance });

          // Create wallet log
          await manager.save(WalletLog, {
            walletId: wallet.id,
            previousBalance: currentBalance,
            currentBalance: balance,
            amount: amount,
            description: `Cộng tiền từ đơn hàng ${trip.orderId}`,
          });

          // Create notification for shoemaker
          const randomContent = SHOEMAKER.generateWalletMessage(amount, '+', trip.orderId);
          this.notificationQueue.add(
            'update-wallet',
            {
              shoemakerId: trip.shoemakerId,
              message: randomContent.mes02,
            },
            { removeOnComplete: true },
          );
        });
      }
    } catch (error) {
      console.log('🚀 ~ [Trip][Update wallet] ~', error);
    }
  }

  /**
   * Function to get detail of a trip
   * @param userId CustomerId
   * @param tripId TripId
   * @returns Trip detail
   */
  async show(userId: string, tripId: string) {
    try {
      const trip = await this.tripRepository.findOne({
        where: {
          id: tripId,
          shoemakerId: userId,
        },
        relations: ['services', 'rating', 'customer'],
      });
      if (!trip) throw new NotFoundException('Invalid trip');

      const { rating, services, customer } = trip;
      return {
        rating: {
          rating: rating?.rating,
          comment: rating?.comment,
        },
        services: services.map(({ price, discountPrice, discount, quantity, name }) => ({
          price,
          discountPrice,
          discount,
          quantity,
          name,
        })),
        customer: {
          name: customer?.fullName,
          phone: customer?.phone,
          avatar: customer?.avatar,
        },
        orderId: trip.orderId,
        totalPrice: trip.totalPrice,
        images: trip.images,
        receiveImages: trip.receiveImages,
        completeImages: trip.completeImages,
        paymentMethod: trip.paymentMethod,
        paymentStatus: trip.paymentStatus,
        address: trip.address,
        addressNote: trip.addressNote,
        fee: trip.fee,
        income: trip.income,
      };
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  checkTripSearching(tripId: string) {
    return this.tripRepository.exists({
      where: {
        id: tripId,
        status: StatusEnum.SEARCHING,
      },
    });
  }

  async cancel(userId: string, dto: CancelTripDto) {
    try {
      const trip = await this.tripRepository.findOneBy({
        shoemakerId: userId,
        id: dto.tripId,
      });
      if (!trip) throw new NotFoundException('Trip not found');

      const [resCancel, resUpdateTrip, delShoemakerCancelOd] = await Promise.all([
        this.tripCancellationRepository.create({
          tripId: dto.tripId,
          shoemakerId: userId,
          reason: 'Thợ giày hủy đơn',
        }),
        this.tripRepository.update(trip.id, {
          shoemakerId: null,
          status: StatusEnum.SEARCHING,
          jobId: null,
        }),
        this.tripCancellationRepository.permanentlyDeleteByCondition({
          tripId: dto.tripId,
          shoemakerId: Not(userId),
        }),
      ]);

      // console.log('🚀 ~ TripsService ~ cancel ~ resCancel && resUpdateTrip && delShoemakerCancelOd:', resCancel, resUpdateTrip, delShoemakerCancelOd);
      if (resCancel && resUpdateTrip) {
        // Clean job trip
        try {
          if (trip.jobId) {
            const job = await this.queue.getJob(trip.jobId);
            if (job && (await job.isActive())) {
              await job.moveToCompleted('Canceled by customer', true);
            } else if (job) {
              await job.remove();
            }
          }
        } catch (e) {
          console.log('Error while removing job', e);
        }

        // Send to customer
        // TODO: Update socket gateway
        // const socketCustomer = await this.gateWaysService.getSocket(trip.customerId);

        // if (socketCustomer) {
        //   socketCustomer.emit(EventEmitSocket.UpdateTripStatus, {
        //     type: 'shoemaker-cancel',
        //     message: 'Trip has been canceled by the shoemaker.',
        //   });
        // }
        // retry find shoemaker
        if (trip.scheduleTime) {
          const jobId = `${QUEUE_NAMES.CUSTOMERS_TRIP}-${trip.id}`;
          await this.tripRepository.update(trip.id, { jobId });
          this.queue.add(
            'trip-schedule',
            { tripId: trip.id, userId, statusSchedule: StatusScheduleShoemaker.findShoemaker },
            {
              delay: 3000,
              removeOnComplete: true,
              jobId: jobId,
            },
          );
        } else {
          // Find other shoemaker
          const job = await this.queue.add(
            'find-closest-shoemakers',
            {
              tripId: dto.tripId,
              location: { lat: trip.latitude, lng: trip.longitude },
              userId: trip.shoemakerId,
            },
            {
              delay: 3000,
              removeOnComplete: true,
            },
          );
          await this.tripRepository.update(trip.id, { jobId: job.id as string });
          // TODO: Update socket
          // Leave the room and prevent the customer from receiving updates
          // if (socketCustomer) {
          //   socketCustomer.leave(trip.shoemakerId);
          // }
        }

        const dataUpdateUser = trip.scheduleTime
          ? {
              isSchedule: false,
            }
          : {
              isTrip: false,
            };
        await this.shoemakerRepository.update({ id: userId }, dataUpdateUser);

        return 'Cancelled successfully.';
      }
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}