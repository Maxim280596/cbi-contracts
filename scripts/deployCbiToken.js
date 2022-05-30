const { ethers } = require("hardhat");

const NAME = "CBI";
const SYMBOL = "CBI";
const TOTAL_SUPPLY = "100000000000000000000000000";

async function main() {
 
console.log("Deployment start...")
const CBI_ERC20 = await ethers.getContractFactory("contracts/CBI_ERC20.sol:CBI_ERC20");
const cbiToken = await CBI_ERC20.deploy(NAME, SYMBOL, TOTAL_SUPPLY);

await cbiToken.deployed()

console.log("CBI_ERC20 address: ", cbiToken.address)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });