import { Controller, Get, Post, Body, Patch, Param, Delete, Version, UseGuards, Query } from '@nestjs/common';
import { BonusPointService } from './bonus_point.service';
import { CurrentUser, Pagination, PaginationDto } from '@common/decorators';
import { IShoemaker } from '@common/constants';
import { ShoemakersAuthGuard } from '@common/guards';
import { ValidationPipe } from '@common/pipes';
import { CreateTransferBonusPointDto } from './dto/create-bonus_point.dto';
import { QueryGetProductDto } from './dto/query-bonus_point.dto';

@UseGuards(ShoemakersAuthGuard)
@Controller('bonus-point')
export class BonusPointController {
  constructor(private readonly bonusPointService: BonusPointService) {}

  @Get()
  @Version('1')
  getPoint(@CurrentUser() { sub }: IShoemaker) {
    return this.bonusPointService.getPoint(sub);
  }

  @Get('product')
  @Version('1')
  getProduct(@Pagination() pagination: PaginationDto, @Query(ValidationPipe) { type }: QueryGetProductDto) {
    return this.bonusPointService.getAllProduct(type, pagination);
  }

  @Post('transfer')
  @Version('1')
  transferPoint(@CurrentUser() { sub }: IShoemaker, @Body(ValidationPipe) dto: CreateTransferBonusPointDto) {
    return this.bonusPointService.transferPointToProduct(sub, dto);
  }
}
