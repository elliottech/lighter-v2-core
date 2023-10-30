import {CoreMatchingEngine, Swap} from './core-matching-engine'
import {expect, ParseUSDC, ParseWETH} from 'test/shared'

function expectOrderBook(engine: CoreMatchingEngine, askIDs: number[], bidIDs: number[]) {
  expect(askIDs).to.deep.equal(engine.ask.map((order) => order.id))
  expect(bidIDs).to.deep.equal(engine.bid.map((order) => order.id))
}

export class SwapAggregator {
  swaps: Swap[] = []
  engine: CoreMatchingEngine | null = null

  constructor(engine: CoreMatchingEngine) {
    this.engine = engine
    this.engine.onSwapCallback = this.onSwapCallback.bind(this)
  }

  onSwapCallback(swap: Swap) {
    this.swaps.push(swap)
  }
}

describe('core matching engine', () => {
  function populate(engine: CoreMatchingEngine, isAsk: boolean) {
    engine.insert({
      id: 1,
      isAsk: isAsk,
      amount0: ParseWETH('0.1'),
      price: ParseUSDC('1450'),
    })
    engine.insert({
      id: 2,
      isAsk: isAsk,
      amount0: ParseWETH('0.2'),
      price: ParseUSDC('1425'),
    })
    engine.insert({
      id: 3,
      isAsk: isAsk,
      amount0: ParseWETH('0.3'),
      price: ParseUSDC('1475'),
    })
    engine.insert({
      id: 4,
      isAsk: isAsk,
      amount0: ParseWETH('0.4'),
      price: ParseUSDC('1450'),
    })
  }

  describe('keeps order sorted', () => {
    it('ask', () => {
      const engine = new CoreMatchingEngine()
      populate(engine, true)
      expectOrderBook(engine, [2, 1, 4, 3], [])
    })
    it('bid', () => {
      const engine = new CoreMatchingEngine()
      populate(engine, false)
      expectOrderBook(engine, [], [3, 1, 4, 2])
    })
  })
  describe('can insert order', () => {
    it('after orders with similar value', () => {
      const engine = new CoreMatchingEngine()
      populate(engine, true)
      engine.insert({
        id: 5,
        isAsk: true,
        amount0: ParseWETH('0.2'),
        price: ParseUSDC('1425'),
      })
      expectOrderBook(engine, [2, 5, 1, 4, 3], [])
    })
    it('at the front of the list', () => {
      const engine = new CoreMatchingEngine()
      populate(engine, true)
      engine.insert({
        id: 5,
        isAsk: true,
        amount0: ParseWETH('0.2'),
        price: ParseUSDC('1400'),
      })
      expectOrderBook(engine, [5, 2, 1, 4, 3], [])
    })
    it('at the back of the list', () => {
      const engine = new CoreMatchingEngine()
      populate(engine, true)
      engine.insert({
        id: 5,
        isAsk: true,
        amount0: ParseWETH('0.2'),
        price: ParseUSDC('1600'),
      })
      expectOrderBook(engine, [2, 1, 4, 3, 5], [])
    })
  })
  describe('can cancel order', () => {
    it('in the middle', () => {
      const engine = new CoreMatchingEngine()
      populate(engine, true)
      expect(engine.cancel(4)).to.be.not.null
      expectOrderBook(engine, [2, 1, 3], [])
    })
    it('at the back', () => {
      const engine = new CoreMatchingEngine()
      populate(engine, true)
      expect(engine.cancel(3)).to.be.not.null
      expectOrderBook(engine, [2, 1, 4], [])
    })
    it('at the front', () => {
      const engine = new CoreMatchingEngine()
      populate(engine, true)
      expect(engine.cancel(2)).to.be.not.null
      expectOrderBook(engine, [1, 4, 3], [])
    })
    it('does not fail when canceling orders which does not exist', () => {
      const engine = new CoreMatchingEngine()
      populate(engine, true)
      expect(engine.cancel(7)).to.be.null
      expectOrderBook(engine, [2, 1, 4, 3], [])
    })
  })
  describe('can match order', () => {
    it('does not match if prices are not right', () => {
      const engine = new CoreMatchingEngine()
      const aggregator = new SwapAggregator(engine)
      populate(engine, true)

      engine.match({
        id: 5,
        isAsk: false,
        amount0: ParseWETH('5'),
        price: ParseUSDC('1400'),
      })

      expect(aggregator.swaps.length).to.equal(0)
    })
    it('can match all orders', () => {
      const engine = new CoreMatchingEngine()
      const aggregator = new SwapAggregator(engine)
      populate(engine, true)

      const remaining = engine.match({
        id: 5,
        isAsk: false,
        amount0: ParseWETH('5'),
        price: ParseUSDC('1500'),
      })

      expect(aggregator.swaps.length).to.equal(4)
      expect(remaining.amount0).to.equal(ParseWETH(4))
      expectOrderBook(engine, [], [])
    })
    it('can match and leave orders partially matched', () => {
      const engine = new CoreMatchingEngine()
      const aggregator = new SwapAggregator(engine)
      populate(engine, true)

      const remaining = engine.match({
        id: 5,
        isAsk: false,
        amount0: ParseWETH('0.4'),
        price: ParseUSDC('1500'),
      })

      expect(aggregator.swaps).to.deep.equal([
        {
          amount0: ParseWETH(0.2),
          amount1: ParseUSDC(0.2 * 1425),
          askID: 2,
          bidID: 5,
        },
        {
          amount0: ParseWETH(0.1),
          amount1: ParseUSDC(0.1 * 1450),
          askID: 1,
          bidID: 5,
        },
        {
          amount0: ParseWETH(0.1),
          amount1: ParseUSDC(0.1 * 1450),
          askID: 4,
          bidID: 5,
        },
      ])

      expect(remaining.amount0).to.equal(ParseWETH(0))
      expectOrderBook(engine, [4, 3], [])
      expect(engine.ask[0].amount0).to.equal(ParseWETH(0.3))
    })
    it('stops matching when price is not better', () => {
      const engine = new CoreMatchingEngine()
      const aggregator = new SwapAggregator(engine)
      populate(engine, true)

      const remaining = engine.match({
        id: 5,
        isAsk: false,
        amount0: ParseWETH('0.4'),
        price: ParseUSDC('1425'),
      })

      expect(aggregator.swaps.length).to.equal(1)
      expect(remaining.amount0).to.equal(ParseWETH(0.2))
      expectOrderBook(engine, [1, 4, 3], [])
    })
    it('does not match when price is bad', () => {
      const engine = new CoreMatchingEngine()
      const aggregator = new SwapAggregator(engine)
      populate(engine, true)

      const remaining = engine.match({
        id: 5,
        isAsk: false,
        amount0: ParseWETH('0.4'),
        price: ParseUSDC('1400'),
      })

      expect(aggregator.swaps.length).to.equal(0)
      expect(remaining.amount0).to.equal(ParseWETH(0.4))
      expectOrderBook(engine, [2, 1, 4, 3], [])
    })
  })
})
