import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

const input = { name: 'Property awaiting setup', code: 'SETUP', countryCode: 'GB', timezone: 'Europe/London', currencyCode: 'GBP', totalRooms: 0 };
const errors = (value: object) => validateSync(plainToInstance(CreatePropertyDto, value), { whitelist: true, forbidNonWhitelisted: true });
describe('Property setup and activation input', () => {
  it('allows an initial property without inventing physical inventory', () => {
    expect(errors(input)).toEqual([]);
  });
  it.each([-1, 1.5, '0', null])('rejects invalid registered count %s', totalRooms => {
    expect(errors({ ...input, totalRooms })).not.toEqual([]);
  });
  it.each([false, true])('accepts explicit activation state %s on update', isActive => {
    expect(validateSync(plainToInstance(UpdatePropertyDto, { isActive }), { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });
  it.each(['false', 0, {}])('rejects a non-boolean activation state %s', isActive => {
    expect(validateSync(plainToInstance(UpdatePropertyDto, { isActive }))).not.toEqual([]);
  });
});

describe('Property reference fields', () => {
  it.each([{ countryCode: 'ZZ' }, { currencyCode: 'ABC' }, { timezone: 'Not/AZone' }])('rejects unrecognised values %o', fields => {
    expect(errors({ ...input, ...fields }).length).toBeGreaterThan(0);
    expect(validateSync(plainToInstance(UpdatePropertyDto, fields)).length).toBeGreaterThan(0);
  });
  it('normalizes country and currency codes without inventing a timezone', () => {
    const dto = plainToInstance(CreatePropertyDto, { ...input, countryCode: ' gb ', currencyCode: 'gbp', timezone: ' UTC ' });
    expect(validateSync(dto)).toEqual([]);
    expect(dto).toMatchObject({ countryCode: 'GB', currencyCode: 'GBP', timezone: 'UTC' });
  });
});
