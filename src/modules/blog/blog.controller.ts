import { Controller, Get, Post, Body, Patch, Param, Delete, Version, UseGuards } from '@nestjs/common';
import { BlogService } from './blog.service';
import { ShoemakersAuthGuard } from '@common/guards';

@Controller('blogs')
@UseGuards(ShoemakersAuthGuard)
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @Version('1')
  findAll() {
    return this.blogService.findAll();
  }
}
