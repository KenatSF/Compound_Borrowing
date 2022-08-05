const { time } = require("@openzeppelin/test-helpers")
const { DAI, CDAI, WBTC, CWBTC, ETH, CETH, CUSDC, WBTC_WHALE, DAI_WHALE, UNITROLLER, PRICEFEED0, PRICEFEED1 } = require('./config')

const { ethers, waffle } = require("hardhat")




async function snapshot(signer, hedging, lendingToken, lendingCToken, borrowingToken, borrowingCToken) {
  const { exchangeRate, supplyRate } = await hedging.connect(signer).callStatic.getInfo();
  const [liquidity, shortfall] = await hedging.connect(signer).getAccountLiquidity();
  const price = await hedging.connect(signer).getPriceFeed(borrowingCToken.address);
  const maxBorrow = liquidity.div(price);
  const thisBalanceTokenBorrowed = await borrowingToken.balanceOf(hedging.address);
  const compoundBalanceTokenBorrowed = await hedging.connect(signer).callStatic.getBorrowedBalance(borrowingCToken.address);

  return {
    exchangeRate: exchangeRate,
    supplyRate: supplyRate,
    balanceOfUnderlying: await hedging.connect(signer).callStatic.balanceOfUnderlying(),
    token: await lendingToken.balanceOf(hedging.address),
    cToken: await lendingCToken.balanceOf(hedging.address),
    accountLiquidity: liquidity,
    shortfall: shortfall,
    price: price,
    maxBorrow: maxBorrow,
    thisBalanceTokenBorrowed: thisBalanceTokenBorrowed,
    compoundBalanceTokenBorrowed: compoundBalanceTokenBorrowed

  }
}

describe("My own pseudo Yearn Finance", () => {
  const WHALE = WBTC_WHALE
  const WHALE1 = DAI_WHALE
  const TOKEN = WBTC
  const C_TOKEN = CWBTC
  const BTOKEN = DAI
  const BC_TOKEN = CDAI

  let hedging
  let token
  let cToken
  let token_borrow
  let cToken_borrow
  let cToken_2
  let cToken_3
  let cToken_4
  beforeEach(async () => {
    const [creator, address_1] = await ethers.getSigners();

    // Deploy contracts
    token = await ethers.getContractAt("IERC20", TOKEN);
    cToken = await ethers.getContractAt("CErc20", C_TOKEN);
    token_borrow = await ethers.getContractAt("IERC20", BTOKEN);
    cToken_borrow = await ethers.getContractAt("CErc20", BC_TOKEN);
    cToken_2 = await ethers.getContractAt("CErc20", "0x95b4ef2869ebd94beb4eee400a99824bf5dc325b");
    cToken_3 = await ethers.getContractAt("CErc20", "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5");
    cToken_4 = await ethers.getContractAt("CErc20", "0x39aa39c021dfbae8fac545936693ac917d5e7563");

    const HEDGING = await ethers.getContractFactory("Hedging");
    hedging = await HEDGING.connect(creator).deploy(TOKEN, C_TOKEN, UNITROLLER, PRICEFEED0);
    await hedging.deployed();

    console.log('-----------------------------------------------------------');
    console.log(` Creator address: ${creator.address}`);
    console.log(`Heding contract address: ${hedging.address}`);
    console.log(" ");

    // From eth units: ethers.utils.formatUnits(bal, 8)
    // To eth units: ethers.utils.parseUnits("1", 18)

  })

  it("Exchange Rate", async () => {

    console.log('-----------------------------------------------------------');
    console.log("WBTC: ");  //  17 units
    console.log(`er READ:  ${await cToken.exchangeRateStored()}`);
    console.log(`er WRITE: ${await cToken.callStatic.exchangeRateCurrent()}`);

    console.log('-----------------------------------------------------------');
    console.log("MAKER: ");
    console.log(`er READ:  ${await cToken_2.exchangeRateStored()}`);
    console.log(`er WRITE: ${await cToken_2.callStatic.exchangeRateCurrent()}`);

    console.log('-----------------------------------------------------------');
    console.log("DAI: ");   // 27 units
    console.log(`er READ:  ${await cToken_borrow.exchangeRateStored()}`);
    console.log(`er WRITE: ${await cToken_borrow.callStatic.exchangeRateCurrent()}`);

    console.log('-----------------------------------------------------------');
    console.log("ETH: ");
    console.log(`er READ:  ${await cToken_3.exchangeRateStored()}`);

    console.log('-----------------------------------------------------------');
    console.log("USDC: ");  // 15 units
    console.log(`er READ:  ${await cToken_4.exchangeRateStored()}`);

    //| -----------------------------------------------------------
    //| WBTC:
    //| er READ:  20065352431392226
    //| er WRITE: 20065352431392226
    //| -----------------------------------------------------------
    //| MAKER:
    //| er READ:  200177881476866926561860738
    //| er WRITE: 200177881476866926561860738
    //| -----------------------------------------------------------
    //| DAI:
    //| er READ:  220000382771553871756885419
    //| er WRITE: 220000382771553871756885419
    //| -----------------------------------------------------------
    //| ETH:
    //| er READ:  200635220238136116202268925
    //| -----------------------------------------------------------
    //| USDC:
    //| er READ:  226027989471790

    // Recordar 9 unidades = returned value - token decimals
  

  })

  it("SUPPLY, Borrow, Repay & Redeem", async () => {
    const [creator, address_1] = await ethers.getSigners();
    const provider = waffle.provider;
    const whale_signer = provider.getSigner(WHALE);
    const whale_signer_1 = provider.getSigner(WHALE1);

    let info, repay_amount;
    const deposit_amount = ethers.utils.parseUnits("1", 8);
    const deposit_repay = ethers.utils.parseUnits("1", 18);

    //console.log(`contract balance ${await token_borrow.balanceOf(WHALE1)}`);

    console.log('-----------------------------------------------------------');
    console.log("Funding account:");
    await token.connect(whale_signer).transfer(address_1.address, deposit_amount);

    console.log('-----------------------------------------------------------');
    console.log("Snapshot:");
    info = await snapshot(address_1, hedging, token, cToken, token_borrow, cToken_borrow);
    console.log(info);
    console.log(" ");

    console.log('-----------------------------------------------------------');
    console.log("Supply/Deposit contract:");
    let tx_approve = await token.connect(address_1).approve(hedging.address, deposit_amount);
    console.log(`Approve tx: ${tx_approve.hash} & confirmations: ${tx_approve.confirmations}`);
    await tx_approve.wait();

    let tx_deposit = await hedging.connect(address_1).supply(deposit_amount);
    console.log(`Deposit tx: ${tx_deposit.hash} & confirmations: ${tx_deposit.confirmations}`);
    await tx_deposit.wait();

    console.log('-----------------------------------------------------------');
    console.log("Snapshot:");
    info = await snapshot(address_1, hedging, token, cToken, token_borrow, cToken_borrow);
    console.log(info);
    console.log(" ");


    console.log('-----------------------------------------------------------');
    console.log("Time passing");
    const block0 = await provider.getBlockNumber();
    console.log(`Block Number: ${block0}`);
    await time.advanceBlockTo(block0 + 75);

    console.log('-----------------------------------------------------------');
    console.log("Snapshot:");
    info = await snapshot(address_1, hedging, token, cToken, token_borrow, cToken_borrow);
    console.log(info);
    console.log(" ");

    console.log('-----------------------------------------------------------');
    console.log("Borrowing some tokens: ");
    let tx_borrow = await hedging.connect(address_1).borrow(cToken_borrow.address, 18,);
    console.log(`Deposit tx: ${tx_borrow.hash} & confirmations: ${tx_borrow.confirmations}`);
    const answer = await tx_borrow.wait();
    console.log("Eventos: ");
    console.log(answer.events[6]);


    console.log('-----------------------------------------------------------');
    console.log("Snapshot:");
    info = await snapshot(address_1, hedging, token, cToken, token_borrow, cToken_borrow);
    console.log(info);
    console.log(" ");

    console.log('-----------------------------------------------------------');
    console.log("Time passing");
    const block1 = await provider.getBlockNumber();
    console.log(`Block Number: ${block1}`);
    await time.advanceBlockTo(block1 + 60);

    console.log('-----------------------------------------------------------');
    console.log("Snapshot:");
    info = await snapshot(address_1, hedging, token, cToken, token_borrow, cToken_borrow);
    console.log(info);
    console.log(" ");

    console.log('-----------------------------------------------------------');
    console.log("Fund contract:");
    await token_borrow.connect(whale_signer_1).transfer(hedging.address, deposit_repay);

    console.log('-----------------------------------------------------------');
    console.log("Snapshot:");
    info = await snapshot(address_1, hedging, token, cToken, token_borrow, cToken_borrow);
    console.log(info);
    console.log(" ");

    console.log('-----------------------------------------------------------');
    console.log("Repay loan:");
    repay_amount = info.compoundBalanceTokenBorrowed;
    repay_amount = ethers.utils.formatUnits(repay_amount, 18);
    console.log(`Amount to repay: ${repay_amount}`);
    //const real_repay_amount = Math.pow(2,256) - new BN(1);
    let tx_repay = await hedging.connect(address_1).fullRepay(token_borrow.address, cToken_borrow.address);
    console.log(`Deposit tx: ${tx_repay.hash} & confirmations: ${tx_repay.confirmations}`);
    await tx_repay.wait();


    console.log('-----------------------------------------------------------');
    console.log("Snapshot:");
    info = await snapshot(address_1, hedging, token, cToken, token_borrow, cToken_borrow);
    console.log(info);
    console.log(" ");

    console.log('-----------------------------------------------------------');
    console.log("Redeem:");
    cTokenAmount = await cToken.balanceOf(hedging.address);
    let tx_redeem = await hedging.connect(address_1).redeem(cTokenAmount);
    console.log(`Deposit tx: ${tx_redeem.hash} & confirmations: ${tx_redeem.confirmations}`);
    await tx_redeem.wait();

    console.log('-----------------------------------------------------------');
    console.log("Snapshot:");
    info = await snapshot(address_1, hedging, token, cToken, token_borrow, cToken_borrow);
    console.log(info);
    console.log(" ");


  }).timeout(120000);
})