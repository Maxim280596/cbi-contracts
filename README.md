# Run Tests

To run Treasury contract tests, you must set  private key from wallet number 1 in the ./test/constants.js  in variable ADMIN_PK. 

To get a list of hardhat wallets and their private keys, run the `npx hardhat node` command

- `yarn test-treasury` (run Treasury contract tests)
- `yarn test-cbi`  (CBI_ERC20 token contract tests)

# Deploy

- yarn deploy-treasury-testnet   (deploy contract Treasury to nerwork fantom testnet)
- yarn deploy-treasury-mainnet  (deploy contract Treasury to nerwork fantom testnet)
- yarn deploy-cbi-testnet (deploy contract CBI_ERC20 to nerwork fantom testnet)
- yarn deploy-cbi-mainnet (deploy contract CBI_ERC20 to nerwork fantom testnet)

# Basic Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, a sample script that deploys that contract, and an example of a task implementation, which simply lists the available accounts.

Try running some of the following tasks:

```shell
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
node scripts/sample-script.js
npx hardhat help
```
