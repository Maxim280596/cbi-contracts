// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "./interfaces/IUniswapV2Router.sol";
import "./interfaces/IERC20.sol";
import "./helpers/Rescue.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract CBI_Treasury is Ownable, Rescue {
    using Address for address;

    IUniswapV2Router public swapRouter;
    IERC20 public cbiToken;
    IERC20 public usdtToken;
    address public admin; // contract admin address

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
    event CellCBI(
        uint256 indexed cbiAmount,
        uint256 indexed usdtAMount,
        address user
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
    event UpdateContractAdmin(address newAdmin);

    constructor(
        address _swapRouter, // SpookySwapRouter address
        address _cbiToken,   // CBI token address
        address _usdtToken,  // USDT token address
        address _admin      // admin address
    ) {
        require(Address.isContract(_swapRouter), "CBI_Treasury: Not contract");
        require(Address.isContract(_cbiToken), "CBI_Treasury: Not contract");
        require(Address.isContract(_usdtToken), "CBI_Treasury: Not contract");
        require(_admin != address(0), "CBI_Treasury: Null address");

        swapRouter = IUniswapV2Router(_swapRouter);
        cbiToken = IERC20(_cbiToken);
        usdtToken = IERC20(_usdtToken);
        admin = _admin;

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

    modifier onlyAdmin {
        require(msg.sender == admin, "Ownable: Caller is not the owner");
        _;
    }

    //==================================== CBI_Treasury external functions ==============================================================

    /**
    @dev The function performs the purchase of CBI tokens by exchanging USDT token for CBI. On SpookySwapRouter.
    @param amount USDT token amount.
    @param userId user ID in CBI system.
    */
    function purchaseCBI(uint256 amount, uint256 userId) external {
        require(amount > 0, "CBI_Treasury: Zero amount USDT");
        require(usdtBalance() >= amount, "CBI_Treasury: Not enough balance CBI");
        address[] memory path = new address[](2);
        path[0] = address(usdtToken);
        path[1] = address(cbiToken);

        uint256[] memory swapAmounts = swapRouter.swapExactTokensForTokens(
            amount,
            0,
            path,
            address(this),
            block.timestamp
        );

        emit PurchaseCBI(amount, swapAmounts[1], msg.sender, userId);
    }

    /**
    @dev The function exchanges the CBI token for USDT. OnlyAdmin can call.
    @param amount CBI token swap amount.
    */
    function cellCBI(uint256 amount) external onlyAdmin {
        require(amount > 0, "CBI_Treasury: Zero amount CBI");
        require(cbiBalance() >= amount, "CBI_Treasury: Not enough balance CBI");
        address[] memory path = new address[](2);
        path[0] = address(cbiToken);
        path[1] = address(usdtToken);

        uint256[] memory swapAmounts = swapRouter.swapExactTokensForTokens(
            amount,
            0,
            path,
            address(this),
            block.timestamp
        );

        emit CellCBI(swapAmounts[1], amount, msg.sender);
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
            recoveredAddress != address(0) && (recoveredAddress == getAdmin() || recoveredAddress == owner()),
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

    function getAdmin() public view returns (address) {
        return admin;
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

        cbiToken.transfer(user, amount);
        emit WithdrawCBI(amount, user, userId);
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
    @dev function performs contract administrator updates. Only the owner can call.
    @param newAdmin new admin wallet address.
    */
    function updateContractAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "CBI_Treasury: Null address");
        require(newAdmin != admin, "CBI_Treasury: new admin equal to the current admin");
        admin = newAdmin;
        emit UpdateContractAdmin(newAdmin);
    }
}
