// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "./interfaces/IUniswapV2Router.sol";
import "./interfaces/IERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract CBI_Treasury is Ownable, Pausable, ReentrancyGuard {
    using Address for address;

    IUniswapV2Router public swapRouter;
    IERC20 public cbiToken;
    IERC20 public usdtToken;

    uint256 public withdrawalFee = 5; // withdrawal fee
    address public feeRecipient; // withdrawal fee recipient
    mapping(address => uint256) public withdrawNonces; // withdrawal nonces

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public immutable WITHDRAW_CBI_TYPEHASH =
        keccak256(
            "WithdrawCBIbySign(address user,uint amount,uint userId,address sender,uint256 nonce,uint256 deadline)"
        );

    event PurchaseCBI(
        uint256 indexed usdtAMount,
        uint256 indexed cbiAmount,
        address user,
        uint256 indexed userId
    );
    event ReplenishCBI(
        uint256 indexed cbiAmount,
        address user,
        uint256 indexed userId
    );
    event WithdrawCBI(
        uint256 indexed cbiAmount,
        address user,
        uint256 indexed userId
    );
    event WithdrawalFeesPayments(
        uint256 indexed cbiAmount,
        address indexed feesRecipient
    );
    event RescueToken(address to, address token, uint256 amount);
    event RescueFTM(address to, uint256 amount);
    event UpdateWithdravalFeesPercent(uint256 newFeesPercent);
    event UpdateFeeRecipient(address newFeeRecipient);

    constructor(
        address _swapRouter, // SpookySwapRouter address
        address _cbiToken,   // CBI token address
        address _usdtToken,  // USDT token address
        address _feeRecipient// Withdrawal fee recipient wallet address
    ) {
        require(Address.isContract(_swapRouter), "CBI_Treasury: Not contract");
        require(Address.isContract(_cbiToken), "CBI_Treasury: Not contract");
        require(Address.isContract(_usdtToken), "CBI_Treasury: Not contract");
        require(_feeRecipient != address(0), "CBI_Treasury: Null address");

        swapRouter = IUniswapV2Router(_swapRouter);
        cbiToken = IERC20(_cbiToken);
        usdtToken = IERC20(_usdtToken);
        feeRecipient = _feeRecipient;

        uint256 chainId = block.chainid;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("CBI_Treasury")),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );

        IERC20(_cbiToken).approve(_swapRouter, type(uint256).max);
        IERC20(_usdtToken).approve(_swapRouter, type(uint256).max);
    }

    receive() external payable {}

    //==================================== CBI_Treasury external functions ==============================================================

    /**
    @dev The function performs the purchase of CBI tokens by exchanging USDT token for CBI. On SpookySwapRouter.
    @param amount USDT token amount.
    @param userId user ID in CBI system.
    */
    function purchaseCBI(uint256 amount, uint256 userId) external {
        require(amount > 0, "CBI_Treasury: Zero amount USDT");
        usdtToken.transferFrom(msg.sender, address(this), amount);
        address[] memory path = new address[](2);
        path[0] = address(usdtToken);
        path[1] = address(cbiToken);

        uint256[] memory swapAmounts = swapRouter.swapExactTokensForTokens(
            amount,
            0,
            path,
            address(msg.sender),
            block.timestamp
        );

        emit PurchaseCBI(amount, swapAmounts[1], msg.sender, userId);
    }

    /**
    @dev The function performs the replenishment of the CBI token on this contract.
    @param userId user ID in CBI system.
    @param amount CBI token amount.
    */
    function replenishCBI(uint256 userId, uint256 amount) external {
        require(amount > 0, "CBI_Treasury: Zero amount");
        cbiToken.transferFrom(msg.sender, address(this), amount);
        emit ReplenishCBI(amount, msg.sender, userId);
    }

    /**
    @dev Function for withdraw CBI token from Treasury contract. 
    This function uses the EIP-712 signature standard.
    */
    function withdrawCBIbySign(
        address user,
        uint256 amount,
        uint256 userId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(deadline > block.timestamp, "CBI_Treasury: Expired");
        uint256 nonce = withdrawNonces[msg.sender]++;

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        WITHDRAW_CBI_TYPEHASH,
                        user,
                        amount,
                        userId,
                        msg.sender,
                        nonce,
                        deadline
                    )
                )
            )
        );

        address recoveredAddress = ecrecover(digest, v, r, s);
        require(
            recoveredAddress != address(0) && recoveredAddress == owner(),
            "CBI_Treasury: INVALID_SIGNATURE"
        );

        _withdrawCBI(user, amount, userId);
    }

//==================================== CBI_Treasury view functions ==============================================================
    
    /**
    @dev Public view function returns the balance of the USDT token on this contract.
    */
    function usdtBalance() public view returns (uint256) {
        return usdtToken.balanceOf(address(this));
    }

    /**
    @dev Public view function returns the balance of the CBI token on this contract.
    */
    function cbiBalance() public view returns (uint256) {
        return cbiToken.balanceOf(address(this));
    }

//==================================== CBI_Treasury internal functions ==============================================================
    /**
    @dev Helper internal function for withdrawing user CBI tokens from Treasury contract.
    @param user user wallet address.
    @param amount CBI token amount.
    @param userId user ID in CBI system.
    */
    function _withdrawCBI(
        address user,
        uint256 amount,
        uint256 userId
    ) internal {
        require(amount > 0, "CBI_Treasury: Zero amount");
        require(cbiBalance() >= amount, "CBI_Treasury: Not enough balance CBI");

        uint256 feesAmount = withdrawalFee > 0
            ? (amount * withdrawalFee) / 100
            : 0;
        uint256 cbiTransferAmount = amount - withdrawalFee;

        if (feesAmount > 0) {
            cbiToken.transfer(feeRecipient, feesAmount);
            emit WithdrawalFeesPayments(feesAmount, owner());
        }

        cbiToken.transfer(user, cbiTransferAmount);
        emit WithdrawCBI(cbiTransferAmount, user, userId);
    }

    // ============================================ Owner functions ===============================================

    /**
    @dev Reserve external function for withdrawing user CBI tokens from the  Treasury. Only the owner can call.
    @param user user wallet address.
    @param amount CBI token amount.
    @param userId user ID in CBI system.
    */
    function withdrawCBI(
        address user,
        uint256 amount,
        uint256 userId
    ) external onlyOwner {
        _withdrawCBI(user, amount, userId);
    }

    /**
    @dev Reserve function for rescue others tokens. Only the owner can call.
    @param amount token amount.
    @param tokenAddress token address.
    @param to address for withdrawal.
    */
    function rescue(
        address to,
        address tokenAddress,
        uint256 amount
    ) external onlyOwner {
        require(
            to != address(0),
            "CBI_Treasury: Cannot rescue to the zero address"
        );
        require(amount > 0, "CBI_Treasury: Cannot rescue 0");

        IERC20(tokenAddress).transfer(to, amount);
        emit RescueToken(to, address(tokenAddress), amount);
    }

    /**
    @dev Reserve function for rescue FTM. Only the owner can call.
    @param amount FTM amount.
    @param to address for withdrawal.
    */
    function rescueFTM(address payable to, uint256 amount) external onlyOwner {
        require(
            to != address(0),
            "CBI_Treasury: Cannot rescue to the zero address"
        );
        require(amount > 0, "CBI_Treasury: Cannot rescue 0");

        to.transfer(amount);
        emit RescueFTM(to, amount);
    }

    /**
     * @dev Updates withdrawal fee amount.
     * @param newFeesPercent new withdrawal fee amount.
     * Only owner can call this function.
     */
    function updateFeesPercent(uint256 newFeesPercent) external onlyOwner {
        require(
            newFeesPercent < 100,
            "CBI_Treasury: Cannot be more than 100 percent"
        );
        withdrawalFee = newFeesPercent;
        emit UpdateWithdravalFeesPercent(newFeesPercent);
    }

    /**
     * @dev Updates fee recipient.
     * @param newFeeRecipient new withdrawal fee recipient address
     * Only owner can call this function..
     */
    function updateFeeRecipient(address newFeeRecipient) external onlyOwner {
        require(
            newFeeRecipient != address(0),
            "CBI_Treasury: Null address cannot be fee recipient"
        );
        feeRecipient = newFeeRecipient;
        emit UpdateFeeRecipient(newFeeRecipient);
    }
}
