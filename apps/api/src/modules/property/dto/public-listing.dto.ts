import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

class PublicAddressDto {
  @IsString() @MaxLength(255) streetAddress!: string;
  @IsString() @MaxLength(20) postalCode!: string;
}
class PublicMapDto {
  @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsIn(['approximate', 'exact']) precision!: 'approximate' | 'exact';
}
/** Explicit guest-facing content. Financial policies remain in the rate engine. */
export class PublicListingDto {
  @ApiPropertyOptional({ nullable: true, enum: ['hotel', 'apartment', 'serviced_apartment', 'aparthotel', 'holiday_home'] })
  @IsOptional()
  @IsIn(['hotel', 'apartment', 'serviced_apartment', 'aparthotel', 'holiday_home'])
  propertyType?: 'hotel' | 'apartment' | 'serviced_apartment' | 'aparthotel' | 'holiday_home' | null;
  @ApiPropertyOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  houseRules!: string[];
  @ApiPropertyOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  amenities!: string[];
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => PublicAddressDto)
  address?: PublicAddressDto | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => PublicMapDto)
  map?: PublicMapDto | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  checkInUntil?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  checkOutFrom?: string | null;
}
