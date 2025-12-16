const { program } = require('commander');
const path = require('path');
const { loadConfig } = require('./src/config'); 
const { getLoreData } = require('./src/lore-extractor');
const { downloadImages } = require('./src/download-img');
const { syncImageRegistry } = require('./src/utils/image-registry.js');

program
  .version('1.0.0')
  .description('Script para processar conteúdo e imagens a partir de arquivos Json exportados do World Anvil.');

async function runCommand(handler, sourcePath, outputKey, options) {
    try {
        const config = await loadConfig();
                        
        const finalOutput = path.join(config.outputFolder, outputKey);
        let finalPath;
        if(!sourcePath){
          switch (handler.name) {
            case "downloadImages":
              finalPath = config.imageSourceFolder;
              break;
            case "getLoreData":
              finalPath = config.loreSourceFolder;
              break;
            case "syncImageRegistry":
              finalPath = config.imageSourceFolder;
              break;
            default:
              throw "Source não foi definido";
          }
        }
        // passa dados para função do comando
        await handler(finalPath, finalOutput, options);
        
    } catch (error) {
        console.error("Falha no comando:", error.message);
        process.exit(1);
    }
}


// Registra comando get-lore no commander
program
  .command('get-lore')
  .description('Lê arquivos JSON e converte seu conteúdo em arquivos Markdown.')
  .option('-s, --source <path>', 'A pasta contendo os arquivos JSON.', false)
  .action((options) => {    
    const pathSegments = options.source.split(path.sep);
    const outputKey = pathSegments[pathSegments.length - 1];
    runCommand(getLoreData, options.source, 'lore', options);
  });

// Registra comando get-img no commander
program
  .command('get-img')
  .description('Lê arquivos JSON com URLs e faz download das imagens para uma pasta específica.')
  .option('-s, --source <path>', 'A pasta contendo os arquivos JSON com os URLs das imagens.', false)
  .option('-p, --prop <property>', 'A propriedade JSON a se utilizar como nome do arquivo destino.', 'filename')
  .action((options) => {    
    runCommand(downloadImages, options.source, 'img', options.prop);
  });

// Registra comando get-img no commander
program
  .command('sync-img')
  .description('Lê arquivos JSON com URLs atualiza o registry das imagens já baixadas.')
  .option('-s, --source <path>', 'A pasta contendo os arquivos JSON com os URLs das imagens.', false)  
  .action((options) => {    
    runCommand(syncImageRegistry, options.source, '', './output/img');
  });

program.parse(process.argv);