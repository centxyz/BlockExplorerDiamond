const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { BlockExplorerDiamond } = require('../src/blockexplorerdiamond');

const block = {
  number: '0x10', hash: '0xBLOCK', parentHash: '0xPARENT', timestamp: '0x65', miner: '0xMINER', gasUsed: '0x5208', gasLimit: '0x1c9c380',
  transactions: [{ hash: '0xTX', transactionIndex: '0x0', from: '0xFROM', to: '0xTO', value: '0xde0b6b3a7640000', gas: '0x5208', nonce: '0x2', input: '0x' }]
};

function mockRpc(overrides = {}) {
  const calls = [];
  const values = { eth_chainId: '0x1', eth_blockNumber: '0x10', eth_getBlockByNumber: block, ...overrides };
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request);
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: request.id, result: values[request.method] }) };
  };
  return { calls, fetchImpl };
}

async function fixture(rpc = mockRpc()) {
  const dir = await mkdtemp(join(tmpdir(), 'block-explorer-'));
  const explorer = new BlockExplorerDiamond({ rpcUrl: 'http://rpc.test', dataFile: join(dir, 'index.json'), fetchImpl: rpc.fetchImpl });
  await explorer.load();
  return { explorer, rpc, file: join(dir, 'index.json') };
}

test('reports live chain status through JSON-RPC', async () => {
  const { explorer, rpc } = await fixture();
  assert.deepEqual(await explorer.status(), { chainId: 1, latestBlock: 16, latestIndexed: null });
  assert.deepEqual(rpc.calls.map(call => call.method), ['eth_chainId', 'eth_blockNumber']);
});

test('indexes blocks, transactions, and both involved addresses', async () => {
  const { explorer } = await fixture();
  assert.deepEqual(await explorer.sync(), { chainId: 1, from: 16, to: 16, blocksIndexed: 1, transactionsIndexed: 1 });
  assert.equal(explorer.getBlock(16).hash, '0xblock');
  assert.equal(explorer.getTransaction('0xTX').valueWei, '1000000000000000000');
  assert.equal(explorer.getAddress('0xFROM').transactions[0].hash, '0xtx');
  assert.equal(explorer.getAddress('0xto').transactionCount, 1);
  assert.deepEqual(explorer.stats(), { chainId: 1, latestIndexed: 16, blocks: 1, transactions: 1, addresses: 2 });
});

test('persists and reloads the index', async () => {
  const { explorer, file, rpc } = await fixture();
  await explorer.sync();
  const reloaded = new BlockExplorerDiamond({ rpcUrl: 'http://rpc.test', dataFile: file, fetchImpl: rpc.fetchImpl });
  await reloaded.load();
  assert.equal(reloaded.getTransaction('0xtx').blockNumber, 16);
  assert.equal((await reloaded.sync()).blocksIndexed, 0);
});

test('refuses to mix data from different chains', async () => {
  const initial = await fixture();
  await initial.explorer.sync();
  const otherRpc = mockRpc({ eth_chainId: '0x89' });
  const other = new BlockExplorerDiamond({ rpcUrl: 'http://polygon.test', dataFile: initial.file, fetchImpl: otherRpc.fetchImpl });
  await other.load();
  await assert.rejects(other.sync(), error => error.code === 'CHAIN_MISMATCH');
});

test('surfaces JSON-RPC errors', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ error: { code: -32601, message: 'method not found' } }) });
  const { explorer } = await fixture({ fetchImpl });
  await assert.rejects(explorer.status(), error => error.code === 'RPC');
});
