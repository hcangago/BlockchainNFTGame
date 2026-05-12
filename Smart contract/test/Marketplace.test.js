const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("Marketplace", function () {
  async function deployFixture() {
    const [owner, vendedor, comprador, tercero] = await ethers.getSigners();
    const Cartas = await ethers.getContractFactory("Cartas");
    const cartas = await Cartas.deploy();
    const Marketplace = await ethers.getContractFactory("Marketplace");
    const marketplace = await Marketplace.deploy(cartas.target);

    // Mintear cartas para las pruebas
    await cartas.ganarCarta(vendedor.address); // token 0
    await cartas.ganarCarta(vendedor.address); // token 1
    await cartas.ganarCarta(comprador.address); // token 2
    await cartas.ganarCarta(comprador.address); // token 3
    await cartas.ganarCarta(tercero.address);   // token 4

    return { cartas, marketplace, owner, vendedor, comprador, tercero };
  }

  // ════════════════════════════════════════════════════════
  // ██ DESPLIEGUE
  // ════════════════════════════════════════════════════════

  describe("Despliegue", function () {
    it("Debe vincular el contrato NFT correctamente", async function () {
      const { cartas, marketplace } = await loadFixture(deployFixture);
      expect(await marketplace.nftContrato()).to.equal(cartas.target);
    });

    it("Debe rechazar dirección cero como contrato NFT", async function () {
      const Marketplace = await ethers.getContractFactory("Marketplace");
      await expect(Marketplace.deploy(ethers.ZeroAddress)).to.be.revertedWith("Direccion invalida");
    });
  });

  // ════════════════════════════════════════════════════════
  // ██ VENTA DIRECTA
  // ════════════════════════════════════════════════════════

  describe("Venta Directa", function () {
    it("Debe permitir listar un NFT con precio válido", async function () {
      const { cartas, marketplace, vendedor } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await expect(marketplace.connect(vendedor).listarNFT(0, ethers.parseEther("0.1")))
        .to.emit(marketplace, "NFTListado");
    });

    it("No debe permitir listar sin aprobación", async function () {
      const { marketplace, vendedor } = await loadFixture(deployFixture);
      await expect(marketplace.connect(vendedor).listarNFT(0, ethers.parseEther("0.1")))
        .to.be.revertedWith("El marketplace no tiene aprobacion");
    });

    it("No debe permitir listar con precio 0", async function () {
      const { cartas, marketplace, vendedor } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await expect(marketplace.connect(vendedor).listarNFT(0, 0))
        .to.be.revertedWith("El precio debe ser mayor a 0");
    });

    it("No debe permitir listar un NFT ajeno", async function () {
      const { cartas, marketplace, comprador } = await loadFixture(deployFixture);
      await expect(marketplace.connect(comprador).listarNFT(0, ethers.parseEther("0.1")))
        .to.be.revertedWith("No eres el propietario");
    });

    it("No debe permitir listar un NFT ya listado", async function () {
      const { cartas, marketplace, vendedor } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).listarNFT(0, ethers.parseEther("0.1"));
      await expect(marketplace.connect(vendedor).listarNFT(0, ethers.parseEther("0.2")))
        .to.be.revertedWith("Ya esta listado");
    });

    it("Debe permitir cancelar un listado propio", async function () {
      const { cartas, marketplace, vendedor } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).listarNFT(0, ethers.parseEther("0.1"));
      await expect(marketplace.connect(vendedor).cancelarListado(0))
        .to.emit(marketplace, "ListadoCancelado");
    });

    it("No debe permitir cancelar un listado ajeno", async function () {
      const { cartas, marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).listarNFT(0, ethers.parseEther("0.1"));
      await expect(marketplace.connect(comprador).cancelarListado(0))
        .to.be.revertedWith("No eres el vendedor");
    });

    it("Debe permitir comprar un NFT listado", async function () {
      const { cartas, marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).listarNFT(0, ethers.parseEther("0.1"));
      await marketplace.connect(comprador).comprarNFT(0, { value: ethers.parseEther("0.1") });
      expect(await cartas.ownerOf(0)).to.equal(comprador.address);
    });

    it("Debe devolver el exceso de ETH al comprador", async function () {
      const { cartas, marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).listarNFT(0, ethers.parseEther("0.1"));
      // Envía 0.2 ETH por un NFT de 0.1 ETH
      await expect(
        marketplace.connect(comprador).comprarNFT(0, { value: ethers.parseEther("0.2") })
      ).to.not.be.reverted;
    });

    it("No debe permitir comprar tu propio NFT", async function () {
      const { cartas, marketplace, vendedor } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).listarNFT(0, ethers.parseEther("0.1"));
      await expect(marketplace.connect(vendedor).comprarNFT(0, { value: ethers.parseEther("0.1") }))
        .to.be.revertedWith("No puedes comprar tu propio NFT");
    });

    it("No debe permitir comprar con ETH insuficiente", async function () {
      const { cartas, marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).listarNFT(0, ethers.parseEther("0.1"));
      await expect(marketplace.connect(comprador).comprarNFT(0, { value: ethers.parseEther("0.01") }))
        .to.be.revertedWith("ETH insuficiente");
    });

    it("Debe actualizar correctamente el total de listados", async function () {
      const { cartas, marketplace, vendedor } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await cartas.connect(vendedor).approve(marketplace.target, 1);
      await marketplace.connect(vendedor).listarNFT(0, ethers.parseEther("0.1"));
      await marketplace.connect(vendedor).listarNFT(1, ethers.parseEther("0.2"));
      expect(await marketplace.totalListados()).to.equal(2);
    });
  });

  // ════════════════════════════════════════════════════════
  // ██ OFERTAS CON ETH
  // ════════════════════════════════════════════════════════

  describe("Ofertas ETH", function () {
    it("Debe permitir crear una oferta con ETH", async function () {
      const { marketplace, comprador } = await loadFixture(deployFixture);
      await expect(marketplace.connect(comprador).crearOfertaETH(0, { value: ethers.parseEther("0.2") }))
        .to.emit(marketplace, "OfertaETHCreada");
    });

    it("No debe permitir ofertar sin ETH", async function () {
      const { marketplace, comprador } = await loadFixture(deployFixture);
      await expect(marketplace.connect(comprador).crearOfertaETH(0, { value: 0 }))
        .to.be.revertedWith("Debes enviar ETH");
    });

    it("No debe permitir ofertar por tu propio NFT", async function () {
      const { marketplace, vendedor } = await loadFixture(deployFixture);
      await expect(marketplace.connect(vendedor).crearOfertaETH(0, { value: ethers.parseEther("0.1") }))
        .to.be.revertedWith("No puedes ofertar por tu propio NFT");
    });

    it("El propietario debe poder aceptar una oferta ETH", async function () {
      const { cartas, marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await marketplace.connect(comprador).crearOfertaETH(0, { value: ethers.parseEther("0.2") });
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).aceptarOfertaETH(0);
      expect(await cartas.ownerOf(0)).to.equal(comprador.address);
    });

    it("El oferente debe poder cancelar su oferta y recuperar ETH", async function () {
      const { marketplace, comprador } = await loadFixture(deployFixture);
      await marketplace.connect(comprador).crearOfertaETH(0, { value: ethers.parseEther("0.2") });
      await expect(marketplace.connect(comprador).cancelarOfertaETH(0))
        .to.emit(marketplace, "OfertaETHCancelada");
    });

    it("El propietario debe poder rechazar una oferta", async function () {
      const { marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await marketplace.connect(comprador).crearOfertaETH(0, { value: ethers.parseEther("0.2") });
      await expect(marketplace.connect(vendedor).rechazarOfertaETH(0))
        .to.emit(marketplace, "OfertaETHRechazada");
    });

    it("Debe cancelar ofertas pendientes al vender un NFT", async function () {
      const { cartas, marketplace, vendedor, comprador, tercero } = await loadFixture(deployFixture);
      // Crear oferta del tercero
      await marketplace.connect(tercero).crearOfertaETH(0, { value: ethers.parseEther("0.1") });
      // Listar y vender al comprador
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).listarNFT(0, ethers.parseEther("0.05"));
      await marketplace.connect(comprador).comprarNFT(0, { value: ethers.parseEther("0.05") });
      // La oferta del tercero debe estar inactiva
      const oferta = await marketplace.obtenerOfertaETH(0);
      expect(oferta.activa).to.equal(false);
    });
  });

  // ════════════════════════════════════════════════════════
  // ██ OFERTAS DE INTERCAMBIO
  // ════════════════════════════════════════════════════════

  describe("Ofertas de Intercambio", function () {
    it("Debe permitir crear una oferta de intercambio", async function () {
      const { marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await expect(marketplace.connect(comprador).crearOfertaIntercambio([2], [0], vendedor.address))
        .to.emit(marketplace, "OfertaIntercambioCreada");
    });

    it("No debe permitir intercambiar contigo mismo", async function () {
      const { marketplace, vendedor } = await loadFixture(deployFixture);
      await expect(marketplace.connect(vendedor).crearOfertaIntercambio([0], [1], vendedor.address))
        .to.be.revertedWith("No puedes intercambiar contigo mismo");
    });

    it("Debe ejecutar el swap atómico al aceptar", async function () {
      const { cartas, marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await marketplace.connect(comprador).crearOfertaIntercambio([2], [0], vendedor.address);
      // Aprobar ambas partes
      await cartas.connect(comprador).approve(marketplace.target, 2);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).aceptarOfertaIntercambio(0);
      // Verificar que las cartas cambiaron de mano
      expect(await cartas.ownerOf(0)).to.equal(comprador.address);
      expect(await cartas.ownerOf(2)).to.equal(vendedor.address);
    });

    it("El oferente debe poder cancelar su oferta de intercambio", async function () {
      const { marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await marketplace.connect(comprador).crearOfertaIntercambio([2], [0], vendedor.address);
      await expect(marketplace.connect(comprador).cancelarOfertaIntercambio(0))
        .to.emit(marketplace, "OfertaIntercambioCancelada");
    });

    it("El destinatario debe poder rechazar la oferta de intercambio", async function () {
      const { marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await marketplace.connect(comprador).crearOfertaIntercambio([2], [0], vendedor.address);
      await expect(marketplace.connect(vendedor).rechazarOfertaIntercambio(0))
        .to.emit(marketplace, "OfertaIntercambioRechazada");
    });
  });

  // ════════════════════════════════════════════════════════
  // ██ SUBASTAS
  // ════════════════════════════════════════════════════════

  describe("Subastas", function () {
    it("Debe permitir crear una subasta", async function () {
      const { cartas, marketplace, vendedor } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await expect(marketplace.connect(vendedor).crearSubasta(0, ethers.parseEther("0.05"), 1))
        .to.emit(marketplace, "SubastaCreada");
    });

    it("No debe permitir subastas con duración inválida", async function () {
      const { cartas, marketplace, vendedor } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await expect(marketplace.connect(vendedor).crearSubasta(0, 0, 0))
        .to.be.revertedWith("Duracion: entre 1 y 168 horas");
      await expect(marketplace.connect(vendedor).crearSubasta(0, 0, 200))
        .to.be.revertedWith("Duracion: entre 1 y 168 horas");
    });

    it("No debe permitir subastar un NFT ya listado para venta", async function () {
      const { cartas, marketplace, vendedor } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).listarNFT(0, ethers.parseEther("0.1"));
      await expect(marketplace.connect(vendedor).crearSubasta(0, 0, 1))
        .to.be.revertedWith("El token esta listado para venta");
    });

    it("Debe permitir pujar en una subasta activa", async function () {
      const { cartas, marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).crearSubasta(0, ethers.parseEther("0.05"), 1);
      await expect(marketplace.connect(comprador).pujar(0, { value: ethers.parseEther("0.05") }))
        .to.emit(marketplace, "PujaRealizada");
    });

    it("No debe permitir pujar por debajo del precio mínimo", async function () {
      const { cartas, marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).crearSubasta(0, ethers.parseEther("0.05"), 1);
      await expect(marketplace.connect(comprador).pujar(0, { value: ethers.parseEther("0.01") }))
        .to.be.revertedWith("Puja inferior al precio minimo");
    });

    it("No debe permitir pujar en tu propia subasta", async function () {
      const { cartas, marketplace, vendedor } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).crearSubasta(0, ethers.parseEther("0.05"), 1);
      await expect(marketplace.connect(vendedor).pujar(0, { value: ethers.parseEther("0.1") }))
        .to.be.revertedWith("No puedes pujar en tu propia subasta");
    });

    it("Debe extender la subasta si se puja en los últimos 5 minutos (anti-snipe)", async function () {
      const { cartas, marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).crearSubasta(0, 0, 1); // 1 hora
      // Avanzar hasta que queden 3 minutos
      await time.increase(3420); // 57 minutos
      await marketplace.connect(comprador).pujar(0, { value: ethers.parseEther("0.1") });
      const subasta = await marketplace.obtenerSubasta(0);
      const ahora = BigInt(await time.latest());
      const restante = subasta.fin - ahora;
      // Debe haberse extendido: restante ~ 5 minutos (300s)
      expect(restante).to.be.gte(290);
    });

    it("Debe finalizar la subasta y transferir NFT al ganador", async function () {
      const { cartas, marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).crearSubasta(0, 0, 1);
      await marketplace.connect(comprador).pujar(0, { value: ethers.parseEther("0.1") });
      await time.increase(3601); // Pasar 1 hora
      await marketplace.finalizarSubasta(0);
      expect(await cartas.ownerOf(0)).to.equal(comprador.address);
    });

    it("Debe finalizar sin ganador si no hay pujas", async function () {
      const { cartas, marketplace, vendedor } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).crearSubasta(0, ethers.parseEther("0.05"), 1);
      await time.increase(3601);
      await expect(marketplace.finalizarSubasta(0)).to.not.be.reverted;
      // El NFT sigue con el vendedor
      expect(await cartas.ownerOf(0)).to.equal(vendedor.address);
    });

    it("Debe permitir cancelar una subasta sin pujas", async function () {
      const { cartas, marketplace, vendedor } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).crearSubasta(0, 0, 1);
      await expect(marketplace.connect(vendedor).cancelarSubasta(0))
        .to.emit(marketplace, "SubastaCancelada");
    });

    it("No debe permitir cancelar una subasta con pujas", async function () {
      const { cartas, marketplace, vendedor, comprador } = await loadFixture(deployFixture);
      await cartas.connect(vendedor).approve(marketplace.target, 0);
      await marketplace.connect(vendedor).crearSubasta(0, 0, 1);
      await marketplace.connect(comprador).pujar(0, { value: ethers.parseEther("0.1") });
      await expect(marketplace.connect(vendedor).cancelarSubasta(0))
        .to.be.revertedWith("No se puede cancelar con pujas activas");
    });
  });
});
