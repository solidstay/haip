import { Type } from 'class-transformer';
import { PublicListingDto } from './public-listing.dto';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsISO8601, ValidateNested } from 'class-validator';
import { CreatePropertyDto } from './create-property.dto';

export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {
  @ApiPropertyOptional({ description: 'Expected modification timestamp; rejects stale edits' })
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;

  @ApiPropertyOptional({ type: PublicListingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PublicListingDto)
  publicListing?: PublicListingDto;

  @ApiPropertyOptional({ description: 'Hide an inactive property from active lists without deleting its records' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
