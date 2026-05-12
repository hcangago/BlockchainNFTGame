const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("Cartas", function () {
  // ── Fixture: despliega el contrato una vez y reutiliza el estado ──
  async function deployCartasFixture() {
    const [owner, jugador1, jugador2] = await ethers.getSigners();
    const Cartas = await ethers.getContractFactory("Cartas");
    const cartas = await Cartas.deploy();
    return { cartas, owner, jugador1, jugador2 };
  }

  // ════════════════════════════════════════════════════════
  // ██ DESPLIEGUE
  // ════════════════════════════════════════════════════════

  describe("Despliegue", function () {
    it("Debe asignar el nombre correcto a la colección", async function () {
      const { cartas } = await loadFixture(deployCartasFixture);
      expect(await cartas.name()).to.equal("EtherBeasts");
    });

    it("Debe asignar el símbolo correcto", async function () {
      const { cartas } = await loadFixture(deployCartasFixture);
      expect(await cartas.symbol()).to.equal("EBST");
    });

    it("Debe asignar al deployer como owner", async function () {
      const { cartas, owner } = await loadFixture(deployCartasFixture);
      expect(await cartas.owner()).to.equal(owner.address);
    });

    it("Debe inicializar el contador de tokens en 0", async function () {
      const { cartas } = await loadFixture(deployCartasFixture);
      expect(await cartas.nextTokenId()).to.equal(0);
    });

    it("El suministro total inicial debe ser 0", async function () {
      const { cartas } = await loadFixture(deployCartasFixture);
      expect(await cartas.totalSupply()).to.equal(0);
    });
  });

  // ════════════════════════════════════════════════════════
  // ██ MINTEO DE CARTAS
  // ════════════════════════════════════════════════════════

  describe("Minteo (ganarCarta)", function () {
    it("Debe crear una carta y asignarla al jugador", async function () {
      const { cartas, jugador1 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      expect(await cartas.ownerOf(0)).to.equal(jugador1.address);
    });

    it("Debe incrementar el suministro total", async function () {
      const { cartas, jugador1 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      expect(await cartas.totalSupply()).to.equal(1);
    });

    it("Debe incrementar el contador de tokens", async function () {
      const { cartas, jugador1 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      expect(await cartas.nextTokenId()).to.equal(1);
    });

    it("Debe asignar una criatura entre 1 y 16", async function () {
      const { cartas, jugador1 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      const bicho = await cartas.bichoAsignado(0);
      expect(bicho).to.be.gte(1);
      expect(bicho).to.be.lte(16);
    });

    it("Debe permitir mintear múltiples cartas al mismo jugador", async function () {
      const { cartas, jugador1 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      await cartas.ganarCarta(jugador1.address);
      await cartas.ganarCarta(jugador1.address);
      expect(await cartas.balanceOf(jugador1.address)).to.equal(3);
    });

    it("Debe permitir mintear cartas a distintos jugadores", async function () {
      const { cartas, jugador1, jugador2 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      await cartas.ganarCarta(jugador2.address);
      expect(await cartas.ownerOf(0)).to.equal(jugador1.address);
      expect(await cartas.ownerOf(1)).to.equal(jugador2.address);
    });

    it("Cualquier cuenta puede llamar a ganarCarta (no requiere ser owner)", async function () {
      const { cartas, jugador1 } = await loadFixture(deployCartasFixture);
      await cartas.connect(jugador1).ganarCarta(jugador1.address);
      expect(await cartas.ownerOf(0)).to.equal(jugador1.address);
    });
  });

  // ════════════════════════════════════════════════════════
  // ██ TOKEN URI
  // ════════════════════════════════════════════════════════

  describe("Token URI", function () {
    it("Debe devolver la URI correcta con el ID de criatura", async function () {
      const { cartas, jugador1 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      const bicho = await cartas.bichoAsignado(0);
      const expectedURI = `ipfs://bafybeif7xavsu6hjpt7aabpumtoy44xquzmgou2fkoldwvmop3ik32jbcq/${bicho}.json`;
      expect(await cartas.tokenURI(0)).to.equal(expectedURI);
    });

    it("Debe revertir si se consulta un token inexistente", async function () {
      const { cartas } = await loadFixture(deployCartasFixture);
      await expect(cartas.tokenURI(999)).to.be.reverted;
    });
  });

  // ════════════════════════════════════════════════════════
  // ██ CAMBIO DE BASE URI
  // ════════════════════════════════════════════════════════

  describe("setBaseURI", function () {
    it("El owner debe poder cambiar la URI base", async function () {
      const { cartas, owner, jugador1 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      const bicho = await cartas.bichoAsignado(0);

      await cartas.connect(owner).setBaseURI("ipfs://nuevaCID/");
      expect(await cartas.tokenURI(0)).to.equal(`ipfs://nuevaCID/${bicho}.json`);
    });

    it("Un usuario no-owner no debe poder cambiar la URI base", async function () {
      const { cartas, jugador1 } = await loadFixture(deployCartasFixture);
      await expect(
        cartas.connect(jugador1).setBaseURI("ipfs://malicioso/")
      ).to.be.reverted;
    });
  });

  // ════════════════════════════════════════════════════════
  // ██ QUEMA DE CARTAS
  // ════════════════════════════════════════════════════════

  describe("Quema (quemarCarta)", function () {
    it("El propietario debe poder quemar su carta", async function () {
      const { cartas, jugador1 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      await cartas.connect(jugador1).quemarCarta(0);
      expect(await cartas.totalSupply()).to.equal(0);
    });

    it("Debe eliminar la asignación de criatura al quemar", async function () {
      const { cartas, jugador1 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      await cartas.connect(jugador1).quemarCarta(0);
      expect(await cartas.bichoAsignado(0)).to.equal(0);
    });

    it("Un usuario no propietario no debe poder quemar la carta", async function () {
      const { cartas, jugador1, jugador2 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      await expect(
        cartas.connect(jugador2).quemarCarta(0)
      ).to.be.revertedWith("Solo el propietario puede quemar esta carta");
    });

    it("Debe revertir si se consulta el propietario de una carta quemada", async function () {
      const { cartas, jugador1 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      await cartas.connect(jugador1).quemarCarta(0);
      await expect(cartas.ownerOf(0)).to.be.reverted;
    });
  });

  // ════════════════════════════════════════════════════════
  // ██ FUNCIONES ERC-721 ESTÁNDAR
  // ════════════════════════════════════════════════════════

  describe("Funciones ERC-721 heredadas", function () {
    it("Debe permitir transferir una carta entre usuarios", async function () {
      const { cartas, jugador1, jugador2 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      await cartas.connect(jugador1).transferFrom(jugador1.address, jugador2.address, 0);
      expect(await cartas.ownerOf(0)).to.equal(jugador2.address);
    });

    it("Debe permitir aprobar a un operador para un token", async function () {
      const { cartas, jugador1, jugador2 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      await cartas.connect(jugador1).approve(jugador2.address, 0);
      expect(await cartas.getApproved(0)).to.equal(jugador2.address);
    });

    it("Un operador aprobado debe poder transferir el token", async function () {
      const { cartas, jugador1, jugador2 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      await cartas.connect(jugador1).approve(jugador2.address, 0);
      await cartas.connect(jugador2).transferFrom(jugador1.address, jugador2.address, 0);
      expect(await cartas.ownerOf(0)).to.equal(jugador2.address);
    });

    it("tokenOfOwnerByIndex debe devolver los tokens del propietario", async function () {
      const { cartas, jugador1 } = await loadFixture(deployCartasFixture);
      await cartas.ganarCarta(jugador1.address);
      await cartas.ganarCarta(jugador1.address);
      expect(await cartas.tokenOfOwnerByIndex(jugador1.address, 0)).to.equal(0);
      expect(await cartas.tokenOfOwnerByIndex(jugador1.address, 1)).to.equal(1);
    });
  });
});
