import { IPeriod } from '@common/constants/app.constant';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class FcmTokenDto {
  @IsString()
  fcmToken: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  bankName: string;

  @IsOptional()
  @IsString()
  accountNumber: string;

  @IsOptional()
  @IsString()
  accountName: string;

  @IsOptional()
  @IsString()
  avatar: string;

  @IsOptional()
  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  password: string;

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

export class ReferralDto {
  @IsInt()
  @Transform(({ value }) => Number(value))
  take: number;

  @IsInt()
  @Type(() => Number)
  skip: number;
}

export class MyIncomeDto {
  @IsOptional()
  @IsIn(['week', 'month', 'today', 'custom'])
  period: IPeriod;

  @IsOptional()
  @IsString()
  start: string;

  @IsOptional()
  @IsString()
  end: string;
}
