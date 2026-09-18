import { BRAND, BUSINESS_THEME } from './config/brand';

test('exposes the production business brand configuration', () => {
  expect(BRAND.name).toBe('星链云客系统');
  expect(BUSINESS_THEME.primary).toBeTruthy();
});
