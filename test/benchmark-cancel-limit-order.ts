import {reportGasCost} from 'reports'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {expectOrderBook, CancelLimitOrder} from './shared'
import {setupFixturesForSmartWallet} from './default-fixture'

describe('benchmark limit order cancellation', function () {
  it('cancels 1 limit order', async () => {
    const {acc2, orderBook} = await loadFixture(setupFixturesForSmartWallet)

    const tx = await CancelLimitOrder(acc2, orderBook, [6])
    await expectOrderBook(orderBook, [3, 2, 0], [4, 7, 5, 0])
    await reportGasCost('CANCEL_1_LIMIT_ORDER', tx)
  })

  it('cancels 4 limit order', async () => {
    const {acc2, orderBook} = await loadFixture(setupFixturesForSmartWallet)

    const tx = await CancelLimitOrder(acc2, orderBook, [6, 7, 3, 4])
    await expectOrderBook(orderBook, [2, 0], [5, 0])

    await reportGasCost('CANCEL_4_LIMIT_ORDERS', tx)
  })
})
