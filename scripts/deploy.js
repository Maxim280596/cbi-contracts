// const { ethers } = require("hardhat");
// const { setPendingRewardsFunctionName } = require("../utills/setPendingRewardsFunctionName.js");
// const {verifyContract}  = require("../utills/verifyContract");


// const want = "0x865821ae3e2FE1A14429eCFe67b723d13c511319";
// const usdc = "0x8ebD65Fb38dc25B5f8C16A1b092BA79B9EbCEE8a";
// const wftm = "0xf1277d1Ed8AD466beddF92ef448A132661956621";
// const tshare = "0xf5a04b2df6CCF6832cd9f00bcbB21e628184577E";
// const chef = "0xe7bBe7504822192F03CFeFC207854A60A9d14F63";
// const unirouter = "0xa6AD18C2aC47803E193F75c3677b14BF19B94883";


// const vaultParams = {
//   mooName: "Shares",
//   mooSymbol: "SH",
//   delay: 60,
//   usdcToken: usdc,
//   wftm: wftm,
//   tshare: tshare
// };

// const strategyParams = {
//   want: want,
//   poolId: 0,
//   chef: chef,
//   unirouter: unirouter,
//   strategist: "0xF94AeE7BD5bdfc249746edF0C6Fc0F5E3c1DA226", // some address
//   keeper: "0xF94AeE7BD5bdfc249746edF0C6Fc0F5E3c1DA226",
//   tombFeeRecipient: "0xF94AeE7BD5bdfc249746edF0C6Fc0F5E3c1DA226",
//   outputToNativeRoute: [tshare, wftm],
//   outputToLp0Route: [tshare, wftm],
//   outputToLp1Route: [tshare],
//  // pendingRewardsFunctionName: "pendingTri", // used for rewardsAvailable(), use correct function name from masterchef
// };

// const contractNames = {
//   vault: "TombVault",
//   vaultPoxy: "TombVaultProxy",
//   strategy: "StrategyCommonChefLPTomb",
//   strategyProxy: "StrategyCommonChefLPProxy",
// };

// async function main() {
//   if (
//     Object.values(vaultParams).some(v => v === undefined) ||
//     Object.values(strategyParams).some(v => v === undefined) ||
//     Object.values(contractNames).some(v => v === undefined)
//   ) {
//     console.error("one of config values undefined");
//     return;
//   }

//   const Vault = await ethers.getContractFactory("contracts/Vault.sol:TombVault");
//   const VaultProxy = await ethers.getContractFactory("contracts/Vault.sol:TombVaultProxy");
//   const Strategy = await ethers.getContractFactory("contracts/Strategy.sol:StrategyCommonChefLPTomb");
//   const StrategyProxy = await ethers.getContractFactory("contracts/Strategy.sol:StrategyCommonChefLPProxy");
 
//   const strategy = await Strategy.deploy();
//   await strategy.deployed();
//   const proxyStrategy = await StrategyProxy.deploy(strategy.address);
//   await proxyStrategy.deployed();
//   const strategyArtifact = await artifacts.readArtifact(contractNames.strategy);
//   const strategyAtProxy = await ethers.getContractAt(strategyArtifact.abi, proxyStrategy.address);
//   await strategyAtProxy.initialize(
//     strategyParams.want,
//     strategyParams.poolId,
//     strategyParams.chef,
//     strategyParams.strategist,
//     strategyParams.unirouter,
//     strategyParams.keeper,
//     strategyParams.strategist,
//     strategyParams.tombFeeRecipient,
//     strategyParams.outputToNativeRoute,
//     strategyParams.outputToLp0Route,
//     strategyParams.outputToLp1Route
//   )

//   const vault = await Vault.deploy();
//   await vault.deployed();
//   const proxyVault = await VaultProxy.deploy(vault.address);
//   await proxyVault.deployed();
//   const vaultArtifact = await artifacts.readArtifact(contractNames.vault);
//   const vaultAtProxy = await ethers.getContractAt(vaultArtifact.abi, proxyVault.address);
  

//   await vaultAtProxy.initialize(
//     proxyStrategy.address,
//     vaultParams.mooName,
//     vaultParams.mooSymbol,
//     vaultParams.delay,
//     vaultParams.usdcToken,
//     vaultParams.wftm,
//     vaultParams.tshare
//   )




//   // add this info to PR
//   console.log();
//   console.log("Proxy Vault:", vaultAtProxy.address);
//   console.log("Proxy Strategy:", strategyAtProxy.address);
//   console.log("Want:", strategyParams.want);
//   console.log("PoolId:", strategyParams.poolId);

//   console.log();
//   console.log("Running post deployment");

//  await strategyAtProxy.setPendingRewardsFunctionName("pendingShare");


//  await strategyAtProxy.setVault(proxyVault.address);
// //   transfer ownership for test wallet for testing owner methods.
// //  await strategyAtProxy.transferOwnership("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
// //  await vaultAtProxy.transferOwnership("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
//  await verifyContract(vault.address, vaultConstructorArguments);
// }

// main()
//   .then(() => process.exit(0))
//   .catch(error => {
//     console.error(error);
//     process.exit(1);
//   });