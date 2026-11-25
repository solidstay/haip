import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AssignRolesDto } from './assign-roles.dto';

export class AssignPropertyRolesDto extends AssignRolesDto {
  @ApiProperty({ format: 'uuid', description: "An existing home or membership property; the caller must manage users there as well as at the target property" })
  @IsUUID()
  sourcePropertyId!: string;
}
