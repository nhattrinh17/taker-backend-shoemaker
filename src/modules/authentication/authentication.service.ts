import RedisService from '@common/services/redis.service';
import { Option, Shoemaker } from '@entities/index';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Redis } from 'ioredis';
import { Repository } from 'typeorm';

/**
 * Import dto
 */
import { CreateShoemakerDto, DeviceInfoDto, ForgotShoemakerDto, LoginShoemakerDto, NewPasswordDto, UpdateAvatarDto, UpdateFCMTokenUserDto, UpdateInformationDto, VerifyOtpDto, VerifyPhoneNumberDto } from './dto';

import { StepEnum } from '@common/enums/step.enum';
import { AppType, DEFAULT_MESSAGES, OPTIONS, S3Service, ShoemakerStatusEnum, SmsService, StringeeService, generateHashedPassword, generateOTP, makePhoneNumber, otpToText, validPassword } from '@common/index';
import { REDIS_PREFIX } from './constants';
import { DeviceRepositoryInterface } from 'src/database/interface/device.interface';
import { BonusPointService } from '@modules/bonus_point/bonus_point.service';

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly redis: RedisService,
    @InjectRepository(Shoemaker)
    private readonly userRepository: Repository<Shoemaker>,
    private readonly stringeeService: StringeeService,
    private readonly jwtService: JwtService,
    private readonly s3: S3Service,
    private readonly smsService: SmsService,
    @InjectRepository(Option) private optionRepository: Repository<Option>,
    private readonly bonusPointService: BonusPointService,
    @Inject('DeviceRepositoryInterface')
    private readonly deviceRepository: DeviceRepositoryInterface,
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

  async checkAndCreateDeviceInfo(userId: string, dto: DeviceInfoDto) {
    try {
      const user = await this.loadUser(userId);
      if (!user.deviceId && dto.deviceId && dto.deviceId2) {
        let deviceInfo = await this.deviceRepository.findOneByCondition([{ deviceId: dto.deviceId }, { deviceId2: dto.deviceId2 }]);
        if (!deviceInfo) {
          deviceInfo = await this.deviceRepository.create({ ...dto });
        }
        await this.userRepository.update(user.id, { deviceId: deviceInfo.id });
      }
    } catch (e) {
      return;
    }
  }

  async checkDeviceCreateMultiAcc(dto: DeviceInfoDto): Promise<string> {
    let deviceInfo = await this.deviceRepository.findOneByCondition([{ deviceId: dto.deviceId }, { deviceId2: dto.deviceId2 }]);
    if (deviceInfo) {
      const totalUserDevice = await this.userRepository.count({
        where: {
          deviceId: deviceInfo.id,
        },
      });
      if (totalUserDevice >= 2) {
        throw new Error('device_has_already_created_multi_account');
      }
    } else {
      deviceInfo = await this.deviceRepository.create(dto);
    }
    return deviceInfo.id;
  }

  /**
   * Function to load option
   * @returns option
   */
  private async loadOption() {
    try {
      const option = await this.optionRepository.findOneBy({
        key: OPTIONS.STRINGEE_NUMBER,
      });
      return option;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to verify phone number
   * @param phone
   * @returns boolean
   */
  async verifyPhoneNumber({ phone }: VerifyPhoneNumberDto) {
    try {
      const user = await this.userRepository.findOneBy({ phone });
      return !!user;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to create account
   * @param phone
   * @returns success
   */
  async createAccount(dto: CreateShoemakerDto) {
    try {
      // Check if phone number is existed
      const foundUser = await this.userRepository.findOneBy({ phone: dto.phone });
      if (foundUser) throw new BadRequestException('Phone number is existed');
      // Get DeviceId
      const deviceId = await this.checkDeviceCreateMultiAcc(dto);
      // Create account with phone and otp
      const dataCreate = {
        ...dto,
        registrationDate: new Date(),
        wallet: { balance: 0 },
        isVerified: false,
        step: StepEnum.REGISTER_INFO_SUCCESS,
        deviceId,
      };
      if (dto.password) dataCreate.password = generateHashedPassword(dto.password || '');
      const user = await this.userRepository.save(dataCreate);

      return { userId: user.id };
    } catch (e) {
      console.log('🚀 ~ AuthenticationService ~ createAccount ~ e:', e);
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to verify otp
   * @param userId
   * @param otp
   * @returns boolean
   */
  async verifyOtp({ userId, otp }: VerifyOtpDto) {
    try {
      const user = await this.userRepository.findOneBy({ id: userId, otp });
      if (!user) throw new BadRequestException('Invalid OTP');
      // Check and pay reward to referrer
      if (user.referralCode && !user.isVerified) {
        const referralUser = await this.userRepository.findOneBy({ phone: user.referralCode });
        if (referralUser) {
          await Promise.all([
            //
            this.bonusPointService.checkAndAddPointToReferralUser(referralUser.id),
            this.bonusPointService.checkAndAddPointToReferralUser(user.id),
          ]);
        }
      }

      // change step to New Password if status is pending
      if (user.status === ShoemakerStatusEnum.PENDING && !user.isVerified) {
        await this.userRepository.update(user.id, {
          step: StepEnum.COMPLETED,
          isVerified: true,
          otp: null,
        });
      }
      return !!user;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to update user
   * @param userId
   * @param dto
   * @returns string
   */
  async newPassword(userId: string, dto: NewPasswordDto) {
    console.log('🚀 ~ AuthenticationService ~ newPassword ~ dto:', dto);
    try {
      const user = await this.loadUser(userId);
      if (user.status === ShoemakerStatusEnum.PENDING && user.step !== StepEnum.NEW_PASSWORD) {
        // TODO: Unable when app approval
        // throw new BadRequestException('Invalid step');
      }

      const { password, otp } = dto;
      // TODO: Unable when app approval
      // if (user.otp !== otp) throw new BadRequestException('Invalid OTP');
      const updateData = {};

      updateData['password'] = generateHashedPassword(password);
      updateData['isVerified'] = true;
      updateData['otp'] = null;
      updateData['step'] = StepEnum.COMPLETED;

      await this.userRepository.update(user.id, updateData);

      return DEFAULT_MESSAGES.SUCCESS;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to login
   * @param phone
   * @param password
   * @returns user and token
   */
  async login(dto: LoginShoemakerDto) {
    try {
      const { phone, password } = dto;
      const user = await this.userRepository.findOneBy({ phone });
      if (!user) throw new BadRequestException('Invalid phone or password');

      if (!validPassword(password, user.password)) {
        throw new BadRequestException('Invalid phone or password');
      }

      const token = this.jwtService.sign({
        sub: user.id,
        type: AppType.shoemakers,
      });

      await Promise.all([
        //
        this.userRepository.update(user.id, { lastLoginDate: new Date() }),
        this.signPayload(token),
        this.checkAndCreateDeviceInfo(user.id, dto),
      ]);

      return {
        token,
        user: { fullName: user.fullName, id: user.id, avatar: user.avatar, status: user.status, isVerified: user.isVerified },
      };
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to update information
   * @param userId
   * @param dto
   * @returns string
   */
  async updateInformation(userId: string, dto: UpdateInformationDto) {
    try {
      const user = await this.loadUser(userId);
      console.log('🚀 ~ AuthenticationService ~ updateInformation ~ user:', user);
      // if (user.step !== StepEnum.REGISTER_INFO) {
      //   throw new BadRequestException('Invalid step');
      // }

      const updateData = {};
      if (dto.referralCode) updateData['referralCode'] = dto.referralCode;

      // Check email is existed and not belong to user
      // TODO: Unable when app approval
      // if (dto.email && dto.email != user.email) {
      //   const foundUser = await this.userRepository.findOneBy({
      //     email: dto.email,
      //   });
      //   if (foundUser) throw new BadRequestException('Email is existed');
      //   updateData['email'] = dto.email;
      // }
      if (dto.fullName) updateData['fullName'] = dto.fullName;
      if (dto.dateOfBirth) updateData['dateOfBirth'] = dto.dateOfBirth;
      if (dto.identityCard) updateData['identityCard'] = dto.identityCard;
      if (dto.placeOfOrigin) updateData['placeOfOrigin'] = dto.placeOfOrigin;
      if (dto.placeOfResidence) updateData['placeOfResidence'] = dto.placeOfResidence;
      if (dto.frontOfCardImage) updateData['frontOfCardImage'] = dto.frontOfCardImage;
      if (dto.backOfCardImage) updateData['backOfCardImage'] = dto.backOfCardImage;
      if (dto.workRegistrationArea) updateData['workRegistrationArea'] = dto.workRegistrationArea;
      if (dto.maritalStatus) updateData['maritalStatus'] = dto.maritalStatus;
      if (dto.accountNumber) updateData['accountNumber'] = dto.accountNumber;
      if (dto.accountName) updateData['accountName'] = dto.accountName;
      if (dto.bankName) updateData['bankName'] = dto.bankName;

      updateData['step'] = StepEnum.REGISTER_INFO_SUCCESS;

      await this.userRepository.update(user.id, updateData);
      return DEFAULT_MESSAGES.SUCCESS;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to update avatar
   * @param userId
   * @param dto
   * @returns string
   */
  async updateAvatar(userId: string, dto: UpdateAvatarDto) {
    try {
      const user = await this.loadUser(userId);
      if (user.status !== ShoemakerStatusEnum.ACTIVE) {
        throw new BadRequestException('Account is not active');
      }

      if (user.step !== StepEnum.REGISTER_INFO_SUCCESS) {
        throw new BadRequestException('Invalid step');
      }

      await this.userRepository.update(user.id, {
        avatar: dto.avatar,
        step: StepEnum.COMPLETED,
        lastLoginDate: new Date(),
      });

      const token = this.jwtService.sign({
        sub: user.id,
        type: AppType.customers,
      });

      await this.signPayload(token);
      return {
        token,
        user: { fullName: user.fullName, id: user.id, avatar: user.avatar },
      };
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to forgot password
   */
  async forgotPassword({ phone }: ForgotShoemakerDto) {
    try {
      // Generate OTP
      return this.makeCallUser(phone, true);
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to logout
   * @param userId
   * @returns success
   */
  async logout(userId: string) {
    try {
      const user = await this.loadUser(userId);
      await this.userRepository.update(user.id, { fcmToken: null });
      return DEFAULT_MESSAGES.SUCCESS;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to destroy
   * @param userId
   * @returns success
   */
  async destroy(userId: string) {
    try {
      const user = await this.loadUser(userId);
      await this.userRepository.softDelete(user.id);
      return DEFAULT_MESSAGES.SUCCESS;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  async signPayload(token: string) {
    try {
      const decoded: any = this.jwtService.decode(token);
      const key = `${REDIS_PREFIX}${decoded.sub}`;
      if (decoded.exp) {
        await this.redis.setExpire(key, 'true', Math.floor(decoded.exp - Date.now() / 1000));
      } else {
        await this.redis.set(key, 'true');
      }
    } catch (error) {
      throw new BadRequestException(error?.message);
    }
  }

  /**
   * Function to get signed file url
   * @param fileName
   * @returns signed file url
   */
  async getSignedFileUrl(userId: string, fileName: string) {
    try {
      await this.loadUser(userId);
      if (!fileName) throw new BadRequestException('File name is required');
      const res = this.s3.getSignedFileUrl(fileName);
      return res;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to get status
   * @param userId string
   * @returns return status and step of user
   */
  async getStatus(userId: string) {
    try {
      const user = await this.loadUser(userId);
      return { status: user.status, step: user.step };
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to call user
   * @param phone
   * @returns success
   */
  async makeCallUser(phone: string, isForgotPass?: boolean) {
    try {
      const user = await this.userRepository.findOneBy({ phone });
      if (!user) throw new BadRequestException('Account not found');
      //  Generate OTP and save
      const otp = generateOTP();
      const otpText = otpToText(otp);
      const phoneNumber = makePhoneNumber(phone);
      isForgotPass
        ? await this.userRepository.update(
            {
              id: user.id,
            },
            {
              otp: otp.toString(),
              step: StepEnum.NEW_PASSWORD,
            },
          )
        : await this.userRepository.update(
            {
              id: user.id,
            },
            {
              otp: otp.toString(),
            },
          );
      // Get option
      const option = await this.loadOption();
      // Make call to phone number with otp
      const res = await this.stringeeService.makeCall({
        toNumber: phoneNumber,
        otp: otpText,
        fromNumber: option?.value || null,
      });
      console.log('[STRINGEE][RES]', res?.data);
      return { userId: user.id };
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * Function to send sms
   * @param toNumber
   */
  async sendSms(phone: string) {
    try {
      const foundUser = await this.userRepository.findOneBy({ phone });
      if (!foundUser) throw new BadRequestException('Account not found');
      // Check have OTP
      if (!foundUser.otp) {
        const otp = generateOTP();
        foundUser.otp = otp.toString();
      }
      const today = new Date();
      const todayDateString = today.toISOString().split('T')[0];

      if (foundUser.lastOtpRequestDate?.toString() === todayDateString) {
        if (foundUser.otpRequestCount >= 5) {
          throw new BadRequestException('OTP request limit reached for today');
        }
        foundUser.otpRequestCount += 1;
      } else {
        foundUser.otpRequestCount = 1;
        foundUser.lastOtpRequestDate = today;
      }

      await this.userRepository.save(foundUser);
      const phoneNumber = makePhoneNumber(phone);

      const res = await this.smsService.send({
        toNumber: phoneNumber,
        otp: foundUser.otp,
      });

      return res;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  async updateFCMToken(dto: UpdateFCMTokenUserDto) {
    try {
      const user = await this.loadUser(dto.userId);
      if (user.step !== StepEnum.REGISTER_INFO_SUCCESS) {
        throw new BadRequestException('Invalid step');
      }
      await this.userRepository.update(user.id, { fcmToken: dto.fcmToken });

      return DEFAULT_MESSAGES.SUCCESS;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }
}
