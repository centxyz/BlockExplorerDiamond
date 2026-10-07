# BlockExplorerDiamond

[![CI](https://github.com/centxyz/BlockExplorerDiamond/actions/workflows/ci.yml/badge.svg)](https://github.com/centxyz/BlockExplorerDiamond/actions/workflows/ci.yml)

BlockExplorerDiamond is a working local EVM block explorer and indexer. It reads blocks from any Ethereum-compatible JSON-RPC endpoint, builds a durable local index, and lets you inspect blocks, transactions, and address activity without sending data to a third-party explorer.

## What it does

- Connects to Ethereum and EVM-compatible JSON-RPC nodes
- Synchronizes an explicit block range or resumes after the latest indexed block
- Indexes block metadata, full transactions, and address-to-transaction relationships
- Searches locally by block number, transaction hash, or address
- Uses atomic index writes and refuses to mix data from different chain IDs
- Enforces RPC timeouts and surfaces node errors clearly

## Install

```bash
git clone https://github.com/centxyz/BlockExplorerDiamond.git
cd BlockExplorerDiamond
npm install
```

## Use

Set an RPC endpoint from your own node or provider:

```bash
export EVM_RPC_URL='https://your-ethereum-rpc.example'
npm start -- status
npm start -- sync --from 20000000 --to 20000010
npm start -- block 20000000
npm start -- tx 0xTRANSACTION_HASH
npm start -- address 0xADDRESS
npm start -- stats
```

The index defaults to `.block-explorer/index.json`; override it with `--data path/to/index.json`. Large historical ranges can consume substantial disk space, so synchronize in deliberate ranges.

## Test

```bash
npm test
```

Tests use a deterministic mock JSON-RPC server contract and require no funded wallet or live provider.

## License

MIT © cent

## Current limitations

- The index reflects the configured JSON-RPC node and the explicit block range that has been synchronized.
- It does not independently validate consensus or replace an archival node.
- Large chain ranges require substantial time and local storage.
