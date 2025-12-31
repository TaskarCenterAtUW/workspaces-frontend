import Papa from 'papaparse'

export async function parseCsv(csv: string) {
  return new Promise((resolve, reject) => {
    Papa.parse(csv, {
      header: true,
      skipEmptyLines: 'greedy',
      complete(result) {
        resolve(result.data)
      },
      error(e) {
        reject(e)
      },
    })
  })
}
