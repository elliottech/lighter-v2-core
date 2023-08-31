import {
  expect,
  expectOrderBook,
  ParseUSDC,
  ParseWETH,
  CancelLimitOrder,
  CreateLimitOrder,
  CreatePerformanceLimitOrder,
} from 'test/shared'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {setupFixturesForSmartWallet} from './default-fixture'
import {reportGasCost} from 'reports'

describe('smart wallet: performance orders', () => {
  async function expectInitialState(s: any) {
    await expectOrderBook(s.orderBook, [3, 6, 2, 0], [4, 7, 5, 0])
    expect(await s.orderBook.claimableToken0Balance(s.acc1.address)).to.equal(ParseWETH(10))
    expect(await s.orderBook.claimableToken1Balance(s.acc1.address)).to.equal(ParseUSDC(15000))
  }

  it('loads fixtures', async () => {
    const s = await loadFixture(setupFixturesForSmartWallet)
    await expectInitialState(s)
  })

  async function createPerformanceOrder(s: any, isAsk: boolean) {
    return await CreatePerformanceLimitOrder(s.acc1, s.orderBook, [
      {
        amount0: ParseWETH('1.0'),
        price: ParseUSDC(1425),
        isAsk: isAsk,
        hintId: 0,
      },
    ])
  }

  describe('created performance limit orders', () => {
    it('ask', async () => {
      const s = await test('CREATE_1_ASK_LIMIT_ORDER_PERFORMANCE', true)
      await expectOrderBook(s.orderBook, [9, 3, 6, 2, 0], [4, 7, 5, 0])
    })
    it('bid', async () => {
      const s = await test('CREATE_1_BID_LIMIT_ORDER_PERFORMANCE', false)
      await expectOrderBook(s.orderBook, [3, 6, 2, 0], [9, 4, 7, 5, 0])
    })

    async function test(scenario: string, isAsk: boolean) {
      const s = await loadFixture(setupFixturesForSmartWallet)
      const tx = await createPerformanceOrder(s, isAsk)
      await reportGasCost(scenario, tx)
      return s
    }
  })

  describe('cancels performance limit orders', () => {
    it('bid', async () => {
      const s = await loadFixture(setupFixturesForSmartWallet)

      await createPerformanceOrder(s, false)

      // cancel order
      const tx = await CancelLimitOrder(s.acc1, s.orderBook, [9])
      await reportGasCost('CANCEL_1_LIMIT_ORDER_PERFORMANCE', tx)

      // order is canceled & funds are returned to smart wallet, not to the orders owner
      await expectInitialState(s)
    })
    it('ask', async () => {
      const s = await loadFixture(setupFixturesForSmartWallet)

      await createPerformanceOrder(s, true)
      // cancel order
      const tx = await CancelLimitOrder(s.acc1, s.orderBook, [9])

      // order is canceled & funds are returned to smart wallet, not to the orders owner
      await expectInitialState(s)
    })
  })

  it('fails when not enough funds', async () => {
    const s = await loadFixture(setupFixturesForSmartWallet)

    const tx = CreatePerformanceLimitOrder(s.acc1, s.orderBook, [
      {
        amount0: ParseWETH('10.1'),
        price: ParseUSDC(1400),
        isAsk: true,
        hintId: 0,
      },
    ])

    await expect(tx).to.be.revertedWithCustomError(s.orderBook, 'LighterV2Order_InsufficientClaimableBalance')
  })

  it('matches and sends funds correctly', async () => {
    const s = await loadFixture(setupFixturesForSmartWallet)

    const before = await s.weth.balanceOf(s.acc2.address)

    const tx = await CreatePerformanceLimitOrder(s.acc1, s.orderBook, [
      {
        amount0: ParseWETH('2'),
        price: ParseUSDC(1400),
        isAsk: true,
        hintId: 0,
      },
    ])

    const after = await s.weth.balanceOf(s.acc2.address)

    // swap is happening, since order is matching aggressively
    await expect(tx).to.emit(s.orderBook, 'Swap')

    // claimable decreases
    expect(await s.orderBook.claimableToken0Balance(s.acc1.address)).to.equal(ParseWETH('8'))

    // maker WETH balance increases
    expect(after.sub(before)).to.equal(ParseWETH(1.5))
  })

  it('can be matched against', async () => {
    const s = await loadFixture(setupFixturesForSmartWallet)

    const before = await s.orderBook.claimableToken1Balance(s.acc1.address)

    await CreatePerformanceLimitOrder(s.acc1, s.orderBook, [
      {
        amount0: ParseWETH('1'),
        price: ParseUSDC(1425),
        isAsk: true,
        hintId: 0,
      },
    ])
    await CreateLimitOrder(s.acc1, s.orderBook, [
      {
        amount0: ParseWETH('2'),
        price: ParseUSDC(1425),
        isAsk: false,
        hintId: 0,
      },
    ])

    const after = await s.orderBook.claimableToken1Balance(s.acc1.address)

    // claimable tokens increase
    expect(after.sub(before)).to.equal(ParseUSDC(1425))
  })
})
