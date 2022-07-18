const { ethers } = require("hardhat");

const USDT_ADDRESS = "0x4e698B155abdE661E31b0561C1a6654D970Bf256";
const CBI_ERC20_ADDRESS = "0x55b2ab734F21fE86A30aFc5A12210bE804f057D2";
const ROUTER_ADDRESS = "0xa6AD18C2aC47803E193F75c3677b14BF19B94883";
const ADMINS = [
  "0xF94AeE7BD5bdfc249746edF0C6Fc0F5E3c1DA226",
  "0x8A45436cFabd59c305b0A129188117D4C3a4E928",
  "0xc29EC7CcA581a7858AB0Ca64eaBc51961D4a129A",
  "0x11710d77bB512744e57Cf7Ca6E51C03b3297F15d",
];

async function main() {
  console.log("Deployment start...");
  const Treasury = await ethers.getContractFactory(
    "contracts/MultiSigTreasury.sol:MultiSigTreasury"
  );
  const treasury = await Treasury.deploy(
    ROUTER_ADDRESS,
    CBI_ERC20_ADDRESS,
    USDT_ADDRESS,
    ADMINS,
    4
  );

  await treasury.deployed();

  console.log("MultiSigTreasury address: ", treasury.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
