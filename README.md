# Terra-Bridge-Contracts
The goal of the Terra-Bridge contracts is to allow users to transfer erc20 tokens and ether from public EVM chains such as Ethereum and QTUM onto Terra-Chain (PoA based).

Home Bridge is deployed on Terra-Chain.

Foreign Bridge is deployed on public chains.

Responsibilities and roles of the bridge:
- Administrator Role(representation of a multisig contract):
  - add/remove validators
  - set daily limits on both bridges
  - set maximum per transaction limit on both bridges
  - set minimum per transaction limit on both bridges
  - upgrade contracts in case of vulnerability
  - set minimum required signatures from validators in order to relay a user's transaction
  - register erc20 tokens to enable for transfer
- Validator Role :
  - provide 100% uptime to relay transactions
  - listen for TransferToForeign events on Home bridge to transfer tokens on Foreign bridge to recipient
  - listen for TransferToHome events on Foreign bridge to transfer tokens on Home bridge to recipient
- User role:
  - sends transfer requests to Home bridge in order to receive corresponding token on Foreign Bridge
  - sends transfer requests on Foreign Bridge in order to receive corresponding token on Home Bridge

# Install
`npm install`

# Run Tests

`npm run test` (make sure truffle is installed globally or use the truffle in node_modules).

# Generate coverage report

`npm run cov` (make sure truffle is installed globally or use the truffle in node_modules).

# Deploy
1. Build contracts:
`npm build`
2. Start 2 ganache instances with the same mnemonic:
`yarn ganache-cli -p 8545 -m 1`
`yarn ganache-cli -p 8546 -m 1`
3. `cd deployment`
4. `npm install`
5. Populate `.env` file in `deployment` directory according to `.env.example`
*NOTE:*
    * Provide `PRIVATE KEYS` without '0x' prefix
    * Ensure using HTTP protocol when RPC on localhost (e.g. `HOME_RPC_URL=http://localhost:8545`)
    * Validators from `VALIDATORS` variable have to be different than other accounts assigned in this file (i.e. `FOREIGN_UPGRADEABLE_ADMIN_VALIDATORS`, `FOREIGN_UPGRADEABLE_ADMIN_BRIDGE`, `FOREIGN_OWNER`)
6. `npm run deploy`
7. `.env.example` is configed to connect to 2 local chains listening on `8545` and `8546`, with mnemonic of `crawl fade put couch jewel wine basket million license indoor push sniff`.

- The deployment script will automatically register 2 tokens. One on the Home side that represents native on Foreighn, and one on Foreign side that represents native on

# Usage
## Registering a token in the bridge
1. Deploy a HomeToken representation of the Foreign token.
2. Call `registerToken` on Home contract with `foreignTokenAddress` and `homeTokenAddress` as params
3. Register `minPerTx`, `maxPerTx`, `dailyLimit` on both bridges for the token to non-zero values

## Transfering from Foreign to Home
- Transfer Native
  1. Call `transferNativeToHome` on Foreign Bridge with `recipient` address for the home side as param, and `msg.value` of the transfer amount

- Transfer ERC20 Token
  1. `approve` Foreign Bridge with allowance equal to the transfer amount
  2. Call `transferTokenToHome` on Foreign Bridge with `token` address for the token to be transferred, `recipient` address for the home side, and transfer `value` as params

## Transfering from Home to Foreign
- Transfer Native
  1. Call `transferNativeToForeign` on Home Bridge with `recipient` address for the foreign side as param, and `msg.value` of the transfer amount

- Transfer HomeToken (ERC827)
  1. Call `transferTokenToHome` on Foreign Bridge with `homeToken` address for the token to be transferred, `recipient` address for the home side, and transfer `value` as params
  - Note, because HomeTokens are ERC827, we can use `approveAndCall` function on the token to perform both the approve and call to `transferTokenToHome` in a single call

# Docker image
Dockerfile is added to help build and push docker image of terra-bridge-contracts. To build image run:  
- `docker build -t <repository_name>:<tagname> .`
  
To push docker image to the Docker Hub registry or to a self-hosted one:
- `docker push <repository_name>:<tagname>`  