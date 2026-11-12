import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn } from 'class-validator';
import { DASHBOARD_FEATURES, type DashboardFeature } from '@telivityhaip/shared';
import { Roles } from '../auth/roles.decorator';
import { AuditActorCtx, type AuditActor } from '../../common/audit/audit-actor';
import { DashboardSettingsService } from './dashboard-settings.service';

export class UpdateDashboardFeaturesDto {
  @ApiProperty({ enum: [...DASHBOARD_FEATURES], isArray: true })
  @IsArray()
  @ArrayMaxSize(DASHBOARD_FEATURES.length)
  @ArrayUnique()
  @IsIn(DASHBOARD_FEATURES, { each: true })
  enabled!: DashboardFeature[];
}

@ApiTags('admin')
@Controller('admin/dashboard-features')
export class DashboardSettingsController {
  constructor(private readonly settings: DashboardSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Shared dashboard navigation preferences (any authenticated staff)' })
  get() { return this.settings.get(); }

  @Put()
  @Roles('admin')
  @ApiOperation({ summary: 'Set shared dashboard navigation preferences for all staff; does not change permissions or services' })
  update(@Body() dto: UpdateDashboardFeaturesDto, @AuditActorCtx() actor: AuditActor) {
    return this.settings.update(dto, actor);
  }
}
