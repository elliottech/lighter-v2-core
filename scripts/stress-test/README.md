## Usage
`ts-node ./scripts/stress-test`

## Structure
The package implements a simple JS-matching engine under `core-matching-engine`

The JS engine is extended by the `js-matching` which adds balance tracking & ownership of orders. 
The `js-matching` implements an interface similar to the `on-chain-matching` so it's easy to use both of them together.  

`on-chain-matching` implements a common API over the order-book

`stress-tester` deploys the contracts, which includes the factory, 10 smart wallets and 3 order books.
Each run consists of 100 operations applied on a random order book. 
An operation is defined as an Order creation/cancellation or swap operation
