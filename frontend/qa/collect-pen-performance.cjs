const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const output = path.resolve('.expo/pen-device-metrics.jsonl')
fs.mkdirSync(path.dirname(output), { recursive: true })
http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') { response.writeHead(204); return response.end() }
  if (request.method !== 'POST' || request.url !== '/pen-performance') { response.writeHead(404); return response.end() }
  let body = ''
  request.on('data', chunk => { body += chunk; if (body.length > 100000) request.destroy() })
  request.on('end', () => {
    try {
      const report = JSON.parse(body)
      if (!['ready', 'stroke'].includes(report.type)) throw new Error('Invalid report')
      const line = JSON.stringify({ receivedAt: new Date().toISOString(), ...report })
      fs.appendFileSync(output, line + '\n')
      console.log(line)
      response.writeHead(204); response.end()
    } catch { response.writeHead(400); response.end() }
  })
}).listen(8099, '0.0.0.0', () => console.log('Pen measurement receiver ready on 8099'))
