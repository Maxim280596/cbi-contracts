const { BigNumber, ethers } = require("ethers");

const startingEtherPerAccount = ethers.utils.parseUnits(BigNumber.from(1_000_000_000).toString(), "ether");

const getPKs = () => {
  let deployerAccount;
  let adminAccount;

  // PKs without `0x` prefix
  deployerAccount = "3e1f33b2a3f087112b2283c4c293e80ef40bf5588f169de9f5c4393808b94445";
  adminAccount = "0835c19e5ea64f599b6e44a51893d25e6d399b5729b62d47cd3b855221fd0c28"

  const accounts = [deployerAccount, adminAccount].filter(pk => !!pk);
  
  return accounts;
};

const buildHardhatNetworkAccounts = async (accounts) => {
  const hardhatAccounts = accounts.map(pk => {
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