const { ethers } = require("hardhat");

const USDT_ADDRESS = "0x4e698B155abdE661E31b0561C1a6654D970Bf256";
const CBI_ERC20_ADDRESS = "0x55b2ab734F21fE86A30aFc5A12210bE804f057D2";
const ROUTER_ADDRESS = "0xa6AD18C2aC47803E193F75c3677b14BF19B94883";
const ADMIN_ADDRESS = "0x8A45436cFabd59c305b0A129188117D4C3a4E928"

async function main() {
 
console.log("Deployment start...")
const Treasury = await ethers.getContractFactory("contracts/CBI_Treasury.sol:CBI_Treasury");
const treasury = await Treasury.deploy(ROUTER_ADDRESS, CBI_ERC20_ADDRESS, USDT_ADDRESS, ADMIN_ADDRESS);

await treasury.deployed()

console.log("Treasury address: ", treasury.address)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });