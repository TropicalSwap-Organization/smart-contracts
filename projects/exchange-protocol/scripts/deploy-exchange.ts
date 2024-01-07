import { ethers, network } from "hardhat";
import config from "../config";

async function main()
{
  const [deployer] = await ethers.getSigners();

  const factoryAddress = "";
  let wrappedMantle;

  if (network.name === "mantleTestnet")
  {
    wrappedMantle = await ethers.getContractAt("WMANTLE", config.WMANTLE.mantleTestnet);
  }
  else if (network.name === "mantleMainnet")
  {
    wrappedMantle = await ethers.getContractAt("WMANTLE", config.WMANTLE.mantleMainnet);
  }
  else
  {
    wrappedMantle = await ethers.deployContract("WMANTLE", {
      gasLimit: "0x1000000",
    });

    await wrappedMantle.waitForDeployment();
    console.log(
      `wrappedMantle deployed to ${wrappedMantle.target}`
    );
  }


  const tropicalRouter = await ethers.deployContract("TropicalRouter", [factoryAddress, wrappedMantle.target], {
    gasLimit: "0x1000000",
  });

  await tropicalRouter.waitForDeployment();

  console.log(
    `router deployed to ${tropicalRouter.target}`
  );

  const tropicalZap = await ethers.deployContract("TropicalZapV1", [wrappedMantle.target,
  tropicalRouter.target, 50], {
    gasLimit: "0x1000000",
  });

  await tropicalZap.waitForDeployment();

  console.log(
    `zap deployed to ${tropicalZap.target}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) =>
{
  console.error(error);
  process.exitCode = 1;
});
