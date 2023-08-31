import fs from 'fs'

interface GasReport {
  scenarioName: string
  l1GasUsed: number
  l2GasUsed: number
  totalCostETH: number
  totalCostKGWEI: number
  l1CostKGWEI: number
  l2CostKGWEI: number
}

function readJsonFile(filePath: string): Promise<GasReport[]> {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        reject(err)
        return
      }

      try {
        const jsonData = JSON.parse(data)
        resolve(jsonData)
      } catch (parseError) {
        reject(parseError)
      }
    })
  })
}

function arrayAsDict(list: GasReport[]): Map<String, GasReport> {
  const m = new Map<String, GasReport>()

  for (const report of list) {
    m.set(report.scenarioName, report)
  }

  return m
}

interface CompareResult {
  scenarioName: String
  initialL2: number | undefined
  currentL2: number | undefined
  increase: number | undefined
  increasePercentage: string | undefined
}

function compare(a: Map<String, GasReport>, b: Map<String, GasReport>) {
  const allKeys = new Set<String>()
  for (const key of a.keys()) {
    allKeys.add(key)
  }
  for (const key of b.keys()) {
    allKeys.add(key)
  }

  let results: CompareResult[] = []

  for (const key of allKeys.keys()) {
    let initialL2 = undefined
    let currentL2 = undefined

    if (a.has(key)) {
      initialL2 = a.get(key)!.l2GasUsed
    }
    if (b.has(key)) {
      currentL2 = b.get(key)!.l2GasUsed
    }

    if (initialL2 == undefined || currentL2 == undefined) {
      results.push({
        scenarioName: key,
        initialL2: initialL2,
        currentL2: currentL2,
        increase: undefined,
        increasePercentage: undefined,
      })
    } else {
      results.push({
        scenarioName: key,
        initialL2: initialL2,
        currentL2: currentL2,
        increase: currentL2 - initialL2,
        increasePercentage: ((100 * (currentL2 - initialL2)) / initialL2).toFixed(2),
      })
    }
  }

  results.sort((a, b) => {
    if (a.increase == undefined) {
      return +1
    } else if (b.increase == undefined) {
      return -1
    } else {
      return b.increase - a.increase
    }
  })

  console.log(`|FUNCTION|MAIN|REFACTORED|INCREASE|% INCREASE|`)
  console.log(`|-----|-----|-----|-----|-----|`)
  for (const result of results) {
    console.log(
      `| ${result.scenarioName} | ${result.initialL2 || '-'} | ${result.currentL2 || '-'} | ${
        result.increase || '-'
      } | ${result.increasePercentage || '-'} |`
    )
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length !== 2) {
    console.error('Please provide two JSON file paths as arguments.')
    console.error(
      'usage ts-node ./reports/compare-gas-cost-report.ts ./reports/gas-cost-report-main.json ./reports/gas-cost-report.json'
    )
    return
  }

  const [filePath1, filePath2] = args

  try {
    const initial = arrayAsDict(await readJsonFile(filePath1))
    const current = arrayAsDict(await readJsonFile(filePath2))

    compare(initial, current)
  } catch (error) {
    console.error('Error reading or parsing JSON files:', error)
  }
}

main()
