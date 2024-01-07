import { ethers, network } from "hardhat";
import config from "../config";

async function main()
{
    const [deployer] = await ethers.getSigners();

    const networkName = network.name;

    const factory = await ethers.deployContract("TropicalFactory", [deployer.address], {
        gasLimit: "0x1000000",
    });
    await factory.waitForDeployment();
    console.log(`factory deployed to ${factory.target} with feeToSetter ${await factory.feeToSetter()}`);

    let wrappedMantle;
    if (networkName == "localhost")
    {
        wrappedMantle = await ethers.deployContract("WMANTLE", {
            gasLimit: "0x1000000",
        });
        await wrappedMantle.waitForDeployment();
        console.log(`wrappedMantle deployed to ${wrappedMantle.target}`);
    }
    else
    {
        wrappedMantle = await ethers.getContractAt("WMANTLE", config.WMANTLE[networkName as keyof typeof config.WMANTLE]);
        console.log(`wrappedMantle ${networkName} address: ${wrappedMantle.target}`);
    }

    const tropicalRouter = await ethers.deployContract("TropicalRouter", [factory.target, wrappedMantle.target], {
        gasLimit: "0x1000000",
    });
    await tropicalRouter.waitForDeployment();
    console.log(`router deployed to ${tropicalRouter.target}`);

    const tropicalZap = await ethers.deployContract("TropicalZapV1", [wrappedMantle.target, tropicalRouter.target, 50], {
        gasLimit: "0x1000000",
    });
    await tropicalZap.waitForDeployment();
    console.log(`zap deployed to ${tropicalZap.target}`);

    const tokenA = await ethers.deployContract("MockERC20", ["Token A", "TA", ethers.parseEther("10000000")], {
        gasLimit: "0x1000000",
    });
    await tokenA.waitForDeployment();
    console.log('tokenA deployed to ', tokenA.target);

    const tokenC = await ethers.deployContract("MockERC20", ["Token C", "TC", ethers.parseEther("10000000")], {
        gasLimit: "0x1000000",
    });
    await tokenC.waitForDeployment();
    console.log('tokenC deployed to ', tokenC.target);

    await tokenA.approve(tropicalRouter.target, ethers.MaxUint256, {
        gasLimit: "0x1000000",
    });
    await tokenC.approve(tropicalRouter.target, ethers.MaxUint256, {
        gasLimit: "0x1000000",
    });
    await tokenA.approve(tropicalZap.target, ethers.MaxUint256, {
        gasLimit: "0x1000000",
    });
    await tokenC.approve(tropicalZap.target, ethers.MaxUint256, {
        gasLimit: "0x1000000",
    });
    //User adds liquidity to LP tokens
    const now = Math.floor(Date.now() / 1000);
    
    console.log('CHECKPOINT 1');
    //add liquidity to tokenA-tokenC pair

    await tropicalRouter.addLiquidity(tokenA.target, tokenC.target, ethers.parseEther("100000"),
    ethers.parseEther("100000"), ethers.parseEther("100000"), ethers.parseEther("100000"), deployer.address, now + 100000, {
        gasLimit: "0x1000000",
    });
    console.log('CHECKPOINT 2');

    const pairAC = await factory.getPair(tokenA.target, tokenC.target);
    console.log('pairAC :', pairAC);

    //add liquidity to tokenA-WMANTLE pair

    await tropicalRouter.addLiquidityETH(tokenA.target, ethers.parseEther("100000"),
        ethers.parseEther("100000"), ethers.parseEther("10"), deployer.address, now + 100000, {
        value: ethers.parseEther("10"),
        gasLimit: "0x1000000"
    });

    const pairAW = await factory.getPair(tokenA.target, wrappedMantle.target);
    console.log('pairAW :', pairAW);

    //User completes zapIn with tokenA (pair tokenA/tokenC)

    const pairAC_contract = await ethers.getContractAt("TropicalPair", pairAC);

    await pairAC_contract.approve(tropicalZap.target, ethers.MaxUint256, {
        gasLimit: "0x1000000",
    });

    const initialPairACSupply = await pairAC_contract.totalSupply();
    const initialPairACBalance = await pairAC_contract.balanceOf(deployer);
    console.log('initial pairAC balance: ' + initialPairACBalance.toString());
    const lpToken = pairAC;
    const tokenToZap = tokenA.target;
    const tokenAmountIn = ethers.parseEther("1");

    const estimation = await tropicalZap.estimateZapInSwap(tokenToZap, tokenAmountIn, lpToken);
    console.log(`swapAmountIn: ${estimation[0]},  swapAmountOut: ${estimation[1]}`);

    // Setting up slippage at 0.5%
    const minTokenAmountOut = BigInt(estimation[1]) * 9995n / 10000n;

    const zap_contract = await ethers.getContractAt("TropicalZapV1", tropicalZap.target);

    const result = await zap_contract.zapInToken(tokenToZap, tokenAmountIn, lpToken, minTokenAmountOut, {
        gasLimit: "0x1000000",
    });
    const receipt = await result.wait();


    console.log('expect new pairAC supply ' + (await pairAC_contract.totalSupply() - initialPairACSupply));
    console.log('expect new pairAC tokens ' + (await pairAC_contract.balanceOf(deployer) - initialPairACBalance)
        + ' to be equal to ' + ethers.parseEther("0.499373703104732887").toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) =>
{
    console.error(error);
    process.exitCode = 1;
});
