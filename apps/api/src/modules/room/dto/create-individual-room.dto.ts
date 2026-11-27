import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';

/** One advertised accommodation with one physical unit; existing models remain authoritative. */
export class CreateIndividualRoomDto {
  @ApiProperty() @IsUUID() propertyId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @Matches(/\S/) @MaxLength(100) name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @Matches(/\S/) @MaxLength(20) number!: string;
  @ApiProperty() @IsInt() @Min(1) maxOccupancy!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) floor?: string;
}
