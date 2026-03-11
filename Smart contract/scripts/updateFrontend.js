const fs = require("fs");
const path = require("path");

async function main() {
    // Directorio del frontend
    const frontendSrc = path.resolve(__dirname, "..", "..", "frontend", "src");

    // Archivos a sincronizar: [origen en artifacts, nombre destino]
    const archivos = [
        {
            origen: path.resolve(__dirname, "..", "artifacts/contracts/Cartas.sol/Cartas.json"),
            destino: path.join(frontendSrc, "Cartas.json"),
            nombre: "Cartas"
        },
        {
            origen: path.resolve(__dirname, "..", "artifacts/contracts/Marketplace.sol/Marketplace.json"),
            destino: path.join(frontendSrc, "Marketplace.json"),
            nombre: "Marketplace"
        }
    ];

    let exitos = 0;
    for (const archivo of archivos) {
        if (!fs.existsSync(archivo.origen)) {
            console.log(`⚠️  ${archivo.nombre}.json no encontrado en artifacts. ¿Has compilado?`);
            continue;
        }

        const contenido = fs.readFileSync(archivo.origen, "utf8");
        fs.writeFileSync(archivo.destino, contenido);
        console.log(`✅ ${archivo.nombre}.json actualizado en src/`);
        exitos++;
    }

    if (exitos === 0) {
        console.log("❌ No se actualizó ningún archivo. ¡Compila primero!");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });