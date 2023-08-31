import fs from 'fs'
import {ContractTransaction, utils} from 'ethers'
import {estimateL1Gas, getL2GasPrice, getL1GasPrice} from './L1GasEstimator'

export const jsonFilePath = './reports/gas-cost-report.json'

interface JSONData {
  [key: string]: any
}

export const reportGasCost = async (scenarioName: string, tx: ContractTransaction) => {
  const l2GasUsed = (await tx.wait()).gasUsed
  const l2GasPrice = await getL2GasPrice()
  const l2Cost = l2GasUsed.mul(l2GasPrice)

  const {totalCost: estimatedTotalCost, l1GasUsed, l1GasPrice} = await estimateL1Gas(tx)
  const _l1GasPrice = await getL1GasPrice()
  const l1Cost = l1GasUsed.mul(l1GasPrice)

  const totalCost = l2Cost.add(l1Cost)

  // console.log(`l1GasUsed:${l1GasUsed}\tl1GasPrice:${utils.formatUnits(l1GasPrice, 9)}`)
  // console.log(`l2GasUsed:${l2GasUsed}\tl2GasPrice:${utils.formatUnits(l2GasPrice, 9)}`)
  // console.log(`l1Cost:${utils.formatUnits(l1Cost, 12)}\tl2Cost:${utils.formatUnits(l2Cost, 12)}`)
  // console.log(`totalCost:${utils.formatUnits(totalCost, 12)}\ttotalCostETH:${utils.formatUnits(totalCost, 18)}`)
  // console.log(`totalEstimate:${utils.formatUnits(estimatedTotalCost, 12)}\ttotalEstimateETH:${utils.formatUnits(estimatedTotalCost, 18)}`)

  const gasCostData = {
    scenarioName: scenarioName,
    l1GasUsed: l1GasUsed.toString(),
    l2GasUsed: l2GasUsed.toString(),
    totalCostETH: utils.formatEther(totalCost),
    totalCostKGWEI: utils.formatUnits(totalCost, 12),
    l1CostKGWEI: utils.formatUnits(l1Cost, 12),
    l2CostKGWEI: utils.formatUnits(l2Cost, 12),
  }
  insertDataIntoJSON(gasCostData)
}

export const insertDataIntoJSON = (newData: JSONData): void => {
  let jsonData: JSONData[] = []

  // Check if the file exists
  if (fs.existsSync(jsonFilePath)) {
    // Read the existing JSON data
    const existingData = fs.readFileSync(jsonFilePath, 'utf8')
    jsonData = JSON.parse(existingData)
  }

  // Find the index of the object to be overwritten (if it exists)
  const index = jsonData.findIndex((data) => data.scenarioName === newData.scenarioName)

  // If the object exists, replace it; otherwise, push the new object
  if (index !== -1) {
    jsonData[index] = newData
  } else {
    jsonData.push(newData)
  }

  // Write the JSON data to the file
  fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2))
}
