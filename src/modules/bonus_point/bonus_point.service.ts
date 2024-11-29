import { Inject, Injectable } from '@nestjs/common';
import { BonusPointRepositoryInterface } from 'src/database/interface/bonusPoint.interface';
import { IsNull } from 'typeorm';
import { CreateTransferBonusPointDto } from './dto/create-bonus_point.dto';
import { PointToProductRepositoryInterface } from 'src/database/interface/pointToProduct.interface';
import { messageResponseError, TypeUpdateBonusPointOrWallet } from '@common/constants';
import { TypeBonusProductEnum } from '@common/enums/bonusPoint.enum';
import { WalletRepositoryInterface } from 'src/database/interface/wallet.interface';
import { PaginationDto } from '@common/decorators';

@Injectable()
export class BonusPointService {
  constructor(
    @Inject('BonusPointRepositoryInterface')
    private readonly bonusPointRepository: BonusPointRepositoryInterface,
    @Inject('PointToProductRepositoryInterface')
    private readonly pointToProductRepository: PointToProductRepositoryInterface,
    @Inject('WalletRepositoryInterface')
    private readonly walletRepository: WalletRepositoryInterface,
  ) {}

  async checkAndAddPointToReferralUser(userId: string) {
    console.log('🚀 ~ Shoemaker BonusPointService ~ checkAndAddPointToReferralUser ~ userId:', userId);
    const filter = {
      customerId: IsNull(),
      shoemakerId: userId,
    };
    let bonusPoint = await this.bonusPointRepository.findOneByCondition(filter);
    if (!bonusPoint) {
      bonusPoint = await this.bonusPointRepository.create({ shoemakerId: userId, points: 0 });
    }

    console.log('🚀 ~ Shoemaker BonusPointService ~ checkAndAddPointToReferralUser ~ bonusPoint.id:', bonusPoint.id);
    const upBonusPoint = await this.bonusPointRepository.callProcedureUpdatePoint({
      point: 30,
      description: `Cộng điểm giới thiệu ứng dụng thành công`,
      type: TypeUpdateBonusPointOrWallet.up,
      bonusPointId: bonusPoint.id,
    });
    return 'Update bonus point successfully';
  }

  async getPoint(userId: string) {
    const filter = {
      customerId: IsNull(),
      shoemakerId: userId,
    };
    let bonusPoint = await this.bonusPointRepository.findOneByCondition(filter);
    if (!bonusPoint) {
      bonusPoint = await this.bonusPointRepository.create({ customerId: userId, points: 0 });
    }
    return bonusPoint.points;
  }

  async getAllProduct(type: string, pagination: PaginationDto) {
    const filter: any = {};
    if (type) filter.type = type;
    return this.pointToProductRepository.findAll(filter, { ...pagination });
  }

  async transferPointToProduct(userId: string, dto: CreateTransferBonusPointDto) {
    try {
      const product = await this.pointToProductRepository.findOneById(dto.idProduct);
      if (!product) {
        throw new Error(messageResponseError.pointToProduct.notFound);
      }

      // trừ điểm
      const filter = {
        shoemakerId: userId,
      };

      const bonusPoint = await this.bonusPointRepository.findOneByCondition(filter);

      const downPoint = await this.bonusPointRepository.callProcedureUpdatePoint({ bonusPointId: bonusPoint.id, description: `Trừ điểm sử dụng ${product.name}`, point: dto.points, type: TypeUpdateBonusPointOrWallet.down });

      if (product.type == TypeBonusProductEnum.TRANSFER_WALLET) {
        const walletCustomer = await this.walletRepository.findOneByCondition(filter);
        const amount = dto.points * product.rate;
        const upWallet = await this.walletRepository.callProcedureUpdateWallet({
          amount,
          description: `Cộng tiền từ giao dịch chuyển đổi ${dto.points} điểm`,
          type: TypeUpdateBonusPointOrWallet.up,
          walletId: walletCustomer.id,
        });
        return 'Update wallet successfully';
      } else {
        return {
          message: 'Chuyển điểm sang mã thành công',
          data: product.code,
        };
      }
    } catch (error) {
      return {
        error: error.message,
      };
    }
  }
}
