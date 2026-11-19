import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlusPriceId, recognizePlusPriceId, isPlusCheckoutPrice } from '../app/lib/billing/launch-plans.ts';

test('new checkouts use the new offer while legacy subscriptions retain recognition',()=>{
 const env={STRIPE_PLUS_PRICE_ID:'price_legacy',STRIPE_PLUS_NEW_PRICE_ID:'price_current'};
 assert.equal(getPlusPriceId(env),'price_current');
 assert.equal(recognizePlusPriceId('price_legacy',env),true);
 assert.equal(recognizePlusPriceId('price_current',env),true);
 assert.equal(recognizePlusPriceId('price_unrelated',env),false);
 assert.throws(()=>getPlusPriceId({...env,STRIPE_PLUS_NEW_PRICE_ID:'invalid'}));
});
test('checkout rejects wrong currency amounts, inactive prices, and nonmonthly offers',()=>{
 const price={active:true,type:'recurring',recurring:{interval:'month',interval_count:1},currency_options:{cad:{unit_amount:649},usd:{unit_amount:649}}};
 assert.equal(isPlusCheckoutPrice(price),true);
 for(const bad of [{...price,active:false},{...price,type:'one_time'}, {...price,recurring:{interval:'year',interval_count:1}}, {...price,recurring:{interval:'month',interval_count:2}}, {...price,currency_options:{cad:{unit_amount:649}}}, {...price,currency_options:{cad:{unit_amount:549},usd:{unit_amount:649}}}]) assert.equal(isPlusCheckoutPrice(bad),false);
});
