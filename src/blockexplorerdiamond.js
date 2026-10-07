const { mkdir, readFile, rename, writeFile } = require('node:fs/promises');
const { dirname } = require('node:path');
const { randomBytes } = require('node:crypto');

class ExplorerError extends Error {
  constructor(message, code = 'EXPLORER_ERROR') { super(message); this.name = 'ExplorerError'; this.code = code; }
}

const hexToNumber = value => value == null ? null : Number.parseInt(value, 16);
const normalize = value => typeof value === 'string' ? value.toLowerCase() : value;

class BlockExplorerDiamond {
  constructor({ rpcUrl, dataFile = '.block-explorer/index.json', fetchImpl = globalThis.fetch, timeout = 15000 } = {}) {
    if (!rpcUrl) throw new ExplorerError('An EVM JSON-RPC URL is required', 'CONFIG');
    if (typeof fetchImpl !== 'function') throw new ExplorerError('A fetch implementation is required', 'CONFIG');
    this.rpcUrl = rpcUrl;
    this.dataFile = dataFile;
    this.fetch = fetchImpl;
    this.timeout = timeout;
    this.data = { format: 1, chainId: null, blocks: {}, transactions: {}, addresses: {}, latestIndexed: null };
    this.requestId = 0;
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.dataFile, 'utf8'));
      if (parsed.format !== 1 || !parsed.blocks || !parsed.transactions || !parsed.addresses) throw new Error('unsupported index format');
      this.data = parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new ExplorerError(`Unable to load index: ${error.message}`, 'DATA');
    }
  }

  async rpc(method, params = []) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.fetch(this.rpcUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ jsonrpc: '2.0', id: ++this.requestId, method, params })
      });
      if (!response.ok) throw new ExplorerError(`RPC HTTP ${response.status}`, 'RPC');
      const payload = await response.json();
      if (payload.error) throw new ExplorerError(`RPC ${payload.error.code}: ${payload.error.message}`, 'RPC');
      return payload.result;
    } catch (error) {
      if (error.name === 'AbortError') throw new ExplorerError(`RPC request timed out after ${this.timeout}ms`, 'TIMEOUT');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async status() {
    const [chainId, latestBlock] = await Promise.all([this.rpc('eth_chainId'), this.rpc('eth_blockNumber')]);
    return { chainId: hexToNumber(chainId), latestBlock: hexToNumber(latestBlock), latestIndexed: this.data.latestIndexed };
  }

  async sync({ from, to } = {}) {
    const chainId = hexToNumber(await this.rpc('eth_chainId'));
    if (this.data.chainId != null && this.data.chainId !== chainId) throw new ExplorerError(`Index belongs to chain ${this.data.chainId}, RPC is chain ${chainId}`, 'CHAIN_MISMATCH');
    this.data.chainId = chainId;
    const latest = hexToNumber(await this.rpc('eth_blockNumber'));
    const start = from ?? (this.data.latestIndexed == null ? latest : this.data.latestIndexed + 1);
    const end = to ?? latest;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0) throw new ExplorerError('Invalid block range', 'INPUT');
    if (start > end && from == null && to == null) return { chainId, from: start, to: end, blocksIndexed: 0, transactionsIndexed: 0 };
    if (end < start) throw new ExplorerError('Invalid block range', 'INPUT');
    const indexed = [];
    for (let height = start; height <= end; height += 1) {
      const block = await this.rpc('eth_getBlockByNumber', [`0x${height.toString(16)}`, true]);
      if (!block) throw new ExplorerError(`Block ${height} was not found`, 'NOT_FOUND');
      this.indexBlock(block);
      this.data.latestIndexed = Math.max(this.data.latestIndexed ?? height, height);
      indexed.push(height);
    }
    await this.persist();
    return { chainId, from: start, to: end, blocksIndexed: indexed.length, transactionsIndexed: indexed.reduce((sum, height) => sum + this.data.blocks[height].transactionCount, 0) };
  }

  indexBlock(block) {
    const number = hexToNumber(block.number);
    const txs = Array.isArray(block.transactions) ? block.transactions : [];
    const summary = {
      number, hash: normalize(block.hash), parentHash: normalize(block.parentHash), timestamp: hexToNumber(block.timestamp),
      miner: normalize(block.miner), gasUsed: hexToNumber(block.gasUsed), gasLimit: hexToNumber(block.gasLimit), transactionCount: txs.length
    };
    this.data.blocks[number] = summary;
    for (const tx of txs) {
      const record = {
        hash: normalize(tx.hash), blockNumber: number, transactionIndex: hexToNumber(tx.transactionIndex), from: normalize(tx.from),
        to: normalize(tx.to), valueWei: BigInt(tx.value || '0x0').toString(), gas: hexToNumber(tx.gas), nonce: hexToNumber(tx.nonce), input: tx.input || '0x'
      };
      this.data.transactions[record.hash] = record;
      this.addAddressTransaction(record.from, record.hash);
      if (record.to) this.addAddressTransaction(record.to, record.hash);
    }
  }

  getBlock(number) { return this.data.blocks[number] || null; }
  getTransaction(hash) { return this.data.transactions[normalize(hash)] || null; }
  getAddress(address) {
    const normalized = normalize(address);
    const hashes = this.data.addresses[normalized] || [];
    return { address: normalized, transactionCount: hashes.length, transactions: hashes.map(hash => this.data.transactions[hash]) };
  }
  stats() {
    return { chainId: this.data.chainId, latestIndexed: this.data.latestIndexed, blocks: Object.keys(this.data.blocks).length, transactions: Object.keys(this.data.transactions).length, addresses: Object.keys(this.data.addresses).length };
  }

  addAddressTransaction(address, hash) {
    if (!address) return;
    const key = normalize(address);
    const list = this.data.addresses[key] || (this.data.addresses[key] = []);
    if (!list.includes(hash)) list.push(hash);
  }

  async persist() {
    await mkdir(dirname(this.dataFile), { recursive: true });
    const temporary = `${this.dataFile}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.data, null, 2)}\n`);
    await rename(temporary, this.dataFile);
  }
}

module.exports = { BlockExplorerDiamond, ExplorerError, hexToNumber };
