import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { userCanAccessProperty } from '../auth/property-access';
import { Roles } from '../auth/roles.decorator';
import { MediaService } from './media.service';
import { CreateMediaDto } from './dto/create-media.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { QueryMediaDto } from './dto/query-media.dto';
import { ReorderMediaDto } from './dto/reorder-media.dto';
import { UploadMediaDto } from './dto/upload-media.dto';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get('config')
  @ApiOperation({ summary: 'Whether the upload pipeline is available' })
  getConfig() {
    return this.mediaService.getConfig();
  }

  @Get()
  @ApiOperation({ summary: 'List media for an owner (property/room_type/room)' })
  @ApiResponse({ status: 200, description: 'Media ordered by sortOrder' })
  list(@Query() query: QueryMediaDto) {
    return this.mediaService.findByOwner(
      query.propertyId,
      query.ownerType,
      query.ownerId,
    );
  }

  @Post()
  @Roles('admin', 'general_manager', 'front_desk')
  @ApiOperation({ summary: 'Attach an image by URL' })
  @ApiResponse({ status: 201, description: 'Media created' })
  create(@Body() dto: CreateMediaDto) {
    return this.mediaService.create(dto);
  }

  @Post('reorder')
  @Roles('admin', 'general_manager', 'front_desk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder an owner\'s media' })
  reorder(@Body() dto: ReorderMediaDto) {
    return this.mediaService.reorder(dto);
  }

  @Post('upload')
  @Roles('admin', 'general_manager', 'front_desk')
  @UseInterceptors(
    FileInterceptor('file', {
      // Cap upload size (DoS: the buffer is held in memory) and reject obvious
      // non-images early. Content is additionally magic-byte checked in the
      // service so a forged Content-Type can't smuggle HTML/SVG.
      limits: { fileSize: 15 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) => {
        const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
        cb(ok ? null : new BadRequestException('Only JPEG, PNG, or WebP images are allowed'), ok);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an image to object storage and attach it' })
  @ApiResponse({ status: 201, description: 'Media created from upload' })
  @ApiResponse({ status: 501, description: 'Object storage not configured' })
  upload(
    @Body() dto: UploadMediaDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    if (!userCanAccessProperty(user, dto.propertyId)) throw new ForbiddenException('Property access denied');
    return this.mediaService.uploadAndCreate(dto, file);
  }

  @Post(':id/primary')
  @Roles('admin', 'general_manager', 'front_desk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a media item as the owner\'s primary image' })
  setPrimary(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    return this.mediaService.setPrimary(id, propertyId);
  }

  @Patch(':id')
  @Roles('admin', 'general_manager', 'front_desk')
  @ApiOperation({ summary: 'Update media metadata (caption, category, order)' })
  @ApiResponse({ status: 200, description: 'Media updated' })
  @ApiResponse({ status: 404, description: 'Media not found at this property' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: UpdateMediaDto,
  ) {
    return this.mediaService.update(id, propertyId, dto);
  }

  @Delete(':id')
  @Roles('admin', 'general_manager', 'front_desk')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a media item (scoped to property)' })
  @ApiResponse({ status: 204, description: 'Media deleted' })
  @ApiResponse({ status: 404, description: 'Media not found at this property' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('propertyId', ParseUUIDPipe) propertyId: string,
  ): Promise<void> {
    await this.mediaService.delete(id, propertyId);
  }
}
