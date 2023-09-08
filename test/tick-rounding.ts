import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {expect, ParseWETHBase} from './shared'
import {setupEmptyBookFixturesForSmartWallet} from './default-fixture'
import {SmartWallet} from 'typechain-types'

describe('OrderBook contract, tick size', function () {
  it('reverts when minimum amounts does not satisfied', async function () {
    const {acc1, orderBook} = await loadFixture(setupEmptyBookFixturesForSmartWallet)

    await expect(acc1.createLimitOrder(0, 1, [90], [1], [true], [0])).to.be.revertedWithCustomError(
      orderBook,
      'LighterV2Order_PriceTooSmall'
    )

    await expect(acc1.createLimitOrder(0, 1, [90], [10], [true], [0])).to.be.revertedWithCustomError(
      orderBook,
      'LighterV2Order_AmountTooSmall'
    )
  })

  it('handles rounds correctly for limit order matching', async function () {
    const {
      acc1,
      acc2,
      token_weth: token0,
      token_usdc: token1,
      orderBook,
    } = await loadFixture(setupEmptyBookFixturesForSmartWallet)

    let tx

    //  v
    // [0] -> [1]
    // orderId = 2
    tx = acc1.createLimitOrder(0, 1, [101], [91], [false], [0]) // sells 919.1 token1
    await expect(tx).to.changeTokenBalance(token1, acc1.address, -919)

    //  v
    // [0] -> 2 -> [1]
    // orderId = 3
    tx = acc1.createLimitOrder(0, 1, [117], [184], [false], [0]) // sells 2152.8 token1
    await expect(tx).to.changeTokenBalance(token1, acc1.address, -2152)

    // should revert the FillOrKillOrder

    // taker expects amount0Base: 100 at spotBasePx: 300 where they offer token1
    // match with 1st best limit-order (ask) will match and fill amount0Base: 100
    // match with 1st best limit-order (ask) will match and fill amount0Base: 100

    const fillOrKillOrder_amount0Base = 221
    const fillOrKillOrder_priceBase = 183

    await expect(
      acc2.createFillOrKillOrder(0, fillOrKillOrder_amount0Base, fillOrKillOrder_priceBase, true)
    ).to.be.revertedWithCustomError(orderBook, 'LighterV2Order_FoKNotFilled')

    tx = acc1.createLimitOrder(0, 1, [105], [191], [false], [2]) // sells 2005.5 token1
    await expect(tx).to.changeTokenBalance(token1, acc1.address, -2005)

    // should not revert the FillOrKillOrder
    // [0] -> 4 -> 3 -> [1]
    tx = acc2.createFillOrKillOrder(0, fillOrKillOrder_amount0Base, fillOrKillOrder_priceBase, true) // buy 4044.3 token1

    // want to sell 221 token0
    // first matches with limitOrder3 and then with limitOrder2
    // taker gives 105 token0 and receives 2005 token1
    // taker gives 116 token0 and receives 2134 token1
    // taker receives 4139 token1 in total

    await expect(tx)
      .to.changeTokenBalance(token0, acc1.address, ParseWETHBase(105 + 116))
      .to.changeTokenBalance(token0, acc2.address, -ParseWETHBase(105 + 116))
      .to.changeTokenBalance(token1, acc1.address, 0)
      .to.changeTokenBalance(token1, acc2.address, 4139)

    tx = acc1.cancelLimitOrder(0, 1, [3])
    await expect(tx).to.changeTokenBalance(token1, acc1.address, 18)

    tx = acc1.cancelLimitOrder(0, 1, [2])
    await expect(tx).to.changeTokenBalance(token1, acc1.address, 919)
  })

  it('can match against maker more than once', async () => {
    const {
      acc1,
      acc2,
      token_weth: token0,
      token_usdc: token1,
      orderBook,
    } = await loadFixture(setupEmptyBookFixturesForSmartWallet)

    let tx

    // create market order
    tx = acc1.createLimitOrder(0, 1, [783], [91], [false], [0]) // sells 7125.3 token1
    await expect(tx).to.changeTokenBalance(token1, acc1.address, -7125)

    // partial fill 1
    tx = acc2.createImmediateOrCancelOrder(0, 139, 10, true) // buys 1264.9 token1
    await expect(tx) //
      .to.changeTokenBalance(token1, acc2.address, +1264)
      .to.changeTokenBalance(token0, acc2.address, ParseWETHBase(-139))

    // partial fill 2
    tx = acc2.createImmediateOrCancelOrder(0, 129, 10, true) // buys 1173.9 token1
    await expect(tx) //
      .to.changeTokenBalance(token1, acc2.address, +1173)
      .to.changeTokenBalance(token0, acc2.address, ParseWETHBase(-129))

    // partial fill 3
    tx = acc2.createImmediateOrCancelOrder(0, 119, 10, true) // buys 1082.9 token1
    await expect(tx) //
      .to.changeTokenBalance(token1, acc2.address, +1082)
      .to.changeTokenBalance(token0, acc2.address, ParseWETHBase(-119))

    // match against the whole order
    tx = acc2.createImmediateOrCancelOrder(0, 1000, 10, true) // buys 3603.6 token1
    await expect(tx) //
      .to.changeTokenBalance(token1, acc2.address, +3603)
      .to.changeTokenBalance(token0, acc2.address, ParseWETHBase(-396))
  })

  async function createOrders(account: SmartWallet, isAsk: boolean) {
    await account.createLimitOrder(0, 1, [101], [91], [isAsk], [0]) // sells 919.1 token1
    await account.createLimitOrder(0, 1, [117], [184], [isAsk], [0]) // sells 2152.8 token1
    await account.createLimitOrder(0, 1, [147], [184], [isAsk], [0]) // sells 2704.8 token1
    await account.createLimitOrder(0, 1, [132], [197], [isAsk], [0]) // sells 2600.4 token1
    await account.createLimitOrder(0, 1, [123], [201], [isAsk], [0]) // sells 2472.3 token1
  }

  it('swap exact input token0', async function () {
    const {acc1, acc2, orderBook} = await loadFixture(setupEmptyBookFixturesForSmartWallet)

    await createOrders(acc1, false)

    await expect(acc2.swapExactInput(0, true, ParseWETHBase(187.9), 3733, acc2.address)).to.be.revertedWithCustomError(
      orderBook,
      'LighterV2Swap_NotEnoughOutput'
    )

    // 2472 + 1260
    await acc2.swapExactInput(0, true, ParseWETHBase(187.9), 3732, acc2.address)

    await expect(acc2.swapExactInput(0, true, ParseWETHBase(215.31), 4044, acc2.address)).to.be.revertedWithCustomError(
      orderBook,
      'LighterV2Swap_NotEnoughOutput'
    )

    // 1339 + 2704
    await acc2.swapExactInput(0, true, ParseWETHBase(215.31), 4043, acc2.address)
  })

  it('swap exact output token0', async function () {
    const {acc1, acc2, orderBook} = await loadFixture(setupEmptyBookFixturesForSmartWallet)

    await createOrders(acc1, true)

    // should receive 187 base token0
    // pays 919 + 1582
    await expect(
      acc2.swapExactOutput(0, false, ParseWETHBase(186.9), 2500, acc2.address)
    ).to.be.revertedWithCustomError(orderBook, 'LighterV2Swap_TooMuchRequested')

    await acc2.swapExactOutput(0, false, ParseWETHBase(186.9), 2501, acc2.address)

    await expect(acc2.swapExactOutput(0, false, ParseWETHBase(30.99), 569, acc2.address)).to.be.revertedWithCustomError(
      orderBook,
      'LighterV2Swap_TooMuchRequested'
    )

    // 570
    await acc2.swapExactOutput(0, false, ParseWETHBase(30.99), 570, acc2.address)
  })

  it('swap exact input token1', async function () {
    const {acc1, acc2, orderBook} = await loadFixture(setupEmptyBookFixturesForSmartWallet)

    await createOrders(acc1, true)

    await expect(acc2.swapExactInput(0, false, 1183, ParseWETHBase(115.1), acc2.address)).to.be.revertedWithCustomError(
      orderBook,
      'LighterV2Swap_NotEnoughOutput'
    )
    // get 101 + 14
    // pay 920 + 258
    await acc2.swapExactInput(0, false, 1183, ParseWETHBase(115), acc2.address)

    // 1895.2 to fill the second order
    // 1913.6 for the next tick of the third order
    await expect(acc2.swapExactInput(0, false, 1913, ParseWETHBase(103.1), acc2.address)).to.be.revertedWithCustomError(
      orderBook,
      'LighterV2Swap_NotEnoughOutput'
    )

    await acc2.swapExactInput(0, false, 1913, ParseWETHBase(103), acc2.address)
  })

  it('swap exact output token1', async function () {
    const {acc1, acc2, orderBook} = await loadFixture(setupEmptyBookFixturesForSmartWallet)

    await createOrders(acc1, false)

    await expect(acc2.swapExactOutput(0, true, 3112, ParseWETHBase(155.9), acc2.address)).to.be.revertedWithCustomError(
      orderBook,
      'LighterV2Swap_TooMuchRequested'
    )
    // pay 33 + 123
    // get 650 + 2472
    await acc2.swapExactOutput(0, true, 3112, ParseWETHBase(156), acc2.address)

    await expect(acc2.swapExactOutput(0, true, 4654, ParseWETHBase(245.9), acc2.address)).to.be.revertedWithCustomError(
      orderBook,
      'LighterV2Swap_TooMuchRequested'
    )

    await expect(acc2.swapExactOutput(0, true, 4655, ParseWETHBase(246), acc2.address)).to.be.revertedWithCustomError(
      orderBook,
      'LighterV2Swap_TooMuchRequested'
    )

    // pay 99 + 147
    // get 1950 + 2704
    await acc2.swapExactOutput(0, true, 4654, ParseWETHBase(246), acc2.address)
  })
})
