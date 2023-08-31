# Lighter Exchange V2

Lighter is fully decentralized order book exchange protocol designed for permission-less, zero slippage and MEV-protected trades.

## Contract Structure

```bash
contracts
├── Factory.sol
├── OrderBook.sol
├── interfaces
│   ├── IFactory.sol
│   ├── ILighterV2FlashCallback.sol
│   ├── ILighterV2TransferCallback.sol
│   ├── IOrderBook.sol
│   └── external
│       └── IERC20Minimal.sol
└── libraries
    ├── Errors.sol
    ├── LinkedList.sol
    └── OrderBookDeployerLib.sol
```

## Installing the dependencies

```
npm install
```

## Compiling the contracts

```shell
npm compile
```

## Running the tests

```
npm test
```

## License

- The primary license for Lighter V2 is the Business Source License 1.1 (`BUSL-1.1`)
- All external interface files in `contracts/interfaces/` are licensed under `SPDX-License-Identifier: MIT`
