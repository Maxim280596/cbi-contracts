const { BigNumber, ethers } = require("ethers");

const startingEtherPerAccount = ethers.utils.parseUnits(BigNumber.from(1_000_000_000).toString(), "ether");

const getPKs = () => {
  let deployerAccount;

  // PKs without `0x` prefix
  deployerAccount = "3e1f33b2a3f087112b2283c4c293e80ef40bf5588f169de9f5c4393808b94445";


  const accounts = [deployerAccount].filter(pk => !!pk);
  return accounts;
};

const buildHardhatNetworkAccounts = async () => {
  const acc = await ethers.getSigners()
  const hardhatAccounts = acc.map(pk => {
    // hardhat network wants 0x prefix in front of PK
    const accountConfig = {
      privateKey: pk,
      balance: startingEtherPerAccount.toString(),
    };
    return accountConfig;
  });
  return hardhatAccounts;
};

module.exports = {buildHardhatNetworkAccounts, getPKs, startingEtherPerAccount};