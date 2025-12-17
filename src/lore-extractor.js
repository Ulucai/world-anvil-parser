const fs = require('fs/promises');
const path = require('path');
const { transformContentToMarkdown, parseMetadataToFrontmatter } = require('./utils/transform-content');
const { readAllJsons } = require('./utils/json-utils.js');

// --- CONFIGURAÇÃO ---
const MAX_CONCURRENT_PROCESSING = 5; // Limite de concorrência para processamento e escrita
const DEFAULT_FALLBACK_FOLDER = '_uncategorized'; 
const COVER_URL_REGEX = /.*\/(.*?\.jpg)/; // Regex para extrair o nome do arquivo da URL

/**
 * Gera um nome de arquivo de log único baseado no timestamp.
 */
function generateUniqueLogName() {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-` +
                      `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    return `lore_extraction_log_${timestamp}.txt`;
}

/**
 * Mapeia os dados do JSON, transforma o conteúdo e escreve o arquivo Markdown final.
 * * @param {Object} data O objeto JSON de um artigo (fullContent).
 * @param {string} entityClass O nome da classe da entidade.
 * @param {string} loreBaseOutputFolder O caminho completo de saída para a pasta 'lore' (ex: /output/data/lore).
 */
async function processLoreArticle(data, entityClass, loreBaseOutputFolder) {
    const { id, title, content, cover, slug } = data;

    if (!id || !title || !content) {
        return { status: 'ERROR:Incomplete Data', slug: slug ?? 'N/A' };
    }

    // 1. --- Determinação de Caminhos ---
    // Caminho final: {loreBaseOutputFolder}/{entityClass}/
    const subfolder = entityClass; 
    const outputFolder = path.join(loreBaseOutputFolder, subfolder); 
    const outputFilename = `${id}.md`; 
    const outputFilePath = path.join(outputFolder, outputFilename);

    // 2. --- Processamento da Imagem de Capa Local ---
    let imageReference = '';
    if (cover && cover.url) {
        const match = cover.url.match(COVER_URL_REGEX);
        const coverFileName = match ? match[1] : null;

        if (coverFileName) {
            // Caminho relativo para a imagem (../../img/ é necessário para voltar da pasta EntityClass e da pasta 'lore')
            const relativeImgPath = path.join('..', '..', 'img', coverFileName).replace(/\\/g, '/');
            imageReference = `![${title}](${relativeImgPath})\n\n`;
        }
    }

    // 3. --- Transformação do Conteúdo ---
    const markdownContent = transformContentToMarkdown(content);
    const articleMetadata = {title: title, slug:slug};
    const frontmatter = parseMetadataToFrontmatter(articleMetadata);
    // 4. --- Montagem do Arquivo ---
    const articleBody = `${imageReference}# ${title}\n\n${markdownContent}`;
    const finalContent = frontmatter+articleBody;
    // 5. --- I/O de Arquivo ---
    try {
        // Cria a pasta {loreBaseOutputFolder}/{entityClass}
        await fs.mkdir(outputFolder, { recursive: true });
        await fs.writeFile(outputFilePath, finalContent, 'utf8');

        console.log(`  - SUCESSO: Artigo '${title}' salvo em: ${path.join(path.basename(loreBaseOutputFolder), subfolder, outputFilename)}`);
        
        // Retorna status de sucesso (sem código HTTP)
        return { status: 'SUCCESS', slug: slug }; 
        
    } catch (error) {
        console.error(`  - ERRO: Falha ao escrever o arquivo ${outputFilePath}: ${error.message}`);
        return { status: `ERROR:Write Failed (${error.message})`, slug: slug };
    }
}


/**
 * Função principal que implementa o pipeline de extração de Lore de 3 FASES.
 * * @param {string} sourceDir O diretório contendo os JSONs.
 * @param {string} loreBaseOutputFolder O caminho completo de saída para a pasta 'lore' (calculado por runCommand).
 * @param {Object} options As opções passadas pelo commander (opcional, mas mantido para o padrão handler).
 */
async function getLoreData(sourceDir, loreBaseOutputFolder, options) {
    console.log(`\nIniciando extração de Lore de: ${sourceDir}`);
    console.log(`Diretório de saída de Lore: ${loreBaseOutputFolder}`); 
    
    const logResults = [];
    const executionTasks = []; 

    try {
        console.log(`Verificando/Criando diretório base de Lore: ${loreBaseOutputFolder}`);
        await fs.mkdir(loreBaseOutputFolder, { recursive: true });

        // --- FASE 1: LEITURA CONCORRENTE, VERIFICAÇÃO DE EXISTÊNCIA E FILTRAGEM ---
        console.log('\n--- FASE 1: Lendo JSONs, Verificando Entidades e Existência ---');

        const results = await readAllJsons(sourceDir);
        console.log(`Arquivos JSON lidos e analisados: ${results.length}`);

        // Filtragem e Geração de Tarefas
        for (const data of results) {
            
            const { error, jsonFilename} = data;
            if (error || !data) {
                logResults.push({ status: 'ERROR', entityClass: 'N/A', slug: 'N/A', jsonFilename});
                continue;
            }

            const { id, slug, entityClass, title, content } = data;
            
            if (!id || !slug || !entityClass || !title || !content) {
                // Se algum campo essencial estiver faltando (é null, undefined, 0, false, ou string vazia)
                logResults.push({ 
                    status: 'ERROR:Incomplete Data', 
                    entityClass: entityClass ?? 'N/A', 
                    slug: slug ?? 'N/A', 
                    jsonFilename 
                });
                // Imprime a mensagem de erro no console ANTES de pular
                console.error(`  - ERRO: Artigo '${title ?? 'untitled'}' (ID: ${id}) pulado: Dados incompletos ou nulos.`);
                continue;
            }
                                    
            // A. Verificação de Template (Rule: Apenas 'Article' é suportado)
            if (entityClass !== 'Article') {                
                logResults.push({ status: 'NO_TEMPLATE', entityClass, slug:slug??'N/A', jsonFilename });
                continue;
            }
            
            // B. Verificação de Existência (Regra: Skip se o arquivo Markdown existir)
            const outputFolder = path.join(loreBaseOutputFolder, entityClass || DEFAULT_FALLBACK_FOLDER);
            const outputFilename = `${id}.md`;
            const outputFilePath = path.join(outputFolder, outputFilename);
                        
            try {
                // Tenta acessar o arquivo final
                await fs.access(outputFilePath); 
                
                // Se o acesso for bem-sucedido, o arquivo existe
                logResults.push({ status: 'SKIPPED', entityClass, slug, jsonFilename });
                continue;
            } catch (e) {                
                // Se for ENOENT, o código prossegue para a fila de execução.
                if (e.code !== 'ENOENT') {
                    // Outro erro inesperado do sistema de arquivos (permissão negada, etc.)
                    logResults.push({ status: `ERROR:Access Failed (${e.message})`, entityClass, slug, jsonFilename });
                    console.error(`  - ERRO: Falha inesperada de acesso ao arquivo ${outputFilePath}: ${e.message}`);
                    continue;
                }                
            }

            // C. Adiciona à fila de execução
            executionTasks.push({ data, entityClass, jsonFilename, loreBaseOutputFolder });
        }
        
        console.log(`Tarefas prontas para execução (não skipped/no_template): ${executionTasks.length}`);


        // --- FASE 2: EXECUÇÃO DO PROCESSAMENTO ---
        console.log('\n--- FASE 2: Processando Artigos Pendentes ---');

        const processingLimit = pLimit(MAX_CONCURRENT_PROCESSING); 
        
        const executionPromises = executionTasks.map(task => {
            return processingLimit(async () => {
                // Chama processLoreArticle com o caminho completo de saída da pasta 'lore'
                const result = await processLoreArticle(task.data, task.entityClass, task.loreBaseOutputFolder);

                // Mapeia o resultado do processamento para o log                
                logResults.push({ 
                    status: result.status, 
                    entityClass: task.entityClass, 
                    slug: result.slug, 
                    jsonFilename: task.jsonFilename 
                });
                
                if (result.status.startsWith('SUCCESS')) {
                    // O console.log de sucesso já está dentro de processLoreArticle
                } else if (result.status.startsWith('ERROR')) {
                    console.error(`  - ERRO: Falha ao processar ${task.data.title}: ${result.status}`);
                }
            });
        });

        await Promise.all(executionPromises);
        console.log('\nProcessamento de artigos concluído.');


        // --- FASE 3: GERAÇÃO DO LOG FINAL ---
        console.log('--- FASE 3: Gerando Log de Resultados ---');

        const logFileName = generateUniqueLogName();
        const logDirectory = path.dirname(loreBaseOutputFolder);
        const logFilePath = path.join(logDirectory, logFileName);        
        await fs.mkdir(logDirectory, { recursive: true });               

        // Formato: status | entityClass | slug | jsonFilename
        const logHeader = `STATUS | ENTITY_CLASS | SLUG | JSON_FILENAME\n${'-'.repeat(80)}\n`;        
        const logContent = logHeader + logResults
            .map(r => `${r.status.padEnd(10)} | ${r.entityClass.padEnd(12)} | ${r.slug.padEnd(25)} | ${r.jsonFilename}`)
            .join('\n');

        await fs.writeFile(logFilePath, logContent, 'utf8');
        console.log(`Log de resultados escrito em: ${logFilePath}`);
        
    } catch (error) {
        console.error(`\nErro geral ao executar getLoreData:`, error.message);
        throw error;
    }
}

module.exports = {
    getLoreData
};