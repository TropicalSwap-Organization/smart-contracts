import { ethers } from "hardhat";

async function main() {
  //get signer
  const [deployer] = await ethers.getSigners();

  const factory = await ethers.deployContract("TropicalFactory", [deployer.address], {
    gasLimit: "0x1000000",
    });

  await factory.waitForDeployment();

  console.log(
    `factory deployed to ${factory.target} with feeToSetter ${await factory.feeToSetter()}`
  );

  console.log("factory init code hash: ", await factory.INIT_CODE_PAIR_HASH());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
