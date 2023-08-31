import {OrderBook} from 'typechain-types'
import {BigNumberish} from 'ethers'
import {expect} from './expect'

export async function expectOrderBook(orderBook: OrderBook, asks: BigNumberish[], bids: BigNumberish[]) {
  const [, ids_ask] = await orderBook.getPaginatedOrders(0, true, asks.length)
  expect(ids_ask).to.eql(asks)
  const [, ids_bid] = await orderBook.getPaginatedOrders(0, false, bids.length)
  expect(ids_bid).to.eql(bids)
}
