import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { IsMoneyString } from '../../../common/validation/is-money-string.validator';

export class CleaningFeeDto {
  @ApiProperty({ description: 'Fixed fee once per stay. Zero removes the fee.', example: '25.00' })
  @IsMoneyString({ allowZero: true })
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  amount!: string;

  @ApiProperty({ example: 'GBP' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currencyCode!: string;
}
