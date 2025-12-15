const fs = require('fs/promises');
const path = require('path');
const { transformContentToMarkdown } = require('./utils/transform-content');

// Constantes
const LORE_OUTPUT_ROOT = path.join(process.cwd(), 'lore'); 
const IMAGES_ROOT = path.join(process.cwd(), 'imgs'); 
const DEFAULT_FALLBACK_FOLDER = '_uncategorized'; 
const COVER_URL_REGEX = /.*\/(.*?\.jpg)/; // Captura o nome do arquivo JPG no final da URL

/**
 * Mapeia os dados do JSON, transforma o conteúdo e escreve o arquivo Markdown final.
 * @param {Object} data O objeto JSON de um artigo (fullContent).
 * @param {string} entityClass O nome da classe da entidade (e.g., 'Article', 'Person').
 */
async function processLoreArticle(data, entityClass) {
    if (!data || !data.id || !data.title || !data.content) {
        console.warn(`  - AVISO: Dados incompletos para processar artigo. Pulando.`);
        return;
    }

    const { id, title, content, cover } = data;

    // 1. --- Determinação de Caminhos ---
    // Subpasta será a entityClass, conforme revisado.
    const subfolder = entityClass; 
    
    // Caminho completo da subpasta: ./lore/Article/
    const outputFolder = path.join(LORE_OUTPUT_ROOT, subfolder);
    
    // Nome do arquivo: ID_COMPLETO.md
    const outputFilename = `${id}.md`; 
    const outputFilePath = path.join(outputFolder, outputFilename);

    // 2. --- Processamento da Imagem de Capa Local ---
    let imageReference = '';
    if (cover && cover.url) {
        const match = cover.url.match(COVER_URL_REGEX);
        const coverFileName = match ? match[1] : null;

        if (coverFileName) {
            // Caminho relativo para a imagem dentro do Markdown:
            // O arquivo MD está em ./lore/Article/[ID].md
            // O arquivo IMG está em ./imgs/[FILE].jpg
            // Caminho: ../../imgs/[FILE].jpg
            const relativeImgPath = path.join('..', '..', 'imgs', coverFileName).replace(/\\/g, '/');
            
            // Adiciona a referência Markdown (alt text é o título)
            imageReference = `![${title}](${relativeImgPath})\n\n`;
        }
    }

    // 3. --- Transformação do Conteúdo ---
    const markdownContent = transformContentToMarkdown(content);

    // 4. --- Montagem do Arquivo ---
    const finalContent = `${imageReference}# ${title}\n\n${markdownContent}`;

    // 5. --- I/O de Arquivo ---
    try {
        // Cria a pasta (recursivamente) se não existir
        await fs.mkdir(outputFolder, { recursive: true });
        
        // Escreve o arquivo Markdown
        await fs.writeFile(outputFilePath, finalContent, 'utf8');

        console.log(`  - SUCESSO: Artigo '${title}' salvo em: ${subfolder}/${outputFilename}`);
    } catch (error) {
        console.error(`  - ERRO: Falha ao escrever o arquivo ${outputFilePath}: ${error.message}`);
    }
}


/**
 * Função principal que lê todos os JSONs de uma pasta e processa os artigos.
 * @param {string} sourceDir O diretório contendo os JSONs.
 */
async function getLoreData(sourceDir) {
    console.log(`\nIniciando extração de Lore de: ${sourceDir}`);
    console.log(`Diretório de saída: ${LORE_OUTPUT_ROOT}`);
    
    try {
        // 1. Leitura de arquivos JSON (pode ser otimizada para ser concorrente, como no download de imagens)
        const entries = await fs.readdir(sourceDir, { withFileTypes: true });
        const jsonFiles = entries.filter(d => d.isFile() && d.name.endsWith('.json'));

        console.log(`Total de arquivos JSON encontrados: ${jsonFiles.length}`);

        // Usaremos Promise.all para processar arquivos JSON concorrentemente
        const processingPromises = jsonFiles.map(async (entry) => {
            const filePath = path.join(sourceDir, entry.name);
            let rawContent;
            
            try {
                rawContent = await fs.readFile(filePath, 'utf8');
                const data = JSON.parse(rawContent);

                // O campo 'fullContent' é onde os dados residem no seu exemplo
                const fullContent = data.fullContent;
                if (!fullContent) return; 

                const entityClass = fullContent.entityClass || DEFAULT_FALLBACK_FOLDER;
                
                // Por enquanto, processamos apenas 'Article' com a lógica específica.
                if (entityClass === 'Article') {
                    await processLoreArticle(fullContent, entityClass);
                } else {
                    // Placeholder para outras classes que serão adicionadas depois
                    console.log(`  - PULO: Entidade '${entityClass}' (ID: ${fullContent.id}) requer lógica de extração não implementada.`);
                }
            } catch (error) {
                console.error(`  - ERRO FATAL ao processar arquivo ${entry.name}: ${error.message}`);
            }
        });

        await Promise.all(processingPromises);

        console.log('\nExtração de Lore concluída.');

    } catch (error) {
        console.error(`\nErro geral ao executar getLoreData:`, error.message);
        throw error;
    }
}

module.exports = {
    getLoreData,
    processLoreArticle // Exportado para permitir testes diretos
};