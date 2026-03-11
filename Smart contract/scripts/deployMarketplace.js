const hre = require("hardhat");

async function main() {
    const CARTAS_ADDRESS = "0x4441517277Abfd4C6D0a8929b214EEdB6f4680AB";

    const Marketplace = await hre.ethers.getContractFactory("Marketplace");

    console.log("Desplegando Marketplace...");
    const marketplace = await Marketplace.deploy(CARTAS_ADDRESS);

    await marketplace.waitForDeployment();

    console.log("¡Éxito! Marketplace desplegado.");
    console.log("Dirección del Marketplace:", marketplace.target);
    console.log("Vinculado al contrato Cartas:", CARTAS_ADDRESS);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
