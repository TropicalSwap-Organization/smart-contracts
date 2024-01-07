import { ethers } from "hardhat";
import config from "../config";

async function main() {
    //deploy MockERC20s for testing 
    const [deployer] = await ethers.getSigners();
    const AMOUNT = 3;
    
    const toAddress = "";
    for (let i = 1; i <= AMOUNT; i++) {
        const mockERC20 = await ethers.deployContract("MockERC20", [`Token${i}`, `T${i}`, ethers.parseEther("2000000")], {
            gasLimit: "0x1000000",
        });
        await mockERC20.waitForDeployment();
        const tokenName = await mockERC20.name();

        console.log(
            `${tokenName} deployed to ${mockERC20.target}`
        );

        await mockERC20.transfer(toAddress, ethers.parseEther("1000000"), {
            gasLimit: "0x1000000",
        });
    }

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) =>
{
    console.error(error);
    process.exitCode = 1;
});