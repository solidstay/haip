import { RoomController } from './room.controller';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { CleaningFeeDto } from './dto/cleaning-fee.dto';
describe('cleaning fee input', () => {
  it.each(['-1', '1.001', 'NaN', 'Infinity', '1e2', '', '10000000000.00'])('rejects invalid money %s', async amount => {
    expect((await validate(Object.assign(new CleaningFeeDto(), { amount, currencyCode: 'GBP' }))).length).toBeGreaterThan(0);
  });
  it.each(['0', '0.00', '25.50'])('allows %s', async amount => {
    expect(await validate(Object.assign(new CleaningFeeDto(), { amount, currencyCode: 'GBP' }))).toEqual([]);
  });
  it('requires both room and fee write permissions', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.setCleaningFee))
      .toEqual(['ops.manage', 'services.manage']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.getCleaningFee))
      .toEqual(['ops.read', 'services.read']);
  });
  it('rejects invalid currencies', async () => {
    expect((await validate(Object.assign(new CleaningFeeDto(), { amount: '25.00', currencyCode: 'gbp' }))).length).toBeGreaterThan(0);
  });
});
