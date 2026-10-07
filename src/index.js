#!/usr/bin/env node
const minimist = require('minimist');
const { BlockExplorerDiamond } = require('./blockexplorerdiamond');

const help = `BlockExplorerDiamond — local EVM block indexer

Usage:
  blockexplorerdiamond status
  blockexplorerdiamond sync [--from BLOCK] [--to BLOCK]
  blockexplorerdiamond block NUMBER
  blockexplorerdiamond tx HASH
  blockexplorerdiamond address ADDRESS
  blockexplorerdiamond stats

Options:
  --rpc URL      EVM JSON-RPC endpoint (or EVM_RPC_URL)
  --data FILE    Index file (default .block-explorer/index.json)
  --timeout MS   RPC timeout (default 15000)`;

async function main() {
  const args = minimist(process.argv.slice(2), { string: ['rpc', 'data'], boolean: ['help'], alias: { h: 'help' } });
  if (args.help || !args._[0]) { console.log(help); return; }
  const explorer = new BlockExplorerDiamond({ rpcUrl: args.rpc || process.env.EVM_RPC_URL, dataFile: args.data || '.block-explorer/index.json', timeout: args.timeout ? Number(args.timeout) : 15000 });
  await explorer.load();
  const command = String(args._[0]);
  let result;
  if (command === 'status') result = await explorer.status();
  else if (command === 'sync') result = await explorer.sync({ ...(args.from != null ? { from: Number(args.from) } : {}), ...(args.to != null ? { to: Number(args.to) } : {}) });
  else if (command === 'block') result = explorer.getBlock(Number(args._[1]));
  else if (command === 'tx') result = explorer.getTransaction(String(args._[1] || ''));
  else if (command === 'address') result = explorer.getAddress(String(args._[1] || ''));
  else if (command === 'stats') result = explorer.stats();
  else throw new Error(`Unknown command: ${command}`);
  if (result == null) { process.exitCode = 2; console.error(JSON.stringify({ error: 'Not found' })); return; }
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main().catch(error => { console.error(JSON.stringify({ error: error.message, code: error.code || 'INTERNAL' })); process.exitCode = 1; });
module.exports = { main };
