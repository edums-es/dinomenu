const { PrintService, listPrinters } = require("./src/printService");

async function main() {
  if (process.argv.includes("--list-printers")) {
    const printers = await listPrinters();
    console.log(printers.join("\n") || "Nenhuma impressora encontrada.");
    return;
  }

  const service = new PrintService();
  service.on("state", (state) => {
    console.log(`[EG Print] ${state.status}`);
    if (state.lastError) console.error(`[EG Print] ${state.lastError}`);
  });
  service.on("printed", (job) => {
    console.log(`[EG Print] pedido #${job.order_number || job.id} impresso`);
  });

  await service.start();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
