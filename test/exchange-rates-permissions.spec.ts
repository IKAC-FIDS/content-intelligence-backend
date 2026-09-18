import { PERMISSIONS_KEY } from '../src/common/decorators/permissions.decorator';
import { ExchangeRatesController } from '../src/admin/exchange-rates/exchange-rates.controller';
describe('ExchangeRatesController permissions', () => {
  it('protects reads and writes with dynamic permissions', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ExchangeRatesController.prototype.current)).toEqual({ actions: ['exchange-rate:view'], mode: 'all' });
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ExchangeRatesController.prototype.create)).toEqual({ actions: ['exchange-rate:manage'], mode: 'all' });
  });
});
