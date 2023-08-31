// from here

/*
  ==========
  Background

  The TX needs to be published on L1. The GAS used for that is 16 * bytes. If the TX uses 1000 bytes in the data field,
  expect to use AT LEAST 16'000 gas on ETH L1, with L1 gas prices! Because of this, data optimisation is important on L2.

  ===============
  Online Solution

  https://github.com/OffchainLabs/arbitrum-tutorials/blob/672b0b1e514f199133761daac000db954f0b5447/packages/gas-estimation/scripts/exec.ts#L1C1-L135C1
  Use Arbitrum SDK to call the estimate gas, based on the script from above.

  ===============
  Simple estimation solution

  https://github.com/OffchainLabs/arbitrum-tutorials/blob/672b0b1e514f199133761daac000db954f0b5447/packages/gas-estimation/scripts/exec.ts#L54C1-L57C100
  L1S (Size in bytes of the calldata to post on L1) =>
        Will depend on the size (in bytes) of the calldata of the transaction
        We add a fixed amount of 140 bytes to that amount for the transaction metadata (recipient, nonce, gas price, ...)
        Final size will be less after compression, but this calculation gives a good estimation

  =================================================
  Offline comprehensive solution

  https://docs.arbitrum.io/arbos/l1-pricing
  > The estimated size is measured in L1 gas and is calculated as follows: first, compress the transaction's data using
    the brotli-zero algorithm, then multiply the size of the result by 16. (16 is because L1 charges 16 gas per byte.
    L1 charges less for bytes that are zero, but that doesn't make sense here.) Brotli-zero is used in order to reward
    users for posting transactions that are compressible.

  from arbitrum PRC,
  https://github.com/OffchainLabs/nitro/blob/master/arbos/l1pricing/l1pricing.go#L517C1-L518C67
  // We don't have the full tx in gas estimation, so we assume it might be a bit bigger in practice.
  const estimationPaddingUnits = 16 * params.TxDataNonZeroGasEIP2028

  https://github.com/OffchainLabs/nitro/blob/master/arbos/l1pricing/l1pricing.go#L483
  txBytes, _ := tx.MarshalBinary()                  // uses RLP binary encoding
	l1Bytes, _ := byteCountAfterBrotli0(txBytes)
	return l1Bytes * params.TxDataNonZeroGasEIP2028
*/

import {BigNumber, ContractTransaction, providers, utils} from 'ethers'
import {addDefaultLocalNetwork} from '@arbitrum/sdk'
import {NodeInterface__factory} from '@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory'
import {NODE_INTERFACE_ADDRESS} from '@arbitrum/sdk/dist/lib/dataEntities/constants'

// Add the default local network configuration to the SDK
// to allow this script to run on a local node
addDefaultLocalNetwork()

// configs
let useFixedGasPrices = true
let fixedL1GasPrice = utils.parseUnits('10', 9)
let fixedL2GasPrice = utils.parseUnits('0.1', 9)

let cachedL1GasCost: BigNumber | null = null

export async function getL1GasPrice(): Promise<BigNumber> {
  if (useFixedGasPrices) {
    cachedL1GasCost = fixedL1GasPrice
  }
  if (cachedL1GasCost != null) {
    return cachedL1GasCost
  }
  try {
    const provider = new providers.StaticJsonRpcProvider('https://ethereum.publicnode.com')
    // const provider = new providers.StaticJsonRpcProvider("https://rpc.ankr.com/eth_goerli");
    cachedL1GasCost = await provider.getGasPrice()
  } catch (e) {
    console.error(`failed to get L1 gas cost ${e}; using default`)
    cachedL1GasCost = utils.parseUnits('30.0', 9) // gWEI
  }
  return cachedL1GasCost
}

let cachedL2GasCost: BigNumber | null = null

export async function getL2GasPrice(): Promise<BigNumber> {
  if (useFixedGasPrices) {
    cachedL2GasCost = fixedL2GasPrice
  }
  if (cachedL2GasCost != null) {
    return cachedL2GasCost
  }
  try {
    const provider = new providers.StaticJsonRpcProvider('https://arb1.arbitrum.io/rpc')
    // const provider = new providers.StaticJsonRpcProvider("https://goerli-rollup.arbitrum.io/rpc");
    cachedL2GasCost = await provider.getGasPrice()
  } catch (e) {
    console.error(`failed to get L2 gas cost ${e}; using default`)
    cachedL2GasCost = utils.parseUnits('0.1', 9) // gWEI
  }
  return cachedL2GasCost
}

const estimateGasOnline = async (tx: ContractTransaction) => {
  const baseL2Provider = new providers.StaticJsonRpcProvider('https://arb1.arbitrum.io/rpc')
  // const baseL2Provider = new providers.StaticJsonRpcProvider("https://goerli-rollup.arbitrum.io/rpc");

  // Instantiation of the NodeInterface object
  const nodeInterface = NodeInterface__factory.connect(NODE_INTERFACE_ADDRESS, baseL2Provider)

  // Getting the estimations from NodeInterface.GasEstimateComponents()
  // ------------------------------------------------------------------
  const gasEstimateComponents = await nodeInterface.callStatic.gasEstimateComponents(tx.to!, false, tx.data, {
    blockTag: 'latest',
  })

  // Getting useful values for calculating the formula
  const l1GasEstimated = gasEstimateComponents.gasEstimateForL1
  const l2EstimatedPrice = gasEstimateComponents.baseFee
  const l1EstimatedPrice = gasEstimateComponents.l1BaseFeeEstimate

  // Calculating some extra values to be able to apply all variables of the formula
  // -------------------------------------------------------------------------------
  // NOTE: This one might be a bit confusing, but l1GasEstimated (B in the formula) is calculated based on l2 gas fees
  const l1Cost = l1GasEstimated.mul(l2EstimatedPrice)
  // NOTE: This is similar to 140 + utils.hexDataLength(txData);
  return {
    totalCost: gasEstimateComponents.gasEstimate.mul(gasEstimateComponents.baseFee),
    l1GasUsed: l1Cost.div(l1EstimatedPrice),
    l1GasPrice: l1EstimatedPrice,
  }
}

export function getDataGasCost(data: string) {
  let gas: number = 0
  let zeroBytes: number = 0
  let nonZeroBytes: number = 0

  // start from 2, as first 2 characters are 0x
  for (let i = 2; i < data.length; i += 2) {
    if (data.substring(i, i + 2) == '00') {
      gas += 4
      zeroBytes += 1
    } else {
      gas += 16
      nonZeroBytes += 1
    }
  }
  return {gas, zeroBytes, nonZeroBytes}
}

const estimateGasOffline = async (tx: ContractTransaction) => {
  const {gas: dataGas} = getDataGasCost(tx.data)
  let l1GasUsed = BigNumber.from(140).mul(16).add(dataGas)
  const l1GasPrice = await getL1GasPrice()
  const l2GasPrice = await getL2GasPrice()
  const totalCost = tx.gasLimit.mul(l2GasPrice).add(BigNumber.from(l1GasUsed).mul(l1GasPrice))
  return {
    totalCost,
    l1GasUsed,
    l1GasPrice,
  }
}

export const estimateL1Gas = estimateGasOffline
