const hardhat = require("hardhat");

async function verifyContract (address, constructorArguments) {
  return hardhat.run("verify:verify", {
    address,
    constructorArguments,
  });
};

module.exports = {verifyContract};