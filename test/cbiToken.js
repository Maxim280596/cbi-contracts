const { expect } = require("chai");
const { BigNumber } = require("ethers");

describe("CBI_ERC20 contract", function () {
  let CBI_ERC20;
  let cbiToken;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    CBI_ERC20 = await ethers.getContractFactory("CBI_ERC20");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    cbiToken = await CBI_ERC20.deploy("CBI", "CBI", "1000000000000000000000000000");
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await cbiToken.owner()).to.equal(owner.address);
    });

    it("Should assign the total supply of tokens to the owner", async function () {
      const ownerBalance = await cbiToken.balanceOf(owner.address);
      expect(await cbiToken.totalSupply()).to.equal(ownerBalance);
    });
  });

  describe("Transactions", function () {
    it("Should transfer tokens between accounts", async function () {
      await cbiToken.transfer(addr1.address, 50);
      const addr1Balance = await cbiToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(50);

      await cbiToken.connect(addr1).transfer(addr2.address, 50);
      const addr2Balance = await cbiToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(50);
    });

    it("Should fail if sender doesn’t have enough tokens", async function () {
      const initialOwnerBalance = await cbiToken.balanceOf(owner.address);
      await expect(
        cbiToken.connect(addr1).transfer(owner.address, 1)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

      expect(await cbiToken.balanceOf(owner.address)).to.equal(
        initialOwnerBalance
      );
    });

    it("Should update balances after transfers", async function () {
      const initialOwnerBalance = await cbiToken.balanceOf(owner.address);

      await cbiToken.transfer(addr1.address, BigNumber.from("100000000000000000000"));
      await cbiToken.transfer(addr2.address, BigNumber.from("50000000000000000000"));

      const finalOwnerBalance = await cbiToken.balanceOf(owner.address);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance.sub(BigNumber.from("150000000000000000000")));

      const addr1Balance = await cbiToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(BigNumber.from("100000000000000000000"));

      const addr2Balance = await cbiToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(BigNumber.from("50000000000000000000"));
    });
  });
});