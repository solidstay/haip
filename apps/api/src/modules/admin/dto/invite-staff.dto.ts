import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEmail, IsISO8601, IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { STAFF_ROLE_KEYS, type StaffRoleKey } from '@telivityhaip/shared';
export class StaffAccessDto {
  @ApiProperty({ enum: [...STAFF_ROLE_KEYS] })
  @IsIn(STAFF_ROLE_KEYS)
  roleKey!: StaffRoleKey;

  @ApiProperty({ type: [String], description: 'Selected properties. Platform administrators must select every active property.' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ArrayUnique() @IsUUID('all', { each: true })
  propertyIds!: string[];
}
export class InviteStaffDto extends StaffAccessDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  name!: string;
  @ApiProperty() @IsEmail() @MaxLength(255)
  email!: string;
}
export class UpdateStaffAccessDto extends StaffAccessDto {
  @ApiProperty() @IsISO8601()
  expectedUpdatedAt!: string;
}
