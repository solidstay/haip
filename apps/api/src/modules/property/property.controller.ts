import {
  Controller,
  Query,
  Optional,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { userCanAccessProperty } from '../auth/property-access';
import { PropertyLocationService } from './property-location.service';
import { PropertyService } from './property.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { AuditActorCtx, type AuditActor } from '../../common/audit/audit-actor';

@ApiTags('properties')
@Controller('properties')
export class PropertyController {
  constructor(
    private readonly propertyService: PropertyService,
    private readonly configService: ConfigService,
    @Optional() private readonly locations?: PropertyLocationService,
  ) {}

  private authOn(): boolean {
    return this.configService.get<string>('AUTH_ENABLED', 'true') !== 'false';
  }

  @Get()
  @ApiOperation({ summary: 'Get all active properties' })
  @ApiResponse({ status: 200, description: 'List of properties' })
  async getAllProperties(@CurrentUser() user?: AuthUser) {
    const all = await this.propertyService.findAll();
    // The `properties` row IS the tenant, so the global PropertyScopeGuard can't
    // bind it (the id param is `:id`, not `propertyId`). Scope the list to the
    // caller's memberships here; demo (auth off) returns everything.
    if (!this.authOn() || !user) return all;
    return all.filter((p) => userCanAccessProperty(user, p.id));
  }

  // Reference lookup does not read tenant data; authenticated staff only.
  @Get('location-search')
  @Roles('admin', 'general_manager')
  @ApiOperation({ summary: 'Find property address or UK postcode suggestions' })
  searchLocation(@Query('q') q: string, @Query('country') country: string, @Query('kind') kind = 'address') {
    return this.locations!.search(q, country, kind);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get property by ID' })
  @ApiResponse({ status: 200, description: 'Property found' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  getPropertyById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    if (this.authOn() && user && !userCanAccessProperty(user, id)) {
      throw new ForbiddenException('You do not have access to this property');
    }
    return this.propertyService.findById(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create new property' })
  @ApiResponse({ status: 201, description: 'Property created' })
  createProperty(@Body() dto: CreatePropertyDto, @CurrentUser() user?: AuthUser, @AuditActorCtx() actor?: AuditActor) {
    return this.propertyService.create(dto, user, actor);
  }

  @Patch(':id')
  @Roles('admin', 'general_manager')
  @ApiOperation({ summary: 'Update property' })
  @ApiResponse({ status: 200, description: 'Property updated' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  updateProperty(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePropertyDto,
    @AuditActorCtx() actor?: AuditActor,
    @CurrentUser() user?: AuthUser,
  ) {
    if (this.authOn() && (!user || !userCanAccessProperty(user, id))) throw new ForbiddenException('You do not have access to this property');
    return this.propertyService.update(id, dto, actor);
  }
}
