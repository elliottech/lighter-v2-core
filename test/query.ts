import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {setupFixturesForSmartWallet} from './default-fixture'
import {expect} from './shared'

describe('get paginated orders', () => {
  it('queries if order is Ask', async function () {
    const {orderBook} = await loadFixture(setupFixturesForSmartWallet)

    expect(await orderBook.isAskOrder(2)).to.be.true
    expect(await orderBook.isAskOrder(4)).to.be.false

    await expect(orderBook.isAskOrder(1500)).to.be.revertedWithCustomError(
      orderBook,
      'LighterV2Order_OrderDoesNotExist'
    )
  })
})
