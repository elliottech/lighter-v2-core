import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {ParseUSDC, ParseWETH, CreateLimitOrder, CreatePerformanceLimitOrder} from './shared'
import {reportGasCost} from 'reports'
import {setupFixturesForSmartWallet} from './default-fixture'

describe('benchmark limit order creation', function () {
  describe('creates 1 order', () => {
    it('limit ask', async function () {
      await test(CreateLimitOrder, 'CREATE_1_ASK_LIMIT_ORDER', true)
    })
    it('limit bid', async function () {
      await test(CreateLimitOrder, 'CREATE_1_BID_LIMIT_ORDER', false)
    })
    it('performance ask', async function () {
      await test(CreatePerformanceLimitOrder, 'CREATE_1_ASK_PERFORMANCE_ORDER', true)
    })
    it('performance bid', async function () {
      await test(CreatePerformanceLimitOrder, 'CREATE_1_BID_PERFORMANCE_ORDER', false)
    })

    async function test(f: any, scenario: string, isAsk: boolean) {
      const {acc1, orderBook} = await loadFixture(setupFixturesForSmartWallet)

      const tx = await f(acc1, orderBook, [
        {
          amount0: ParseWETH('1.0'),
          price: ParseUSDC(1425),
          isAsk: isAsk,
          hintId: 0,
        },
      ])

      await reportGasCost(scenario, tx)
    }
  })

  describe('creates 4 order', async () => {
    it('limit', async () => {
      await test(CreateLimitOrder, 'CREATE_4_LIMIT_ORDERS')
    })
    it('performance', async () => {
      await test(CreatePerformanceLimitOrder, 'CREATE_4_PERFORMANCE_ORDERS')
    })

    async function test(f: any, scenario: string) {
      const {acc1, orderBook} = await loadFixture(setupFixturesForSmartWallet)

      const tx = await f(acc1, orderBook, [
        {
          amount0: ParseWETH('1.0'),
          price: ParseUSDC(1440),
          isAsk: true,
          hintId: 0,
        },
        {
          amount0: ParseWETH('1.5'),
          price: ParseUSDC(1430),
          isAsk: true,
          hintId: 0,
        },
        {
          amount0: ParseWETH('1'),
          price: ParseUSDC(1410),
          isAsk: false,
          hintId: 0,
        },
        {
          amount0: ParseWETH('1.5'),
          price: ParseUSDC(1420),
          isAsk: false,
          hintId: 0,
        },
      ])

      await reportGasCost(scenario, tx)
    }
  })
})
