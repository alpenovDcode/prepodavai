import { GenerationsThrottlerGuard } from './generations-throttler.guard';
import { HttpException } from '@nestjs/common';

describe('GenerationsThrottlerGuard v6 compatibility', () => {
  const make = (user: any, result: any) => {
    const guard: any = Object.create(GenerationsThrottlerGuard.prototype);
    const increment = jest.fn(async () => result);
    guard.storageService = { increment };
    const req = { user, ip: '192.0.2.10', headers: { 'x-forwarded-for': '198.51.100.9' } };
    const context: any = { switchToHttp: () => ({ getRequest: () => req }) };
    const props = { context, throttler: { name: 'default' }, getTracker: (r: any) => guard.getTracker(r), generateKey: (_c: any, tracker: string, name: string) => `${tracker}:${name}` };
    return { guard, increment, req, props };
  };
  test.each([['START',15],['PRO',30],['BUSINESS',50]])('preserves %s limits and passes all storage arguments', async (plan, limit) => {
    const {guard, increment, props} = make({id:'test-user',plan}, {totalHits:1,isBlocked:false});
    await expect(guard.handleRequest(props)).resolves.toBe(true);
    expect(increment).toHaveBeenCalledWith('user-test-user:default',60000,limit,60000,'default');
  });
  test('honors blocked storage records even when hit counter resets', async () => {
    const {guard,props} = make({id:'test-user'}, {totalHits:0,isBlocked:true});
    await expect(guard.handleRequest(props)).rejects.toBeInstanceOf(HttpException);
  });
  test('uses proxy-validated IP for anonymous requests', async () => {
    const {guard,increment,props}=make(undefined,{totalHits:1,isBlocked:false});
    await guard.handleRequest(props);
    expect(increment).toHaveBeenCalledWith('ip-192.0.2.10:default',60000,5,60000,'default');
  });
});
