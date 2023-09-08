import {
  expect,
  expectOrderBook,
  CancelLimitOrder,
  CreateLimitOrder,
  ParseUSDC,
  ParseWETH,
  CreateIoCOrder,
} from 'test/shared'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {
  setupEmptyBookFixturesForSmartWallet,
  setupFixturesForSmartWallet,
  setupFixturesForSmartWalletWithMaliciousTokens,
} from './default-fixture'
import {reportGasCost} from 'reports'
import {BigNumber} from "ethers";

describe('limit orders', () => {
  async function expectInitialState(s: any) {
    await expectOrderBook(s.orderBook, [3, 6, 2, 0], [4, 7, 5, 0])
    expect(await s.weth.balanceOf(s.acc1.address)).to.equal(ParseWETH(10))
    expect(await s.usdc.balanceOf(s.acc1.address)).to.equal(ParseUSDC(15000))
  }

  it('loads fixtures', async () => {
    const s = await loadFixture(setupFixturesForSmartWallet)
    await expectInitialState(s)
  })

  async function createOrder(s: any, isAsk: boolean, hintId: number) {
    return await CreateLimitOrder(s.acc1, s.orderBook, [
      {
        amount0: ParseWETH('1.0'),
        price: ParseUSDC(1425),
        isAsk: isAsk,
        hintId: hintId,
      },
    ])
  }

  it('reverts when price is too small', async () => {
    const {acc1, orderBook} = await loadFixture(setupEmptyBookFixturesForSmartWallet)

    await expect(acc1.createLimitOrder(0, 1, [200], [1], [true], [0])).to.be.revertedWithCustomError(
      orderBook,
      'LighterV2Order_PriceTooSmall'
    )
  })

  it('reverts when price is too big', async () => {
    const {acc1, orderBook} = await loadFixture(setupEmptyBookFixturesForSmartWallet)
    const maxUint64 = BigNumber.from(2).pow(64).sub(1)
    await expect(acc1.createLimitOrder(0, 1, [200], [maxUint64], [true], [0])).to.be.revertedWithCustomError(
      orderBook,
      'LighterV2Order_PriceTooBig'
    )
  })

  describe('creating', () => {
    describe('creating orders locks funds in order book', () => {
      it('ask', async () => {
        const {acc1, orderBook, weth} = await loadFixture(setupFixturesForSmartWallet)

        const tx = await createOrder({acc1, orderBook}, true, 0)

        await expect(tx).to.changeTokenBalance(weth, acc1.address, ParseWETH('-1.0'))
        await expectOrderBook(orderBook, [9, 3, 6, 2, 0], [4, 7, 5, 0])
      })
      it('bid', async () => {
        const {acc1, orderBook, usdc} = await loadFixture(setupFixturesForSmartWallet)

        const tx = await createOrder({acc1, orderBook}, false, 0)

        await expect(tx).to.changeTokenBalance(usdc, acc1.address, -ParseUSDC('1425'))
        await expectOrderBook(orderBook, [3, 6, 2, 0], [9, 4, 7, 5, 0])
      })
    })

    it('Should create limit orders correctly with different hintIds', async () => {
      const {acc1, orderBook} = await loadFixture(setupEmptyBookFixturesForSmartWallet)
      let tx

      //  v
      // [0] -> [1] | orderId = 2
      tx = await CreateLimitOrder(acc1, orderBook, [
        {amount0: ParseWETH('0.1'), price: ParseUSDC('1100'), isAsk: true, hintId: 0},
      ])
      // do not record the first order as it bears extra costs due to one-time-storage allocations

      //  v
      // [0] -> 2 -> [1] | orderId = 3
      tx = await CreateLimitOrder(acc1, orderBook, [
        {amount0: ParseWETH('0.1'), price: ParseUSDC('1400'), isAsk: true, hintId: 0},
      ])
      await reportGasCost('CREATE_HINT_ID_LIMIT_ORDER_3', tx)

      //        v
      // [0] -> 2 -> 3 -> [1] | orderId = 4
      tx = await CreateLimitOrder(acc1, orderBook, [
        {amount0: ParseWETH('0.1'), price: ParseUSDC('1200'), isAsk: true, hintId: 2},
      ])
      await reportGasCost('CREATE_HINT_ID_LIMIT_ORDER_4', tx)

      //                        v
      // [0] -> 2 -> 4 -> 3 -> [1] | orderId = 5
      tx = await CreateLimitOrder(acc1, orderBook, [
        {amount0: ParseWETH('0.1'), price: ParseUSDC('1300'), isAsk: true, hintId: 1},
      ])
      await reportGasCost('CREATE_HINT_ID_LIMIT_ORDER_5', tx)

      //             v
      // [0] -> 2 -> 4 -> 5 -> 3 -> [1] | orderId = 6
      tx = await CreateLimitOrder(acc1, orderBook, [
        {amount0: ParseWETH('0.1'), price: ParseUSDC('1500'), isAsk: true, hintId: 0},
      ])
      await reportGasCost('CREATE_HINT_ID_LIMIT_ORDER_6', tx)

      await expectOrderBook(orderBook, [2, 4, 5, 3, 6, 0], [0])

      tx = await CancelLimitOrder(acc1, orderBook, [4])

      //          v
      //          4
      //           \
      // [0] -> 2 -> 5 -> 3 -> 6 -> [1] | orderId = 7
      tx = await CreateLimitOrder(acc1, orderBook, [
        {amount0: ParseWETH('0.1'), price: ParseUSDC('1200'), isAsk: true, hintId: 4},
      ])
      await reportGasCost('CREATE_HINT_ID_LIMIT_ORDER_7', tx)
      await expectOrderBook(orderBook, [2, 7, 5, 3, 6, 0], [0])
    })

    it('reverts for malicious token transfer', async function () {
      const s = await loadFixture(setupFixturesForSmartWalletWithMaliciousTokens)
      const tx = createOrder(s, false, 0)
      await expect(tx).to.be.revertedWithCustomError(s.orderBook, 'LighterV2Base_ContractBalanceDoesNotMatchSentAmount')
    })

    it('reverts for invalid hint id', async function () {
      const {acc1, orderBook} = await loadFixture(setupFixturesForSmartWallet)
      const tx = createOrder({acc1, orderBook}, true, 100)
      await expect(tx).to.be.revertedWithCustomError(orderBook, 'LighterV2Order_InvalidHintId')
    })

    it('can match 9 times', async () => {
      const {acc1, acc2, orderBook} = await loadFixture(setupFixturesForSmartWallet)
      for (let i = 0; i < 6; i += 1) {
        await createOrder({acc1: acc2, orderBook}, true, 0)
      }

      await expectOrderBook(orderBook, [9, 10, 11, 12, 13, 14, 3, 6, 2, 0], [4, 7, 5, 0])

      await CreateIoCOrder(acc1, orderBook, {
        amount0: ParseWETH(10.0),
        price: ParseUSDC(2000),
        isAsk: false,
      })

      await expectOrderBook(orderBook, [0], [4, 7, 5, 0])
    })
  })

  describe('cancel', () => {
    it('cancels limit orders', async () => {
      const s = await loadFixture(setupFixturesForSmartWallet)

      await createOrder(s, false, 0)

      // cancel order
      const tx = await CancelLimitOrder(s.acc1, s.orderBook, [9])
      await reportGasCost('CANCEL_1_LIMIT_ORDER', tx)

      // order is canceled & funds are returned to smart wallet, not to the orders owner
      await expectInitialState(s)
    })

    it("does not allow canceling another user's order", async function () {
      const {acc1, orderBook} = await loadFixture(setupFixturesForSmartWallet)

      const tx = CancelLimitOrder(acc1, orderBook, [6])
      await expect(tx).to.be.revertedWithCustomError(orderBook, 'LighterV2Owner_CallerCannotCancel')
    })

    it('does not revert when canceling an order that does not exist', async function () {
      const s = await loadFixture(setupFixturesForSmartWallet)

      await CancelLimitOrder(s.acc1, s.orderBook, [100])

      await expectInitialState(s)
    })

    it('maintains correct order', async function () {
      const s = await loadFixture(setupFixturesForSmartWallet)

      await CancelLimitOrder(s.acc2, s.orderBook, [6, 5, 4])

      await expectOrderBook(s.orderBook, [3, 2, 0], [7, 0])
    })
  })
})
