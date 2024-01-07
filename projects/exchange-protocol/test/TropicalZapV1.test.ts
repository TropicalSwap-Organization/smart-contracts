import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { mineUpTo, mine } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { EventLog, ZeroAddress } from "ethers";
import { string } from "hardhat/internal/core/params/argumentTypes";
import { TropicalPair, TropicalFactory, TropicalZapV1, TropicalRouter, MockERC20, WMANTLE } from "../typechain-types";
import { TypedEventLog } from "../typechain-types/common";
// import { tropicalFactorySol } from "../typechain-types/contracts";


describe("TropicalZap", function ()
{
    let maxZapReverseRatio: number;
    let pairAB: TropicalPair;
    let pairBC: TropicalPair;
    let pairAC: TropicalPair;
    let tropicalZap: TropicalZapV1;
    let tropicalRouter: TropicalRouter;
    let tropicalFactory: TropicalFactory;
    let tokenA: MockERC20;
    let tokenC: MockERC20;
    let wrappedETH: WMANTLE;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carol: SignerWithAddress;
    let david: SignerWithAddress;
    let erin: SignerWithAddress;


    before(async function ()
    {
        // Contracts are deployed using the first signer/account by default
        const [_alice, _bob, _carol, _david, _erin] = await ethers.getSigners();
        alice = _alice;
        bob = _bob;
        carol = _carol;
        david = _david;
        erin = _erin;

        const mockERC20_factory = await ethers.getContractFactory("MockERC20");
        const tropicalFactory_factory = await ethers.getContractFactory("TropicalFactory");
        const tropicalRouter_factory = await ethers.getContractFactory("TropicalRouter");
        const tropicalZap_factory = await ethers.getContractFactory("TropicalZapV1");
        const WETH_factory = await ethers.getContractFactory("WMANTLE");
        const TropicalPair = await ethers.getContractFactory("TropicalPair");


        tropicalFactory = await tropicalFactory_factory.deploy(alice);
        wrappedETH = await WETH_factory.deploy();
        // await tempWrappedETH.deploymentTransaction()?.wait(1);
        // wrappedETH = WMANTLE.attach(await tempWrappedETH.getAddress());

        tropicalRouter = await tropicalRouter_factory.deploy(tropicalFactory, wrappedETH);

        maxZapReverseRatio = 100; // 1%
        tropicalZap = await tropicalZap_factory.deploy(wrappedETH, tropicalRouter, maxZapReverseRatio);

        tokenA = await mockERC20_factory.deploy("Token A", "TA", ethers.parseEther("10000000"));
        tokenC = await mockERC20_factory.deploy("Token C", "TC", ethers.parseEther("10000000"));

        let result = await tropicalFactory.createPair(tokenA.target, wrappedETH.target);
        let resultReceipt = await result.wait(5);
        let eventLog = resultReceipt?.logs[0] as EventLog;
        let pairAddress = eventLog?.args[2];

        pairAB = TropicalPair.attach(pairAddress as string) as TropicalPair;

        result = await tropicalFactory.createPair(wrappedETH, tokenC);
        resultReceipt = await result.wait(5);
        eventLog = resultReceipt?.logs[0] as EventLog;
        pairAddress = eventLog?.args[2];

        pairBC = TropicalPair.attach(pairAddress as string) as TropicalPair;

        result = await tropicalFactory.createPair(tokenA, tokenC);
        resultReceipt = await result.wait(5);
        eventLog = resultReceipt?.logs[0] as EventLog;
        pairAddress = eventLog?.args[2];

        pairAC = TropicalPair.attach(pairAddress as string) as TropicalPair;

        expect(String(await pairAB.totalSupply())).to.equal(ethers.parseEther("0").toString());
        expect(String(await pairBC.totalSupply())).to.equal(ethers.parseEther("0").toString());
        expect(String(await pairAC.totalSupply())).to.equal(ethers.parseEther("0").toString());

        for (let thisUser of [alice, bob, carol, david, erin])
        {
            await tokenA.connect(thisUser).mintTokens(ethers.parseEther("2000000"));
            await tokenC.connect(thisUser).mintTokens(ethers.parseEther("2000000"));
            await tokenA.connect(thisUser).approve(tropicalRouter, ethers.MaxUint256);
            await tokenA.connect(thisUser).approve(tropicalZap, ethers.MaxUint256);
            await tokenC.connect(thisUser).approve(tropicalRouter, ethers.MaxUint256);
            await tokenC.connect(thisUser).approve(tropicalZap, ethers.MaxUint256);
            await wrappedETH.connect(thisUser).approve(tropicalRouter, ethers.MaxUint256);
            await wrappedETH.connect(thisUser).approve(tropicalZap, ethers.MaxUint256);
            await pairAB.connect(thisUser).approve(tropicalZap, ethers.MaxUint256);
            await pairBC.connect(thisUser).approve(tropicalZap, ethers.MaxUint256);
            await pairAC.connect(thisUser).approve(tropicalZap, ethers.MaxUint256);
        }

        return {
            tropicalRouter, tokenA, tokenC, pairAC, pairAB, pairBC, alice, bob, carol, david, erin, tropicalZap, wrappedETH,
            tropicalFactory, maxZapReverseRatio
        };
    })

    describe("Normal cases for liquidity provision and zap ins", function ()
    {
        it("User adds liquidity to LP tokens", async () =>
        {
            // const { result } = await loadFixture(deployTropicalZap);
            // const { tropicalFactory, tropicalRouter, wrappedETH, tokenA, tokenC, pairAC, pairAB, pairBC, bob } = await loadFixture(deployTropicalZap);

            const deadline = (await time.latest()) + 100;

            console.log("factory init code: " + await tropicalFactory.INIT_CODE_PAIR_HASH());

            let result = await tropicalRouter.connect(bob).addLiquidity(
                tokenC.target,
                tokenA.target,
                ethers.parseEther("1000000"), // 1M token A
                ethers.parseEther("1000000"), // 1M token C
                ethers.parseEther("1000000"),
                ethers.parseEther("1000000"),
                bob.address,
                deadline,
            );
            await expect(result).to.emit(tokenA, "Transfer").withArgs(bob.address, pairAC.target, ethers.parseEther("1000000"));
            await expect(result).to.emit(tokenC, "Transfer").withArgs(bob.address, pairAC.target, ethers.parseEther("1000000"));

            expect(String(await pairAC.totalSupply())).to.equal(ethers.parseEther("1000000").toString());
            expect(String(await tokenA.balanceOf(pairAC.target))).to.equal(ethers.parseEther("1000000").toString());
            expect(String(await tokenC.balanceOf(pairAC.target))).to.equal(ethers.parseEther("1000000").toString());

            // 1 ETH = 100 A
            result = await tropicalRouter.connect(bob).addLiquidityETH(
                tokenA.target,
                ethers.parseEther("100000"), // 100k token A
                ethers.parseEther("100000"), // 100k token A
                ethers.parseEther("1000"), // 1,000 ETH
                bob.address,
                deadline,
                { value: ethers.parseEther("1000").toString() }
            );

            await expect(result).to.emit(tokenA, "Transfer").withArgs(bob.address, pairAB.target, ethers.parseEther("100000"));
            expect(String(await pairAB.totalSupply())).to.equal(ethers.parseEther("10000").toString());
            expect(String(await wrappedETH.balanceOf(pairAB.target))).to.equal(ethers.parseEther("1000").toString());
            expect(String(await tokenA.balanceOf(pairAB.target))).to.equal(ethers.parseEther("100000").toString());

            // 1 ETH = 100 C
            result = await tropicalRouter.connect(bob).addLiquidityETH(
                tokenC.target,
                ethers.parseEther("100000"), // 100k token C
                ethers.parseEther("100000"), // 100k token C
                ethers.parseEther("1000"), // 1,000 ETH
                bob.address,
                deadline,
                { value: ethers.parseEther("1000").toString() }
            );

            await expect(result).to.emit(tokenC, "Transfer").withArgs(bob.address, pairBC.target, ethers.parseEther("100000"));
            expect(String(await pairBC.totalSupply())).to.equal(ethers.parseEther("10000").toString());
            expect(String(await wrappedETH.balanceOf(pairBC.target))).to.equal(ethers.parseEther("1000").toString());
            expect(String(await tokenC.balanceOf(pairBC.target))).to.equal(ethers.parseEther("100000").toString());

        })

        it("User completes zapIn with tokenA (pair tokenA/tokenC)", async function ()
        {
            // const { tropicalRouter, tokenA, tokenC, pairAC, bob, tropicalZap } = await loadFixture(deployTropicalZap);

            const lpToken = pairAC.target;
            const tokenToZap = tokenA.target;
            const tokenAmountIn = ethers.parseEther("1");

            const estimation = await tropicalZap.estimateZapInSwap(tokenToZap, ethers.parseEther("1"), lpToken);
            expect(estimation[2]).to.equal(tokenC.target);

            console.log("estimation 1: " + estimation[1].toString());

            // Setting up slippage at 0.5%
            const minTokenAmountOut = BigInt(estimation[1]) * 9995n / 10000n;

            const result = await tropicalZap.connect(carol).zapInToken(tokenToZap, tokenAmountIn, lpToken, minTokenAmountOut);

            await expect(result).to.emit(tropicalZap, "ZapIn").
                withArgs(tokenToZap, lpToken, ethers.parseEther("1").toString(), ethers.parseEther("0.499373703104732887").toString(), carol.address);
            await expect(result).to.emit(pairAC, "Transfer").withArgs(ZeroAddress, carol.address, ethers.parseEther("0.499373703104732887").toString());

            expect(String(await pairAC.balanceOf(carol.address))).to.equal(ethers.parseEther("0.499373703104732887").toString());
            console.info("Balance tokenA: " + ethers.formatUnits(String(await tokenA.balanceOf(tropicalZap.target)), 18));
            console.info("Balance WETH: " + ethers.formatUnits(String(await wrappedETH.balanceOf(tropicalZap.target)), 18));
            console.info("Balance tokenC: " + ethers.formatUnits(String(await tokenC.balanceOf(tropicalZap.target)), 18));
        });

        it("User completes zapIn with ETH (pair ETH/tokenC)", async function ()
        {
            // const { tropicalRouter, tokenA, tokenC, pairAC, bob, tropicalZap, wrappedETH } = await loadFixture(deployTropicalZap);

            const lpToken = pairBC.target;
            const tokenAmountIn = ethers.parseEther("1");

            const estimation = await tropicalZap.estimateZapInSwap(wrappedETH.target, ethers.parseEther("1"), lpToken);
            expect(estimation[2]).to.equal(tokenC.target);

            // Setting up slippage at 0.5%
            const minTokenAmountOut = BigInt(estimation[1]) * 9995n / 10000n;

            const result = await tropicalZap.connect(carol).zapInETH(lpToken, minTokenAmountOut, { value: tokenAmountIn });

            await expect(result).to.emit(tropicalZap, "ZapIn").
                withArgs(ZeroAddress, lpToken, ethers.parseEther("1").toString(), ethers.parseEther("4.992493116557219690").toString(), carol.address);
            await expect(result).to.emit(pairBC, "Transfer").withArgs(ZeroAddress, carol.address, ethers.parseEther("4.992493116557219690").toString());

            console.info("Balance tokenA: " + ethers.formatUnits(String(await tokenA.balanceOf(tropicalZap.target)), 18));
            console.info("Balance WETH: " + ethers.formatUnits(String(await wrappedETH.balanceOf(tropicalZap.target)), 18));
            console.info("Balance tokenC: " + ethers.formatUnits(String(await tokenC.balanceOf(tropicalZap.target)), 18));
        });

        it("User completes zapInRebalancing with ETH (pair ETH/tokenC)", async function ()
        {
            // const { tropicalRouter, tokenA, tokenC, pairAC, bob, tropicalZap, wrappedETH } = await loadFixture(deployTropicalZap);

            const lpToken = pairBC.target;
            const token0AmountIn = ethers.parseEther("1"); // 1 ETH
            const token1AmountIn = ethers.parseEther("50"); // 50 token C

            const estimation = await tropicalZap.estimateZapInRebalancingSwap(
                wrappedETH.target,
                tokenC.target,
                token0AmountIn,
                token1AmountIn,
                lpToken
            );

            expect(estimation[2]).to.equal(true);

            // Setting up slippage at 2x 0.5%
            const minTokenAmountOut = BigInt(estimation[1]) * 9995n / 10000n;
            const maxTokenAmountIn = BigInt(estimation[0]) * 10005n / 10000n;

            const result = await tropicalZap.connect(carol).zapInETHRebalancing(
                tokenC.target,
                token1AmountIn,
                lpToken,
                maxTokenAmountIn,
                minTokenAmountOut,
                estimation[2],
                {
                    value: token0AmountIn.toString(),
                }
            );

            await expect(result).to.emit(tropicalZap, "ZapInRebalancing").
                withArgs(ZeroAddress, tokenC.target, lpToken, token0AmountIn.toString(), token1AmountIn.toString(), ethers.parseEther("7.495311264946730291").toString(), carol.address);

            console.info("Balance tokenA: " + ethers.formatUnits(String(await tokenA.balanceOf(tropicalZap.target)), 18));
            console.info("Balance WETH: " + ethers.formatUnits(String(await wrappedETH.balanceOf(tropicalZap.target)), 18));
            console.info("Balance tokenC: " + ethers.formatUnits(String(await tokenC.balanceOf(tropicalZap.target)), 18));
        });

        it("User completes zapInRebalancing with tokens (tokenA/tokenC)", async function ()
        {
            // const { tropicalRouter, tokenA, tokenC, pairAC, bob, tropicalZap, wrappedETH } = await loadFixture(deployTropicalZap);

            const lpToken = pairAC.target;
            const token0AmountIn = ethers.parseEther("1000"); // 1000 token A
            const token1AmountIn = ethers.parseEther("5000"); // 5000 token C

            const estimation = await tropicalZap.estimateZapInRebalancingSwap(
                tokenA.target,
                tokenC.target,
                token0AmountIn,
                token1AmountIn,
                lpToken
            );

            expect(estimation[2]).to.equal(false);

            // Setting up slippage at 2x 0.5%
            const minTokenAmountOut = BigInt(estimation[1]) * 9995n / 10000n;
            const maxTokenAmountIn = BigInt(estimation[0]) * 10005n / 10000n;

            const result = await tropicalZap.connect(carol).zapInTokenRebalancing(
                tokenA.target,
                tokenC.target,
                token0AmountIn,
                token1AmountIn,
                lpToken,
                maxTokenAmountIn,
                minTokenAmountOut,
                estimation[2],
            );

            await expect(result).to.emit(tropicalZap, "ZapInRebalancing").
                withArgs(tokenA.target, tokenC.target, lpToken, token0AmountIn.toString(), token1AmountIn.toString(), "2995503304234356879808", carol.address);

            console.info("Balance tokenA: " + ethers.formatUnits(String(await tokenA.balanceOf(tropicalZap.target)), 18));
            console.info("Balance WETH: " + ethers.formatUnits(String(await wrappedETH.balanceOf(tropicalZap.target)), 18));
            console.info("Balance tokenC: " + ethers.formatUnits(String(await tokenC.balanceOf(tropicalZap.target)), 18));
        });

        it("User completes zapOut with tokenA (pair tokenA/tokenC)", async function ()
        {
            // const { tropicalRouter, tokenA, tokenC, pairAC, bob, tropicalZap, wrappedETH } = await loadFixture(deployTropicalZap);

            const lpToken = pairAC.target;
            const tokenToReceive = tokenA.target;
            const lpTokenAmount = ethers.parseEther("1");

            const estimation = await tropicalZap.estimateZapOutSwap(lpToken, lpTokenAmount, tokenToReceive);
            expect(estimation[2]).to.equal(tokenC.target);

            // Setting up slippage at 0.5%
            const minTokenAmountOut = BigInt(estimation[1]) * 9995n / 10000n;

            const result = await tropicalZap.connect(carol).zapOutToken(lpToken, tokenToReceive, lpTokenAmount, minTokenAmountOut);

            await expect(result).to.emit(tropicalZap, "ZapOut").
                withArgs(lpToken, tokenToReceive, ethers.parseEther("1").toString(), ethers.parseEther("1.999586848572742784").toString(), carol.address);

            console.info("Balance tokenA: " + ethers.formatUnits(String(await tokenA.balanceOf(tropicalZap.target)), 18));
            console.info("Balance WETH: " + ethers.formatUnits(String(await wrappedETH.balanceOf(tropicalZap.target)), 18));
            console.info("Balance tokenC: " + ethers.formatUnits(String(await tokenC.balanceOf(tropicalZap.target)), 18));
        });

        it("User completes zapOut with ETH (pair ETH/tokenC)", async function ()
        {
            // const { tropicalRouter, tokenA, tokenC, pairAC, bob, tropicalZap, wrappedETH } = await loadFixture(deployTropicalZap);

            const lpToken = pairBC.target;
            const lpTokenAmount = ethers.parseEther("1");

            const estimation = await tropicalZap.estimateZapOutSwap(lpToken, lpTokenAmount, wrappedETH.target);
            expect(estimation[2]).to.equal(tokenC.target);

            // Setting up slippage at 0.5%
            const minTokenAmountOut = BigInt(estimation[1]) * 9995n / 10000n;

            const result = await tropicalZap.connect(carol).zapOutETH(lpToken, lpTokenAmount, minTokenAmountOut);

            await expect(result).to.emit(tropicalZap, "ZapOut").
                withArgs(lpToken, ZeroAddress, ethers.parseEther("1").toString(), ethers.parseEther("0.199890295552765397").toString(), carol.address);

            console.info("Balance tokenA: " + ethers.formatUnits(String(await tokenA.balanceOf(tropicalZap.target)), 18));
            console.info("Balance WETH: " + ethers.formatUnits(String(await wrappedETH.balanceOf(tropicalZap.target)), 18));
            console.info("Balance tokenC: " + ethers.formatUnits(String(await tokenC.balanceOf(tropicalZap.target)), 18));
        });

        it("Zap estimations fail if wrong tokens", async function ()
        {
            await expect(tropicalZap.estimateZapInSwap(wrappedETH.target, ethers.parseEther("1"), pairAC.target)).to.be.revertedWith("Zap: Wrong tokens");

            await expect(tropicalZap.estimateZapInRebalancingSwap(
                tokenA.target,
                wrappedETH.target,
                ethers.parseEther("1"),
                ethers.parseEther("1"),
                pairAC.target
            )).to.be.revertedWith("Zap: Wrong token1");

            await expect(tropicalZap.estimateZapInRebalancingSwap(
                wrappedETH.target,
                tokenA.target,
                ethers.parseEther("1"),
                ethers.parseEther("1"),
                pairAC.target
            )).to.be.revertedWith("Zap: Wrong token0");

            await expect(tropicalZap.estimateZapInRebalancingSwap(
                tokenA.target,
                tokenA.target,
                ethers.parseEther("1"),
                ethers.parseEther("1"),
                pairAC.target
            )).to.be.revertedWith("Zap: Same tokens");

            await expect(tropicalZap.estimateZapOutSwap(pairAC.target, ethers.parseEther("1"), wrappedETH.target)).to.be.revertedWith("Zap: Token not in LP");
        });

        it("Zap estimations work as expected", async function ()
        {
            // Verify estimations are the same regardless of the argument ordering
            const estimation0 = await tropicalZap.estimateZapInRebalancingSwap(
                tokenA.target,
                tokenC.target,
                ethers.parseEther("0.5"),
                ethers.parseEther("1"),
                pairAC.target
            );
            const estimation1 = await tropicalZap.estimateZapInRebalancingSwap(
                tokenC.target,
                tokenA.target,
                ethers.parseEther("1"),
                ethers.parseEther("0.5"),
                pairAC.target
            );

            expect(estimation0[0].toString()).to.equal(estimation1[0].toString());
            expect(estimation0[1].toString()).to.equal(estimation1[1].toString());
            expect(!estimation0[2]).to.equal(estimation1[2]);

            // Verify estimations are the same for zapIn and zapInRebalancing with 0 for one of the quantity
            const estimation2 = await tropicalZap.estimateZapInSwap(tokenA.target, ethers.parseEther("5"), pairAC.target);
            const estimation3 = await tropicalZap.estimateZapInRebalancingSwap(
                tokenA.target,
                tokenC.target,
                ethers.parseEther("5"),
                ethers.parseEther("0"),
                pairAC.target
            );

            expect(estimation2[0].toString()).to.equal(estimation3[0].toString());
            expect(estimation2[1].toString()).to.equal(estimation3[1].toString());
        });

        it("Cannot zap if wrong direction/tokens used", async function ()
        {
            await expect(tropicalZap.connect(carol).zapInToken(tokenA.target, ethers.parseEther("1"), pairBC.target, ethers.parseEther("0.51"))).to.be.revertedWith("Zap: Wrong tokens");
            await expect(tropicalZap.connect(carol).zapInETH(pairAC.target, ethers.parseEther("0.51"), { value: ethers.parseEther("0.51").toString() })).to.be.revertedWith("Zap: Wrong tokens");

            await expect(tropicalZap.connect(carol).zapOutToken(pairBC.target, tokenA.target, ethers.parseEther("0.51"), ethers.parseEther("0.51"))).to.be.revertedWith("Zap: Token not in LP");

            await expect(tropicalZap.connect(carol).zapOutETH(pairAC.target, ethers.parseEther("0.51"), ethers.parseEther("0.51"))).to.be.revertedWith("Zap: Token not in LP");

            await expect(tropicalZap.connect(carol).zapInTokenRebalancing(
                tokenA.target,
                tokenC.target,
                ethers.parseEther("1"),
                ethers.parseEther("1"),
                pairBC.target,
                ethers.parseEther("0.5"),
                ethers.parseEther("0.5"),
                true,
            )).to.be.revertedWith("Zap: Wrong token0");

            await expect(tropicalZap.connect(carol).zapInTokenRebalancing(
                tokenC.target,
                tokenA.target,
                ethers.parseEther("1"),
                ethers.parseEther("1"),
                pairBC.target,
                ethers.parseEther("0.5"),
                ethers.parseEther("0.5"),
                true,
            )).to.be.revertedWith("Zap: Wrong token1");

            await expect(tropicalZap.connect(carol).zapInTokenRebalancing(
                tokenC.target,
                tokenC.target,
                ethers.parseEther("1"),
                ethers.parseEther("1"),
                pairBC.target,
                ethers.parseEther("0.5"),
                ethers.parseEther("0.5"),
                true,
            )).to.be.revertedWith("Zap: Same tokens");

            await expect(tropicalZap.connect(carol).zapInETHRebalancing(
                tokenC.target,
                ethers.parseEther("1"),
                pairAB.target,
                ethers.parseEther("0.5"),
                ethers.parseEther("0.5"),
                true,
                { value: ethers.parseEther("0.1").toString() }
            )).to.be.revertedWith("Zap: Wrong token1");

            await expect(tropicalZap.connect(carol).zapInETHRebalancing(
                tokenA.target,
                ethers.parseEther("1"),
                pairAC.target,
                ethers.parseEther("0.5"),
                ethers.parseEther("0.5"),
                true,
                { value: ethers.parseEther("0.1").toString() }
            )).to.be.revertedWith("Zap: Wrong token0");

            const result = await wrappedETH.connect(david).deposit({ value: ethers.parseEther("1").toString() });
            await expect(result).to.emit(wrappedETH, "Deposit").withArgs(david.address, ethers.parseEther("1").toString());

            await expect(tropicalZap.connect(david).zapInETHRebalancing(
                wrappedETH.target,
                ethers.parseEther("1"),
                pairBC.target,
                ethers.parseEther("0.5"),
                ethers.parseEther("0.5"),
                false,
                { value: ethers.parseEther("0.1").toString() }
            )).to.be.revertedWith("Zap: Same tokens");

            //tokenC (token0) > ETH (token1) --> sell token1 (should be false)
            await expect(tropicalZap.connect(david).zapInETHRebalancing(
                tokenC.target,
                ethers.parseEther("0.05"),
                pairBC.target,
                ethers.parseEther("0.5"),
                ethers.parseEther("0.5"),
                true,
                { value: ethers.parseEther("0.0000000001").toString() }
            )).to.be.revertedWith("Zap: Wrong trade direction");

            //tokenC (token0) < ETH (token1) --> sell token0 (should be true)
            await expect(tropicalZap.connect(david).zapInETHRebalancing(
                tokenC.target,
                ethers.parseEther("0.0000000001"),
                pairBC.target,
                ethers.parseEther("0.5"),
                ethers.parseEther("0.5"),
                false,
                { value: ethers.parseEther("0.05").toString() }
            )).to.be.revertedWith("Zap: Wrong trade direction");

            //tokenA (token0) > tokenC (token1) --> sell token0 (should be true)
            await expect(tropicalZap.connect(david).zapInTokenRebalancing(
                tokenA.target,
                tokenC.target,
                ethers.parseEther("1"),
                ethers.parseEther("0"),
                pairAC.target,
                ethers.parseEther("0.5"),
                ethers.parseEther("0.5"),
                false,
            )).to.be.revertedWith("Zap: Wrong trade direction");

            //tokenA (token0) < tokenC (token1) --> sell token0 (should be true)
            await expect(tropicalZap.connect(david).zapInTokenRebalancing(
                tokenA.target,
                tokenC.target,
                ethers.parseEther("0"),
                ethers.parseEther("1"),
                pairAC.target,
                ethers.parseEther("0.5"),
                ethers.parseEther("0.5"),
                true,
            )).to.be.revertedWith("Zap: Wrong trade direction");
        });
    })
});
