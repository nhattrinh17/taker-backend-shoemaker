import { IsString } from 'class-validator';
import { IsPhoneInVn } from '@common/index';
import { DeviceInfoDto } from './create-shoemaker.dto';

export class LoginShoemakerDto extends DeviceInfoDto {
  @IsPhoneInVn({ message: 'Invalid phone number' })
  @IsString()
  phone: string;

  @IsString()
  password: string;
}
