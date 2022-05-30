async function parseSignature(signature) {
  var r = signature.substring(2, 66)
  var s = signature.substring(66, 130)
  var v = signature.substring(130, 132)

  return {
    r: "0x" + r,
    s: "0x" + s,
    v: parseInt(v, 16),
  }
}

module.exports = {
  parseSignature
};