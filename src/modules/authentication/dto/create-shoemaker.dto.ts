import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { IsPhoneInVn, ServiceShoemakerEnum } from '@common/index';

export class DeviceInfoDto {
  @IsOptional()
  @IsString()
  deviceId: string;

  @IsOptional()
  @IsString()
  deviceId2: string;

  @IsOptional()
  @IsString()
  manufacturer: string;

  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  memory: number;

  @IsOptional()
  @IsString()
  model: string;

  @IsOptional()
  @IsString()
  systemName: string;

  @IsOptional()
  @IsString()
  deviceType: string;
}
export class CreateShoemakerDto extends DeviceInfoDto {
  @IsPhoneInVn({ message: 'Invalid phone number' })
  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  password: string;

  @IsOptional()
  @IsString()
  referralCode: string;

  @IsOptional()
  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  dateOfBirth: Date;

  @IsOptional()
  @IsString()
  identityCard: string;

  @IsOptional()
  @IsString()
  placeOfOrigin: string;

  @IsOptional()
  @IsString()
  placeOfResidence: string;

  @IsOptional()
  @IsString()
  frontOfCardImage: string;

  @IsOptional()
  @IsString()
  backOfCardImage: string;

  @IsOptional()
  @IsString()
  workRegistrationArea: string;

  @IsOptional()
  @IsString()
  maritalStatus: string;

  @IsOptional()
  @IsString()
  accountNumber: string;

  @IsOptional()
  @IsString()
  accountName: string;

  @IsOptional()
  @IsString()
  bankName: string;

  @IsOptional()
  @IsBoolean()
  serviceShoe: boolean;

  @IsOptional()
  @IsBoolean()
  serviceBike: boolean;

  @IsOptional()
  @IsBoolean()
  serviceFood: boolean;

  @IsOptional()
  @IsString()
  platform: string;
}

export class VerifyPhoneNumberDto {
  @IsString()
  @IsPhoneInVn({ message: 'Invalid phone number' })
  phone: string;
}

export class VerifyOtpDto {
  @IsString()
  otp: string;

  @IsUUID()
  userId: string;
}
