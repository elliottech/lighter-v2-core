import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {setupFixturesForSmartWallet} from './default-fixture'
import {expect} from 'chai'
import {OrderQueryItemStructOutput} from 'typechain-types/contracts/core/OrderBook'
import {CreateIoCOrder, ParseUSDC, ParseWETH} from './shared'
import {BigNumber} from 'ethers'

interface Order {
  id: number
  amount0: BigNumber
  price: BigNumber
}

describe('get paginated orders', function () {
  function expectOrder(orders: OrderQueryItemStructOutput, order: Order[]) {
    const length = order.length
    for (let index = 0; index < length; index += 1) {
      expect(orders.ids[index]).to.equal(order[index].id)
      expect(orders.amount0s[index]).to.equal(order[index].amount0)
      expect(orders.prices[index]).to.equal(order[index].price)
    }
  }

  it('queries ask orders', async function () {
    const {orderBook} = await loadFixture(setupFixturesForSmartWallet)
    let orders = await orderBook.getPaginatedOrders(0, true, 4)

    expect(orders.isAsk).to.equal(true)

    // last order is zero
    expect(orders.ids[3]).to.equal(0)

    expectOrder(orders, [
      {
        amount0: ParseWETH('1.5'),
        price: ParseUSDC(1450),
        id: 3,
      },
      {
        amount0: ParseWETH('1.25'),
        price: ParseUSDC(1475),
        id: 6,
      },
      {
        amount0: ParseWETH('1.0'),
        price: ParseUSDC(1500),
        id: 2,
      },
    ])
  })

  it('queries bid orders', async function () {
    const {orderBook} = await loadFixture(setupFixturesForSmartWallet)
    let orders = await orderBook.getPaginatedOrders(0, false, 4)

    expect(orders.isAsk).to.equal(false)

    // last order is zero
    expect(orders.ids[3]).to.equal(0)

    expectOrder(orders, [
      {
        amount0: ParseWETH('1.5'),
        price: ParseUSDC(1400),
        id: 4,
      },
      {
        amount0: ParseWETH('1.25'),
        price: ParseUSDC(1375),
        id: 7,
      },
      {
        amount0: ParseWETH('1'),
        price: ParseUSDC(1350),
        id: 5,
      },
    ])
  })

  it('can specify start order', async () => {
    const {orderBook} = await loadFixture(setupFixturesForSmartWallet)
    let orders = await orderBook.getPaginatedOrders(7, false, 2)

    // last order is zero and the `startOrderId` is not included
    expect(orders.ids).to.deep.equal([5, 0])
  })

  it('returns the latest version of orders', async () => {
    const {orderBook, acc1} = await loadFixture(setupFixturesForSmartWallet)

    await CreateIoCOrder(acc1, orderBook, {
      amount0: ParseWETH('0.12345'),
      price: ParseUSDC(1400),
      isAsk: true,
    })

    let orders = await orderBook.getPaginatedOrders(0, false, 1)

    expectOrder(orders, [
      {
        amount0: ParseWETH('1.37655'),
        price: ParseUSDC(1400),
        id: 4,
      },
    ])
  })

  it('removes matched orders', async () => {
    const {orderBook, acc1} = await loadFixture(setupFixturesForSmartWallet)

    await CreateIoCOrder(acc1, orderBook, {
      amount0: ParseWETH('2'),
      price: ParseUSDC(1400),
      isAsk: true,
    })

    let orders = await orderBook.getPaginatedOrders(0, false, 1)

    expect(orders.ids[0]).to.equal(7)
  })

  it('cannot start from order which are not active', async () => {
    const {orderBook, acc1, linkedListLib} = await loadFixture(setupFixturesForSmartWallet)

    await CreateIoCOrder(acc1, orderBook, {
      amount0: ParseWETH('2'),
      price: ParseUSDC(1400),
      isAsk: true,
    })

    const tx = orderBook.getPaginatedOrders(2, false, 1)
    await expect(tx).to.be.revertedWithCustomError(linkedListLib, 'LighterV2Order_CannotQueryFromInactiveOrder')
  })

  it('cannot start from order which does not exists', async () => {
    const {orderBook, linkedListLib} = await loadFixture(setupFixturesForSmartWallet)

    let tx = orderBook.getPaginatedOrders(20, true, 1)
    await expect(tx).to.be.revertedWithCustomError(linkedListLib, 'LighterV2Order_CannotQueryFromInactiveOrder')
  })
})
