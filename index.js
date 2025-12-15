const { program } = require('commander');
const path = require('path');
const { loadConfig } = require('./src/config'); 
const { processLore } = require('./src/process-lore');
const { downloadImages } = require('./src/download-img');

program
  .version('1.0.0')
  .description('Script para processar conteúdo e imagens a partir de arquivos Json exportados do World Anvil.');

async function runCommand(handler, sourcePath, outputKey, options) {
    try {
        const config = await loadConfig();
                        
        const finalOutput = path.join(config.outputFolder, outputKey);
        
        // passa dados para função do comando
        await handler(sourcePath, finalOutput, options);
        
    } catch (error) {
        console.error("Falha no comando:", error.message);
        process.exit(1);
    }
}


// Registra comando get-lore no commander
program
  .command('get-lore')
  .description('Lê arquivos JSON e converte seu conteúdo em arquivos Markdown.')
  .option('-s, --source <path>', 'A pasta contendo os arquivos JSON.', './data/lore')
  .action((options) => {    
    const pathSegments = options.source.split(path.sep);
    const outputKey = pathSegments[pathSegments.length - 1];
    runCommand(processLore, options.source, outputKey, options); 
  });

// Registra comando get-img no commander
program
  .command('get-img')
  .description('Lê arquivos JSON com URLs e faz download das imagens para uma pasta específica.')
  .option('-s, --source <path>', 'A pasta contendo os arquivos JSON com os URLs das imagens.', './data/assets')
  .option('-p, --prop <property>', 'A propriedade JSON a se utilizar como nome do arquivo destino.', 'filename')
  .action((options) => {    
    runCommand(downloadImages, options.source, 'img', options.prop);
  });

program.parse(process.argv);