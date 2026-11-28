import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { AuditActorCtx, type AuditActor } from '../../common/audit/audit-actor';
import { StaffInvitationsService } from './staff-invitations.service';
import { InviteStaffDto, UpdateStaffAccessDto } from './dto/invite-staff.dto';
/** Portfolio identity administration. Service also checks native grants at every affected property. */
@ApiTags('staff-invitations')
@Controller('admin/staff')
@Roles('admin')
export class StaffInvitationsController {
  constructor(private readonly staff: StaffInvitationsService) {}
  @Get('options') @ApiOperation({ summary: 'Staff roles and manageable properties' })
  options(@CurrentUser() user: AuthUser) { return this.staff.options(user); }
  @Get() @ApiOperation({ summary: 'Invited staff and delivery status' })
  list(@CurrentUser() user: AuthUser) { return this.staff.list(user); }
  @Post() @ApiOperation({ summary: 'Create a staff login and send a password-setup invitation' })
  create(@Body() dto: InviteStaffDto, @CurrentUser() user: AuthUser, @AuditActorCtx() actor: AuditActor) { return this.staff.create(dto, user, actor); }
  @Post(':id/resend') @ApiOperation({ summary: 'Retry or resend a pending invitation' })
  resend(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @AuditActorCtx() actor: AuditActor) { return this.staff.resend(id, user, actor); }
  @Put(':id/access') @ApiOperation({ summary: 'Replace role and property access for invited staff' })
  access(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffAccessDto, @CurrentUser() user: AuthUser, @AuditActorCtx() actor: AuditActor) { return this.staff.access(id, dto, user, actor); }
  @Post(':id/disable') @ApiOperation({ summary: 'Disable staff and revoke their sign-in sessions' })
  disable(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @AuditActorCtx() actor: AuditActor) { return this.staff.disable(id, user, actor); }
}
