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
  `truffle develop` (make sure truffle is installed globally or use the truffle in node_modules).
  In truffle develop console, run `test`.

