import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { And, Equal, In, IsNull, Not, Repository } from 'typeorm';

import { StatusEnum } from '@common/enums/status.enum';
import { DEFAULT_MESSAGES, QUEUE_NAMES, S3Service, generateHashedPassword } from '@common/index';
import { Shoemaker, Trip } from '@entities/index';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

import { IPeriod } from '@common/constants/app.constant';
import { getDatesByWeekOrMonth } from '@common/helpers/date.helper';
import { FcmTokenDto, ReferralDto, UpdateProfileDto } from './dto/profile.dto';
import { BullQueueService } from '@modules/bullQueue/bullQueue.service';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Shoemaker)
    private readonly userRepository: Repository<Shoemaker>,
    private readonly s3: S3Service,
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    private readonly bullQueueService: BullQueueService,
  ) {}

  /**
   * Function to load user
   * @param userId
   * @returns user
   */
  private async loadUser(userId: string) {
    try {
      const user = await this.userRepository.findOneBy({ id: userId });
      if (!user) throw new NotFoundException('User not found');
      return user;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to set fcm token
   * @param userId
   * @param fcmToken
   * @returns success
   */
  async setFcmToken(userId: string, { fcmToken }: FcmTokenDto) {
    try {
      const user = await this.loadUser(userId);

      await this.userRepository.update(user.id, { fcmToken });

      return DEFAULT_MESSAGES.SUCCESS;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to update user
   * @param userId
   * @param dto
   * @returns success
   */
  async update(userId: string, dto: UpdateProfileDto) {
    try {
      const user = await this.loadUser(userId);
      // Check email is existed and not belong to user
      if (dto.email && dto.email != user.email) {
        const foundUser = await this.userRepository.findOneBy({
          id: Not(userId),
          email: And(Not(IsNull()), Equal(dto.email)),
        });
        if (foundUser) throw new BadRequestException('Email is existed');
      }
      const newEntity = { ...dto };
      // Check password is existed and generate hashed password
      if (dto.password) {
        newEntity.password = generateHashedPassword(dto.password);
      }

      await this.userRepository.update(user.id, newEntity);

      return DEFAULT_MESSAGES.SUCCESS;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to get signed file url
   * @param fileName
   * @returns signed file url
   */
  async getSignedFileUrl(fileName: string) {
    try {
      if (!fileName) throw new BadRequestException('File name is required');
      const res = this.s3.getSignedFileUrl(fileName);
      return res;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to get referral
   * @param userId string
   * @returns List of referral
   */
  async getReferral(userId: string, { take, skip }: ReferralDto) {
    try {
      const user = await this.loadUser(userId);

      const referral = await this.userRepository.find({
        select: ['phone', 'createdAt'],
        where: { referralCode: user.phone },
        take,
        skip,
      });

      return referral;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to get profile
   * @param userId string
   * @returns profile
   */
  async getProfile(userId: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['rating'],
      });

      return {
        id: user.id,
        fullName: user.fullName,
        status: user.status,
        isOn: user.isOn,
        isVerified: user.isVerified,
        phone: user.phone,
        avatar: user.avatar,
        bankName: user.bankName,
        accountNumber: user.accountNumber,
        accountName: user.accountName,
        identityCard: user.identityCard,
        email: user.email,
        dateOfBirth: user.dateOfBirth,
        placeOfOrigin: user.placeOfOrigin,
        placeOfResidence: user.placeOfResidence,
        maritalStatus: user.maritalStatus,
        workRegistrationArea: user.workRegistrationArea,
        frontOfCardImage: user.frontOfCardImage,
        backOfCardImage: user.backOfCardImage,
        rating: user.rating && {
          average: user.rating.average,
          count: user.rating.count,
        },
        serviceShoe: user.serviceShoe,
        serviceBike: user.serviceBike,
        serviceFood: user.serviceFood,
      };
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to set on
   * @param userId string
   * @returns success
   */
  async setOn(userId: string) {
    try {
      const user = await this.loadUser(userId);

      await this.userRepository.update(user.id, { isOn: !user.isOn });
      // If user work status is false, send notification to user after 5 minutes
      if (user.isOn) {
        // Send notification to user after 5 minutes
        this.bullQueueService.addWorkStatusToQueue(
          'work-status',
          {
            userId: user.id,
          },
          {
            delay: 5 * 60 * 1000,
          },
        );
      }
      return DEFAULT_MESSAGES.SUCCESS;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to get online status
   * @param userId string
   * @returns online status
   */
  async getOnlineStatus(userId: string) {
    try {
      const user = await this.loadUser(userId);

      return user.isOn;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to get my income
   * @param userId string
   * @returns my income
   */
  async getMyIncome(userId: string, period: IPeriod, start?: string, end?: string) {
    try {
      const user = await this.loadUser(userId);
      const dates = getDatesByWeekOrMonth(period, start, end);

      const trips = await this.tripRepository.find({
        where: {
          shoemakerId: user.id,
          status: StatusEnum.COMPLETED,
          date: In(dates),
        },
      });

      const summary = trips.reduce(
        (acc, trip) => {
          acc.income += trip.income;
          acc.total += trip.totalPrice;
          return acc;
        },
        { income: 0, total: 0 },
      );

      return {
        count: trips.length,
        ...summary,
      };
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }
}
