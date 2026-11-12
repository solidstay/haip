import { DashboardSettingsController } from './dashboard-settings.controller';
import { DashboardSettingsService } from './dashboard-settings.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { UsersService } from './users.service';
import { RolesService } from './roles.service';

/**
 * Admin module — local user/role/permission administration.
 * Imports AuthModule to reuse PermissionsService (effective-permission resolution).
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminController, DashboardSettingsController],
  providers: [UsersService, RolesService, DashboardSettingsService],
  exports: [UsersService, RolesService],
})
export class AdminModule {}
