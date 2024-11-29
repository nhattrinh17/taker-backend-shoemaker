import { Controller, Get, Post, Body, Patch, Param, Delete, Version } from '@nestjs/common';
import { OptionsService } from './options.service';

@Controller('options')
export class OptionsController {
  constructor(private readonly optionsService: OptionsService) {}

  @Get(':key')
  @Version('1')
  findOne(@Param('key') key: string) {
    return this.optionsService.findOne(key);
  }
}
