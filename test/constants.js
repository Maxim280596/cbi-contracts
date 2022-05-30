const EIP712Domain = [{
  name: "name",
  type: "string"
},
{
  name: "version",
  type: "string"
},
{
  name: "chainId",
  type: "uint256"
},
{
  name: "verifyingContract",
  type: "address"
},
]

const WithdrawCBIbySign = [{
  name: "user",
  type: "address"
},
{
  name: "amount",
  type: "uint"
},
{
  name: "userId",
  type: "uint"
},
{
  name: "sender",
  type: "address"
},
{
  name: "nonce",
  type: "uint256"
},
{
  name: "deadline",
  type: "uint256"
},
]

const SellCBIbySign = [{
  name: "user",
  type: "address"
},
{
  name: "amount",
  type: "uint"
},
{
  name: "userId",
  type: "uint"
},
{
  name: "sender",
  type: "address"
},
{
  name: "nonce",
  type: "uint256"
},
{
  name: "deadline",
  type: "uint256"
},
]


const ROUTER_ADDRESS = "0xa6AD18C2aC47803E193F75c3677b14BF19B94883"
const MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

module.exports = {
  EIP712Domain,
  WithdrawCBIbySign,
  SellCBIbySign,
  ROUTER_ADDRESS,
  MAX_UINT
};